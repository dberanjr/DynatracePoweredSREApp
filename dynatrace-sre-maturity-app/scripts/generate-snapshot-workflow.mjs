// Generates workflow scripts from the app's own queries, so the app and the workflows cannot drift.
//
//   node scripts/generate-snapshot-workflow.mjs           write the generated files
//   node scripts/generate-snapshot-workflow.mjs --check   exit 1 if a generated file is out of date
//
// WHY: a workflow cannot import app code, so its queries used to be hand-copied duplicates of the app's.
// The copies drifted: the deployed snapshot workflow ran stale L1-L4 logic and, separately, failed on every
// scheduled run for a month. Generating the scripts makes the app (the source) and the workflows (the
// copies) identical by construction, and --check makes any drift visible.
//
// INPUT:   ui/app/queries/maturityQueries.ts, loaded with Node's built-in TypeScript type stripping
//          (so Node 24+ is required), plus one script template per workflow in workflows/.
// TARGETS: see TARGETS below. Each rewrites only the script of one task in a workflow JSON (what dtctl
//          deploys) and, where a readable twin exists, the script block of its YAML.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const q = await import(pathToFileURL(join(root, "ui/app/queries/maturityQueries.ts")).href);

// A DQL string as a JS template literal: escape what a template literal would otherwise interpret.
const toTemplateLiteral = (s) => "`" + s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";

const TARGETS = [
  {
    name: "daily snapshot",
    template: "workflows/sre-maturity-daily-snapshot.script.template.js",
    json: "workflows/sre-maturity-daily-snapshot.workflow.json",
    yaml: "workflows/sre-maturity-daily-snapshot.yaml",
    task: "mergeAndIngest",
    placeholder: "__QUERIES__",
    // The leaderboard's five bulk queries, embedded as the snapshot's scoring queries.
    fill: () =>
      "const QUERIES = {\n" +
      [1, 2, 3, 4, 5]
        .map((n) => {
          const query = q[`BULK_L${n}_QUERY`];
          if (typeof query !== "string" || !query) throw new Error(`BULK_L${n}_QUERY missing from maturityQueries.ts`);
          return `  l${n}: ${toTemplateLiteral(query)},`;
        })
        .join("\n") +
      "\n};",
  },
  {
    name: "critical services refresh",
    template: "workflows/refresh-lookups-critical-services.script.template.js",
    json: "workflows/refresh-lookups-critical-services-entity-severity-resolved-to-entity-ids.workflow.json",
    task: "build_critical_services_lookup",
    placeholder: "__APPCI_RESOLVER__",
    // The three places this workflow turns tags into an AppCI. Same logic as the app's queries.
    fill: () =>
      [
        // spans -> service: the service's own tags, in a join where `tags` and `applicationci` are taken
        ["APPCI_FROM_SPAN_SERVICE_TAGS", q.appciFromEntityTags({ tagsField: "id_tags", outField: "id_appcis", prefix: "idAppci" })],
        // services by name
        ["APPCI_FROM_SERVICE_TAGS", q.appciFromEntityTags()],
        // any other Smartscape node by name: its Application tag (a map value, not a list) through the AppCI map
        ["APPCI_FROM_TAG_MAP", q.appciMappedFromTagValue("coalesce(tags[Application], tags[application])", "smapName", "smapMapped")],
      ]
        .map(([name, dql]) => `const ${name} = ${toTemplateLiteral(dql)};`)
        .join("\n\n"),
  },
];

const stale = [];
const writes = [];

for (const t of TARGETS) {
  const template = readFileSync(join(root, t.template), "utf8");
  if (template.split(t.placeholder).length !== 2) throw new Error(`${t.template} must contain ${t.placeholder} exactly once`);
  const script = template.replace(t.placeholder, () => t.fill());

  // JSON: replace only this task's script field; keep the file's own trailing-newline convention.
  const jsonPath = join(root, t.json);
  const jsonRaw = readFileSync(jsonPath, "utf8");
  const wf = JSON.parse(jsonRaw);
  const task = wf.tasks?.[t.task];
  if (!task?.input) throw new Error(`${t.json} has no tasks.${t.task}.input`);
  const jsonText =
    JSON.stringify({ ...wf, tasks: { ...wf.tasks, [t.task]: { ...task, input: { ...task.input, script } } } }, null, 2) +
    (jsonRaw.endsWith("\n") ? "\n" : "");
  if (jsonRaw !== jsonText) stale.push(t.json);
  writes.push([jsonPath, jsonText]);

  // YAML twin (optional): everything up to `script: |` stays; the block after it is rewritten.
  if (t.yaml) {
    const yamlPath = join(root, t.yaml);
    const yaml = readFileSync(yamlPath, "utf8");
    const m = yaml.match(/^( *)script: \|\n/m);
    if (!m) throw new Error(`${t.yaml} has no \`script: |\` block`);
    const pad = " ".repeat(m[1].length + 2);
    const body = script
      .replace(/\s+$/, "")
      .split("\n")
      .map((l) => (l.length ? pad + l : ""))
      .join("\n");
    const yamlText = yaml.slice(0, m.index + m[0].length) + body + "\n";
    if (yaml !== yamlText) stale.push(t.yaml);
    writes.push([yamlPath, yamlText]);
  }
}

if (check) {
  if (stale.length) {
    console.error("[generate-workflows] out of date:\n  " + stale.join("\n  ") + "\nRun: npm run generate:workflows");
    process.exit(1);
  }
  console.log("[generate-workflows] up to date");
} else {
  for (const [path, text] of writes) writeFileSync(path, text);
  console.log(stale.length ? `[generate-workflows] updated: ${stale.join(", ")}` : "[generate-workflows] already up to date");
}
