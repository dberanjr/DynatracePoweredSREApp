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
// SETTINGS: default = the original deployment; --config <exported settings JSON> = a customer's identifier,
//          lookup paths and column mapping. Placeholders in the templates: __APPCI__ (identifier field),
//          __CLOUD_TAG__ (cloud tag key), __PATH__ / __ID_COL__ / __SLO_COL__ (this workflow's lookup).

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
// Settings. maturityQueries.ts reads the app's settings (identifier field, lookup paths and column mapping)
// from a global the app publishes at startup; do the same here so generated workflows match the app.
//   default                         the original deployment (applicationci, /lookups/* paths)
//   --config settings.json          the settings JSON the app stores (Settings page -> "Export settings"),
//                                   or just { "appCiField": "...", "lookups": { ... } }
const core = await import(pathToFileURL(join(root, "ui/app/settings/lookupDefs.ts")).href);
const configArg = process.argv.indexOf("--config");
let sreConfig = core.defaultConfig();
if (configArg > 0) {
  const stored = JSON.parse(readFileSync(process.argv[configArg + 1], "utf8"));
  const field = typeof stored.appCiField === "string" && stored.appCiField.trim() ? stored.appCiField.trim() : core.DEFAULT_APPCI_FIELD;
  sreConfig = core.resolveConfig(field, core.normalizeLookupSettings(stored.lookups), core.normalizeCatalogSettings(stored.catalog), typeof stored.cloudTagKey === "string" ? stored.cloudTagKey : "", core.normalizeIdMaxLength(stored.appCiMaxLength));
}
globalThis[core.CONFIG_GLOBAL_KEY] = sreConfig;
const q = await import(pathToFileURL(join(root, "ui/app/queries/maturityQueries.ts")).href);

// A DQL string as a JS template literal: escape what a template literal would otherwise interpret.
const toTemplateLiteral = (s) => "`" + s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";

const settingsOf = (key) => {
  const stored = configArg > 0 ? JSON.parse(readFileSync(process.argv[configArg + 1], "utf8")).lookups?.[key] : undefined;
  const merged = core.normalizeLookupSettings(stored ? { [key]: stored } : {})[key];
  const resolve = (c) => (c === core.APPCI_TOKEN ? sreConfig.appciField : c);
  return { path: merged.path, col: (f) => resolve(merged.columns[f]) };
};

const fill = (script, vars) => {
  let out = script;
  for (const [k, v] of Object.entries(vars)) out = out.split(k).join(v);
  const left = out.match(/__[A-Z_]+__/g);
  if (left) throw new Error(`unfilled placeholder(s): ${[...new Set(left)].join(", ")}`);
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
    vars: () => {
      // Used as a bare JS property name (`r.utan`, `utan: appci`) in the snapshot script.
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(sreConfig.appciField)) throw new Error(`daily snapshot: identifier field "${sreConfig.appciField}" must be a plain identifier`);
      return { __APPCI__: sreConfig.appciField };
    },
  },
  {
    name: "critical services refresh",
    yaml: "workflows/refresh-lookups-critical-services-entity-severity-resolved-to-entity-ids.workflow-template.yaml",
    template: "scripts/workflow-scripts/refresh-lookups-critical-services.script.template.js",
    placeholder: "__APPCI_RESOLVER__",
    // The three places this workflow turns tags into an AppCI. Same logic as the app's queries.
    fill: () =>
      [
        ["APPCI_FROM_SPAN_SERVICE_TAGS", q.appciFromEntityTags({ tagsField: "id_tags", outField: "id_appcis", prefix: "idAppci" })],
        ["APPCI_FROM_SERVICE_TAGS", q.appciFromEntityTags()],
        ["APPCI_FROM_TAG_MAP", q.appciMappedFromTagValue("coalesce(tags[Application], tags[application])", "smapName", "smapMapped")],
      ]
        .map(([name, dql]) => `const ${name} = ${toTemplateLiteral(dql)};`)
        .join("\n\n"),
    vars: () => {
      const s = settingsOf("criticalServices");
      return { __APPCI__: sreConfig.appciField, __CLOUD_TAG__: sreConfig.cloudTagKey, __PATH__: s.path, __ID_COL__: s.col("appId") };
    },
  },
  {
    name: "guardians refresh",
    yaml: "workflows/refresh-lookups-guardians-srg-by-appci.workflow-template.yaml",
    template: "scripts/workflow-scripts/refresh-lookups-guardians.script.template.js",
    vars: () => {
      const s = settingsOf("guardians");
      // Tag keys that identify the application on a guardian: the customer's own (identifier and cloud tag key)
      // plus the original "appci" shorthand. Compared lower-cased.
      const keys = [...new Set([sreConfig.appciField, sreConfig.cloudTagKey, "appci"].map((k) => k.toLowerCase()))];
      return { __TAG_KEY_TEST__: keys.map((k) => `k === '${k}'`).join(" || "), __PATH__: s.path, __ID_COL__: s.col("appId") };
    },
  },
  {
    name: "SLO dashboards refresh",
    yaml: "workflows/refresh-lookups-slo-dashboards-slo-dashboards-by-appci.workflow-template.yaml",
    template: "scripts/workflow-scripts/refresh-lookups-slo-dashboards.script.template.js",
    vars: () => {
      const s = settingsOf("sloDashboards");
      return { __PATH__: s.path, __ID_COL__: s.col("appId") };
    },
  },
  {
    name: "SLO refresh",
    yaml: "workflows/refresh-lookups-slo-slos-by-appci.workflow-template.yaml",
    template: "scripts/workflow-scripts/refresh-lookups-slo.script.template.js",
    vars: () => {
      const s = settingsOf("slo");
      return { __PATH__: s.path, __SLO_COL__: s.col("slo"), __SLO_ID_COL__: s.col("appId") ?? "", __APPCI__: sreConfig.appciField, __ID_MAX__: String(sreConfig.idMaxLength) };
    },
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
  script = fill(script, t.vars());
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
