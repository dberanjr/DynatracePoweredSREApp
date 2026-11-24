// Generates workflow scripts from the app's own queries, so the app and the workflows cannot drift.
//
//   node scripts/generate-snapshot-workflow.mjs           write the generated files
//   node scripts/generate-snapshot-workflow.mjs --check   exit 1 if a generated file is out of date
//   node scripts/generate-snapshot-workflow.mjs --config <settings.json> --out <dir>
//                                                          write one customer's workflows into <dir> and leave
//                                                          workflows/ (the generic defaults) untouched
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
//          lookup paths and column mapping. Placeholders in the templates: __APP_ID__ (identifier field),
//          __CLOUD_TAG__ (cloud tag key), __PATH__ / __ID_COL__ / __SLO_COL__ (this workflow's lookup).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const outIdx = process.argv.indexOf("--out");
const outDir = outIdx > 0 ? resolve(process.argv[outIdx + 1] ?? "") : null;
if (outIdx > 0 && (!process.argv[outIdx + 1] || check)) { console.error("--out needs a directory and cannot be combined with --check"); process.exit(2); }
// Settings. maturityQueries.ts reads the app's settings (identifier field, lookup paths and column mapping)
// from a global the app publishes at startup; do the same here so generated workflows match the app.
//   default                         the standard set (identifier appId, /lookups/dtsrepoweredapp/* paths)
//   --config settings.json          the settings JSON the app stores (Settings page -> "Export settings"),
//                                   or just { "appCiField": "...", "lookups": { ... } }
const core = await import(pathToFileURL(join(root, "ui/app/settings/lookupDefs.ts")).href);
const configArg = process.argv.indexOf("--config");
let sreConfig = core.defaultConfig();
if (configArg > 0) {
  const stored = JSON.parse(readFileSync(process.argv[configArg + 1], "utf8"));
  const field = typeof stored.appCiField === "string" && stored.appCiField.trim() ? stored.appCiField.trim() : core.DEFAULT_APP_ID_FIELD;
  sreConfig = core.resolveConfig(field, core.normalizeLookupSettings(stored.lookups), core.normalizeCatalogSettings(stored.catalog), typeof stored.cloudTagKey === "string" ? stored.cloudTagKey : "", core.normalizeIdMaxLength(stored.appCiMaxLength));
}
globalThis[core.CONFIG_GLOBAL_KEY] = sreConfig;
const q = await import(pathToFileURL(join(root, "ui/app/queries/maturityQueries.ts")).href);

// A DQL string as a JS template literal: escape what a template literal would otherwise interpret.
const toTemplateLiteral = (s) => "`" + s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";

const settingsOf = (key) => {
  const stored = configArg > 0 ? JSON.parse(readFileSync(process.argv[configArg + 1], "utf8")).lookups?.[key] : undefined;
  const merged = core.normalizeLookupSettings(stored ? { [key]: stored } : {})[key];
  const resolve = (c) => (c === core.APP_ID_TOKEN ? sreConfig.appIdField : c);
  return { path: merged.path, col: (f) => resolve(merged.columns[f]) };
};

// The one table a customer supplies: where it is, and which of its columns hold what. Optional "catalogSource" block
// of the settings JSON:
//   { "path": "/lookups/<theirs>", "columns": { "appId": "utan", "name": "SNOW_app_name", "tier": "top_tier", ... },
//     "passThrough": ["extra column", ...], "activeTagKeys": ["extra.smartscape/tag"], "activeWindow": "24h" }
// A column left out is assumed to have the app's own name; "" = the customer's table has no such column.
const catalogSource = () => {
  const given = (configArg > 0 ? JSON.parse(readFileSync(process.argv[configArg + 1], "utf8")).catalogSource : undefined) ?? {};
  const okName = (v, what) => {
    if (typeof v !== "string" || /[`"'\\\r\n^]/.test(v)) throw new Error(`catalogSource: invalid ${what} "${v}"`);
    return v.trim();
  };
  const fields = core.LOOKUP_DEFS.cmdb.fields;
  const columns = {};
  for (const [f, d] of Object.entries(fields)) {
    const out = d.canonical === core.APP_ID_TOKEN ? sreConfig.appIdField : d.canonical;
    columns[out] = okName(given.columns?.[f] ?? out, `column for ${f}`);
  }
  const path = typeof given.path === "string" && given.path.trim() ? given.path.trim() : `${core.LOOKUP_FOLDER}/app_source`;
  if (!/^\/lookups\/[A-Za-z0-9_\-./]+$/.test(path)) throw new Error(`catalogSource: invalid path "${path}"`);
  const tagKeys = [...new Set([sreConfig.appIdField, sreConfig.cloudTagKey, ...(given.activeTagKeys ?? [])].map((k) => okName(k, "tag key")).filter(Boolean))];
  const window = /^\d+[hd]$/.test(given.activeWindow ?? "24h") ? given.activeWindow ?? "24h" : (() => { throw new Error('catalogSource.activeWindow must look like "24h" or "7d"'); })();
  return { path, columns, passThrough: (given.passThrough ?? []).map((c) => okName(c, "pass-through column")), tagKeys, window };
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
      // Used as a bare JS property name (`r.utan`, `utan: appId`) in the snapshot script.
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(sreConfig.appIdField)) throw new Error(`daily snapshot: identifier field "${sreConfig.appIdField}" must be a plain identifier`);
      return { __APP_ID__: sreConfig.appIdField };
    },
  },
  {
    name: "application catalog",
    yaml: "workflows/refresh-application-catalog.workflow-template.yaml",
    template: "scripts/workflow-scripts/refresh-application-catalog.script.template.js",
    vars: () => {
      const src = catalogSource();
      return {
        __SOURCE_PATH__: src.path,
        __DEST_PATH__: settingsOf("cmdb").path,
        __WINDOW__: `now()-${src.window}`,
        __ID_MAX__: String(sreConfig.idMaxLength),
        __TAG_KEYS__: JSON.stringify(src.tagKeys),
        __SOURCE_COLUMNS__: JSON.stringify(src.columns, null, 2).replace(/\n/g, "\n"),
        __PASS_THROUGH__: JSON.stringify(src.passThrough),
      };
    },
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
    vars: () => {
      const s = settingsOf("criticalServices");
      // Lookup locations are fixed (core.LOOKUP_FOLDER); the seed table's ID column is named after the identifier.
      return {
        __APP_ID__: sreConfig.appIdField,
        __CLOUD_TAG__: sreConfig.cloudTagKey,
        __PATH__: s.path,
        __ID_COL__: s.col("appId"),
        __SEED_PATH__: core.DEFAULT_ENTITY_SEVERITY_PATH,
        __SEED_ID_COL__: sreConfig.appIdField,
      };
    },
  },
  {
    name: "guardians refresh",
    yaml: "workflows/refresh-lookups-guardians-srg-by-app-id.workflow-template.yaml",
    template: "scripts/workflow-scripts/refresh-lookups-guardians.script.template.js",
    vars: () => {
      const s = settingsOf("guardians");
      // Tag keys that identify the application on a guardian: the customer's own (identifier and cloud tag key)
      // plus the original "appci" shorthand. Compared lower-cased.
      const keys = [...new Set([sreConfig.appIdField, sreConfig.cloudTagKey, "appci"].map((k) => k.toLowerCase()))];
      return { __TAG_KEY_TEST__: keys.map((k) => `k === '${k}'`).join(" || "), __PATH__: s.path, __ID_COL__: s.col("appId") };
    },
  },
  {
    name: "SLO dashboards refresh",
    yaml: "workflows/refresh-lookups-slo-dashboards-slo-dashboards-by-app-id.workflow-template.yaml",
    template: "scripts/workflow-scripts/refresh-lookups-slo-dashboards.script.template.js",
    vars: () => {
      const s = settingsOf("sloDashboards");
      return { __PATH__: s.path, __ID_COL__: s.col("appId") };
    },
  },
  {
    name: "SLO refresh",
    yaml: "workflows/refresh-lookups-slo-slos-by-app-id.workflow-template.yaml",
    template: "scripts/workflow-scripts/refresh-lookups-slo.script.template.js",
    vars: () => {
      const s = settingsOf("slo");
      return { __PATH__: s.path, __SLO_COL__: s.col("slo"), __SLO_ID_COL__: s.col("appId") ?? "", __APP_ID__: sreConfig.appIdField, __ID_MAX__: String(sreConfig.idMaxLength) };
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
  // With --out the committed template is only the source; the customer's copy always gets the generated script.
  writes.push(outDir ? [join(outDir, basename(yamlPath)), next] : [yamlPath, current === script.replace(/\s+$/, "") ? yaml : next]);
}

if (check) {
  if (stale.length) {
    console.error("[generate-workflows] out of date:\n  " + stale.join("\n  ") + "\nRun: npm run generate:workflows");
    process.exit(1);
  }
  console.log("[generate-workflows] up to date");
} else {
  if (outDir) mkdirSync(outDir, { recursive: true });
  for (const [path, text] of writes) writeFileSync(path, text);
  if (outDir) console.log(`[generate-workflows] wrote ${writes.length} workflow(s) to ${outDir}`);
  else console.log(stale.length ? `[generate-workflows] updated: ${stale.join(", ")}` : "[generate-workflows] already up to date");
}
