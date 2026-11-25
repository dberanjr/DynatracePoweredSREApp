// Deploys workflows/*.workflow-template.yaml to a Dynatrace tenant with dtctl.
//
//   node scripts/deploy-workflows.mjs --context <dtctl-context> [options]
//
//   --context <name>   dtctl context (tenant) to deploy to. Required, so a deploy never lands on whatever
//                      context happens to be the default.
//   --dir <path>       folder of *.workflow-template.yaml to deploy (repeatable; default: workflows/). A later --dir wins when
//                      two files have the same title.
//   --only <text>      only templates whose file name or workflow title contains <text> (repeatable)
//   --run              run each deployed workflow once and wait for it (in dependency order: lookups first,
//                      the daily snapshot last)
//   --dry-run          show what would be created or updated; changes nothing
//
// WHY: the templates keep the workflow under a `workflow:` key with a `metadata:` wrapper, which `dtctl apply`
// treats as a dashboard. This flattens the `workflow:` block into a temp file, adds the `id` of the workflow
// that already has the same title (so it updates in place instead of creating a duplicate), and applies it.
// Run `npm run generate:workflows` first if you changed settings.

import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const values = (n) => args.flatMap((a, i) => (a === n && args[i + 1] ? [args[i + 1]] : []));
const context = values("--context")[0];
const only = values("--only");
const dirs = values("--dir").length ? values("--dir").map((d) => resolve(d)) : [join(root, "workflows")];
const dryRun = flag("--dry-run");
const runAfter = flag("--run");

if (!context) {
  console.error("Missing --context <dtctl-context>. List them with: dtctl config get-contexts");
  process.exit(2);
}

function dtctl(cmdArgs, { json = false } = {}) {
  const r = spawnSync("dtctl", ["--context", context, ...cmdArgs, ...(json ? ["-o", "json"] : [])], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw new Error(`dtctl failed to start: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`dtctl ${cmdArgs.join(" ")} failed:\n${r.stdout}${r.stderr}`);
  return json ? JSON.parse(r.stdout) : r.stdout;
}

const order = (file) => (file.includes("daily-snapshot") ? 3 : file.includes("critical-services") ? 2 : 1);
// (order: catalog and other lookups, then critical services, which reads the seed table, then the snapshot)
const allTemplates = dirs
  .flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith(".workflow-template.yaml"))
      .map((file) => {
        const doc = YAML.parse(readFileSync(join(dir, file), "utf8"));
        if (!doc?.workflow?.title) throw new Error(`${join(dir, file)}: no workflow.title`);
        return { file, workflow: doc.workflow };
      }),
  )
  // Lookups first, the snapshot (which reads them) last.
  .sort((a, b) => order(a.file) - order(b.file) || a.file.localeCompare(b.file))
  .filter((t) => !only.length || only.some((o) => t.file.includes(o) || t.workflow.title.includes(o)));

// A workflow with the same title in a later --dir replaces the earlier one (a customer's catalog replaces the standard one).
const templates = [...new Map(allTemplates.map((t) => [t.workflow.title, t])).values()].sort((a, b) => order(a.file) - order(b.file) || a.file.localeCompare(b.file));

if (!templates.length) {
  console.error("No workflow templates matched.");
  process.exit(2);
}

// Workflows deployed under an earlier title keep working: match them by the old title once, and the update renames
// them in place.
const LEGACY_TITLES = {
  "DT-SRE APP: Refresh /lookups/dtsrepoweredapp/slo (SLOs by AppId)": ["Refresh /lookups/slo (SLOs by AppCI)", "SRE App: Refresh SLOs lookup"],
  "DT-SRE APP: Refresh /lookups/dtsrepoweredapp/slo_dashboards (SLO dashboards by AppId)": ["Refresh /lookups/slo-dashboards (SLO dashboards by AppCI)", "SRE App: Refresh SLO dashboards lookup"],
  "DT-SRE APP: Refresh /lookups/dtsrepoweredapp/guardians (SRG by AppId)": ["Refresh /lookups/guardians (SRG by AppCI)", "SRE App: Refresh guardians lookup"],
  "DT-SRE APP: Refresh /lookups/dtsrepoweredapp/critical_services (entity_severity resolved to entity IDs)": ["Refresh /lookups/critical_services (entity_severity resolved to entity IDs)", "SRE App: Refresh critical services lookup"],
  "DT-SRE APP: Build /lookups/dtsrepoweredapp/cmdb (application catalog from your AppId source table)": ["Refresh /lookups/utan_active (UTANs with live entities)", "SRE App: Refresh application catalog (active UTANs)", "SRE App: Build application catalog"],
  "DT-SRE APP: Daily Maturity Snapshot (one bizevent per AppId)": ["SRE Maturity Daily Snapshot"],
};

// Existing workflows on the tenant, by title. Two with the same title would make the target ambiguous.
const existing = new Map();
for (const w of dtctl(["get", "workflows"], { json: true }).result ?? []) {
  existing.set(w.title, [...(existing.get(w.title) ?? []), w.id]);
}

const tmp = mkdtempSync(join(tmpdir(), "sre-workflows-"));
const failures = [];
try {
  for (const { file, workflow } of templates) {
    const ids = [workflow.title, ...(LEGACY_TITLES[workflow.title] ?? [])].flatMap((t) => existing.get(t) ?? []);
    if (ids.length > 1) {
      failures.push(`${workflow.title}: ${ids.length} workflows share this title (${ids.join(", ")}); delete the extras and retry`);
      continue;
    }
    const id = ids[0];
    const flat = join(tmp, file.replace(".workflow-template.yaml", ".yaml"));
    writeFileSync(flat, YAML.stringify(id ? { id, ...workflow } : workflow));
    try {
      dtctl(["apply", "-f", flat, ...(dryRun ? ["--dry-run"] : [])]);
      console.log(`${dryRun ? "[dry-run] would " : ""}${id ? "update" : "create"}  ${workflow.title}${id ? `  (${id})` : ""}`);
      if (runAfter && !dryRun) {
        const target = id ?? dtctl(["get", "workflows"], { json: true }).result.find((w) => w.title === workflow.title)?.id;
        const out = JSON.parse(dtctl(["exec", "workflow", target, "--wait"]));
        const state = out.result?.state;
        console.log(`  run: ${state} (${out.result?.duration ?? "?"})`);
        if (state !== "SUCCESS") failures.push(`${workflow.title}: run ended ${state}; see: dtctl logs wfe ${out.result?.executionId}`);
      }
    } catch (e) {
      failures.push(`${workflow.title}: ${String(e.message).split("\n").slice(0, 6).join("\n")}`);
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
