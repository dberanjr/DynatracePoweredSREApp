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
//          (so Node 24+ is required), plus one script template per workflow in scripts/workflow-scripts/.
// TARGETS: workflows/*.workflow-template.yaml. Each target rewrites only the `script` of the workflow's one
//          task and leaves the rest of the YAML byte for byte as it was.
// GENERIC: every workflow is identical for all customers. Their queries carry markers and placeholders (__TAGHIT__(...),
//          __APPIDKEY__, __CLOUDTAGKEY__, __IDMAX__) that each workflow fills in at run time from
//          /lookups/dtsrepoweredapp/config, which the app's Settings page writes. The catalog workflow also reads its source
//          table and column mapping from there.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
// maturityQueries.ts reads the app's settings from a global the app publishes at startup. For workflows the
// customer's identifier is not known when the script is generated, so generate with placeholders; the workflow fills
// them in at run time (see scripts/workflow-scripts/_runtime-config.snippet.js).
const core = await import(pathToFileURL(join(root, "ui/app/settings/lookupDefs.ts")).href);
const sreConfig = core.resolveConfig(["__APPIDKEY__"], core.defaultLookupSettings(), core.defaultCatalogSettings(), "__CLOUDTAGKEY__", 3, true);
sreConfig.idMaxLength = "__IDMAX__";
globalThis[core.CONFIG_GLOBAL_KEY] = sreConfig;
const q = await import(pathToFileURL(join(root, "ui/app/queries/maturityQueries.ts")).href);

// A DQL string as a JS template literal: escape what a template literal would otherwise interpret.
const toTemplateLiteral = (s) => "`" + s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";

const pathOf = (key) => core.LOOKUP_DEFS[key].defaultPath;

// Left in the generated script on purpose; the workflow fills them in at run time.
const RUNTIME_PLACEHOLDERS = new Set(["__APPIDKEY__", "__CLOUDTAGKEY__", "__IDMAX__", "__TAGHIT__"]);
const RUNTIME_SNIPPET = readFileSync(join(root, "scripts/workflow-scripts/_runtime-config.snippet.js"), "utf8").replace(/\s+$/, "");

const fill = (script, vars) => {
  let out = script;
  for (const [k, v] of Object.entries(vars)) out = out.split(k).join(v);
  const left = (out.match(/__[A-Z_]+__/g) ?? []).filter((t) => !RUNTIME_PLACEHOLDERS.has(t));
  if (left.length) throw new Error(`unfilled placeholder(s): ${[...new Set(left)].join(", ")}`);
  return out;
};

const TARGETS = [
  {
    name: "daily snapshot",
    yaml: "workflows/sre-maturity-daily-snapshot.workflow-template.yaml",
    template: "scripts/workflow-scripts/sre-maturity-daily-snapshot.script.template.js",
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
    vars: () => ({ __SNAPSHOT_BUCKET__: core.SNAPSHOT_BUCKET }),
  },
  {
    name: "application catalog",
    yaml: "workflows/refresh-application-catalog.workflow-template.yaml",
    template: "scripts/workflow-scripts/refresh-application-catalog.script.template.js",
    vars: () => ({
      __DEST_PATH__: pathOf("cmdb"),
      // Settings field key -> catalog column, in the order the catalog is written; the first is the application ID.
      __FIELD_TO_OUT__: JSON.stringify(
        Object.fromEntries(Object.entries(core.LOOKUP_DEFS.cmdb.fields).map(([f, d]) => [f, d.canonical === core.APP_ID_TOKEN ? "appId" : d.canonical])),
      ),
    }),
  },
  {
    name: "entity_severity starter seed",
    yaml: "workflows/seed-entity-severity-starter-user-facing-services.workflow-template.yaml",
    template: "scripts/workflow-scripts/seed-entity-severity.script.template.js",
    placeholder: "__APP_ID_RESOLVER__",
    fill: () =>
      [
        ["APP_ID_FROM_SERVICE_TAGS", q.appIdFromEntityTags()],
        ["LOAD_CMDB", q.LOAD.cmdb],
      ]
        .map(([name, dql]) => `const ${name} = ${toTemplateLiteral(dql)};`)
        .join("\n\n"),
    vars: () => ({ __SEED_PATH__: core.DEFAULT_ENTITY_SEVERITY_PATH }),
  },
  {
    name: "critical services refresh",
    yaml: "workflows/refresh-lookups-critical-services-entity-severity-resolved-to-entity-ids.workflow-template.yaml",
    template: "scripts/workflow-scripts/refresh-lookups-critical-services.script.template.js",
    placeholder: "__APP_ID_RESOLVER__",
    // The three places this workflow turns tags into an application ID. Same logic as the app's queries.
    fill: () =>
      [
        ["APP_ID_FROM_SPAN_SERVICE_TAGS", q.appIdFromEntityTags({ tagsField: "id_tags", outField: "id_appIds", prefix: "idAppId" })],
        ["APP_ID_FROM_SERVICE_TAGS", q.appIdFromEntityTags()],
        ["APP_ID_FROM_TAG_MAP", q.appIdMappedFromTagValue("coalesce(tags[Application], tags[application])", "smapName", "smapMapped")],
      ]
        .map(([name, dql]) => `const ${name} = ${toTemplateLiteral(dql)};`)
        .join("\n\n"),
    vars: () => ({ __PATH__: pathOf("criticalServices"), __SEED_PATH__: core.DEFAULT_ENTITY_SEVERITY_PATH }),
  },
  {
    name: "guardians refresh",
    yaml: "workflows/refresh-lookups-guardians-srg-by-app-id.workflow-template.yaml",
    template: "scripts/workflow-scripts/refresh-lookups-guardians.script.template.js",
    vars: () => ({ __PATH__: pathOf("guardians") }),
  },
  {
    name: "SLO dashboards refresh",
    yaml: "workflows/refresh-lookups-slo-dashboards-slo-dashboards-by-app-id.workflow-template.yaml",
    template: "scripts/workflow-scripts/refresh-lookups-slo-dashboards.script.template.js",
    vars: () => ({ __PATH__: pathOf("sloDashboards") }),
  },
  {
    name: "SLO refresh",
    yaml: "workflows/refresh-lookups-slo-slos-by-app-id.workflow-template.yaml",
    template: "scripts/workflow-scripts/refresh-lookups-slo.script.template.js",
    vars: () => ({ __PATH__: pathOf("slo") }),
  },
];

const stale = [];
const writes = [];

for (const t of TARGETS) {
  let script = readFileSync(join(root, t.template), "utf8");
  if (t.placeholder) {
    if (script.split(t.placeholder).length !== 2) throw new Error(`${t.template} must contain ${t.placeholder} exactly once`);
    script = script.replace(t.placeholder, () => t.fill());
  }
  script = fill(script.replace("__RUNTIME_CONFIG__", () => RUNTIME_SNIPPET), t.vars());
  if (!script.endsWith("\n")) script += "\n";

  // Locate the task's `script` value in the YAML source and replace just that text as a block literal.
  const yamlPath = join(root, t.yaml);
  const yaml = readFileSync(yamlPath, "utf8");
  const doc = YAML.parseDocument(yaml);
  const tasks = doc.getIn(["workflow", "tasks"]);
  if (!tasks || tasks.items.length !== 1) throw new Error(`${t.yaml}: expected exactly one task`);
  const taskName = String(tasks.items[0].key.value ?? tasks.items[0].key);
  const node = doc.getIn(["workflow", "tasks", taskName, "input", "script"], true);
  if (!node?.range) throw new Error(`${t.yaml}: no tasks.${taskName}.input.script`);
  const lineStart = yaml.lastIndexOf("\n", node.range[0] - 1) + 1;
  const keyIndent = yaml.slice(lineStart).match(/^ */)[0].length;
  const pad = " ".repeat(keyIndent + 2);
  const body = script
    .replace(/\s+$/, "")
    .split("\n")
    .map((l) => (l.length ? pad + l : ""))
    .join("\n");
  // range[1] is the end of the value, range[2] the end including trailing line breaks; keep what follows.
  const next = yaml.slice(0, node.range[0]) + "|\n" + body + "\n" + yaml.slice(node.range[2]);
  const current = String(node.value).replace(/\s+$/, "");
  if (current !== script.replace(/\s+$/, "")) stale.push(t.yaml);
  writes.push([yamlPath, current === script.replace(/\s+$/, "") ? yaml : next]);
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
