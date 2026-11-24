// Deploys workflows/*.workflow-template.yaml to a Dynatrace tenant with dtctl.
//
//   node scripts/deploy-workflows.mjs --context <dtctl-context> --dir workflows/customers/<customer> [options]
//
//   --context <name>   dtctl context (tenant) to deploy to. Required, so a deploy never lands on whatever
//                      context happens to be the default.
//   --dir <path>       folder of *.workflow-template.yaml to deploy (repeatable; default: workflows/). Use the folder
//                      that `generate-snapshot-workflow.mjs --out` wrote for this customer.
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

const order = (file) => (file.includes("daily-snapshot") ? 2 : 1);
const templates = dirs
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

if (!templates.length) {
  console.error("No workflow templates matched.");
  process.exit(2);
}

// Existing workflows on the tenant, by title. Two with the same title would make the target ambiguous.
const existing = new Map();
for (const w of dtctl(["get", "workflows"], { json: true }).result ?? []) {
  existing.set(w.title, [...(existing.get(w.title) ?? []), w.id]);
}

const tmp = mkdtempSync(join(tmpdir(), "sre-workflows-"));
const failures = [];
try {
  for (const { file, workflow } of templates) {
    const ids = existing.get(workflow.title) ?? [];
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
