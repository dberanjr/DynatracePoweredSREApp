// One-time setup of the Grail bucket that stores the daily maturity snapshots, and the OpenPipeline route that sends them there.
//
//   node scripts/setup-snapshot-bucket.mjs --context <dtctl-context> [--retention 365] [--dry-run]
//
// WHY A SEPARATE BUCKET: the snapshot is one business event per application per day. In their own bucket they get their own retention,
// the app's trend query reads only that bucket (cheap), and records of a custom bucket can be deleted, which the default
// bizevents bucket does not allow.
//
// WHAT IT CREATES (each step is skipped if it already exists):
//   1. Grail bucket  dtsrepoweredapp_snapshots   (table: bizevents)
//   2. OpenPipeline (bizevents) custom pipeline "DT-SRE APP snapshots" whose storage stage assigns that bucket
//   3. One entry in the bizevents routing settings that sends event.type "workflow.summary.sre_maturity" to that pipeline.
//      The routing object is shared by the whole tenant: existing entries are kept untouched; only this one is added.
//
// NEEDS (the person running it, not the workflow's service user): bucket definition write access
// (storage:bucket-definitions:write) and settings write access for the OpenPipeline bizevents pipelines and routing schemas.

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import YAML from "yaml";

const BUCKET = "dtsrepoweredapp_snapshots"; // keep in sync with SNAPSHOT_BUCKET in ui/app/settings/lookupDefs.ts
const EVENT_TYPE = "workflow.summary.sre_maturity";
const PIPELINE_SCHEMA = "builtin:openpipeline.bizevents.pipelines";
const ROUTING_SCHEMA = "builtin:openpipeline.bizevents.routing";
const ROUTE_DESCRIPTION = "DT-SRE APP maturity snapshots";

const args = process.argv.slice(2);
const val = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const context = val("--context");
const retention = String(val("--retention") ?? 365);
const dryRun = args.includes("--dry-run");
if (!context) {
  console.error("Missing --context <dtctl-context>. List them with: dtctl config get-contexts");
  process.exit(2);
}
if (!/^\d+$/.test(retention) || Number(retention) < 1) {
  console.error("--retention must be a number of days");
  process.exit(2);
}

function dtctl(cmd, { json = false, allowFail = false } = {}) {
  const r = spawnSync("dtctl", ["--context", context, ...cmd, ...(json ? ["-o", "json"] : [])], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 && !allowFail) throw new Error(`dtctl ${cmd.join(" ")} failed:\n${r.stdout}${r.stderr}`);
  if (!json) return r.stdout;
  try { return JSON.parse(r.stdout); } catch { if (allowFail) return null; throw new Error(`dtctl ${cmd.join(" ")}: not JSON:\n${r.stdout}`); }
}
const say = (m) => console.log(`${dryRun ? "[dry-run] " : ""}${m}`);
const tmp = mkdtempSync(join(tmpdir(), "sre-bucket-"));

try {
  // 1. bucket
  const buckets = dtctl(["get", "buckets"], { json: true }).result ?? [];
  const bucket = buckets.find((b) => b.bucketName === BUCKET);
  if (bucket) {
    if (bucket.table !== "bizevents") throw new Error(`Bucket ${BUCKET} exists but holds table "${bucket.table}", not bizevents.`);
    say(`bucket ${BUCKET}: exists (retention ${bucket.retentionDays} days)`);
  } else {
    say(`bucket ${BUCKET}: creating (table bizevents, retention ${retention} days)`);
    dtctl(["create", "bucket", "--name", BUCKET, "--table", "bizevents", "--retention", retention, "--display-name", "DT-SRE APP maturity snapshots", ...(dryRun ? ["--dry-run"] : [])]);
  }

  // 2. pipeline
  const findPipeline = () => (dtctl(["get", "settings", "--schema", PIPELINE_SCHEMA, "--scope", "environment"], { json: true, allowFail: true })?.result ?? []).find((o) => o.value?.customId === BUCKET);
  let pipeline = findPipeline();
  if (pipeline) {
    say("pipeline: exists");
  } else {
    say("pipeline: creating");
    const file = join(tmp, "pipeline.yaml");
    writeFileSync(file, YAML.stringify({
      customId: BUCKET,
      displayName: "DT-SRE APP snapshots",
      storage: {
        processors: [{
          id: "assign-snapshot-bucket",
          type: "bucketAssignment",
          description: "Store the daily maturity snapshots in their own bucket",
          matcher: "true",
          enabled: true,
          bucketAssignment: { bucketName: BUCKET },
        }],
      },
    }));
    dtctl(["create", "settings", "-f", file, "--schema", PIPELINE_SCHEMA, "--scope", "environment", ...(dryRun ? ["--dry-run"] : [])]);
    if (!dryRun) {
      pipeline = findPipeline();
      if (!pipeline) throw new Error("The pipeline was created but cannot be read back; check settings read access for the OpenPipeline schemas.");
    }
  }

  // 3. route (add one entry to the shared routing object, keep every existing entry)
  const routing = (dtctl(["get", "settings", "--schema", ROUTING_SCHEMA, "--scope", "environment"], { json: true }).result ?? [])[0];
  if (!routing) throw new Error("No bizevents routing settings object found.");
  const entries = routing.value?.routingEntries ?? [];
  if (entries.some((e) => e.description === ROUTE_DESCRIPTION)) {
    say("route: exists");
  } else {
    say(`route: adding 1 entry to the routing object (${entries.length} existing entries are kept)`);
    const next = {
      objectId: routing.objectId,
      schemaId: ROUTING_SCHEMA,
      scope: "environment",
      value: {
        ...routing.value,
        routingEntries: [...entries, {
          description: ROUTE_DESCRIPTION,
          enabled: true,
          matcher: `event.type == "${EVENT_TYPE}"`,
          pipelineId: pipeline?.objectId ?? "<new pipeline id>",
          pipelineType: "custom",
        }],
      },
    };
    const file = join(tmp, "routing.yaml");
    writeFileSync(file, YAML.stringify(next));
    dtctl(["apply", "-f", file, ...(dryRun ? ["--dry-run"] : [])]);
  }
  say("done");
} catch (e) {
  const msg = String(e.message ?? e);
  console.error(`\nSetup stopped: ${msg.split("\n").slice(0, 4).join("\n")}`);
  if (/403|permission/i.test(msg)) {
    console.error("\nThe account behind this dtctl context lacks a permission. Creating the bucket needs storage:bucket-definitions:write; the pipeline and\nrouting need settings write access for the OpenPipeline bizevents schemas. Run this as a user with those, or ask an administrator.\nNothing after the failing step was changed.");
  }
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
