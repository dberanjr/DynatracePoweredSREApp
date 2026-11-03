// Fails if the readiness registry has drifted from the scorecard.
//
//   node scripts/check-readiness-registry.mjs        (also: npm run check:readiness)
//
// The Readiness page maps every scored check to the inputs it reads (ui/app/readiness/registry.ts). A check
// added or renamed in ui/app/components/checkDetailConfigs.ts without a matching entry would silently be
// missing from the page, so this compares the two lists. It also checks that every input a check names
// exists, and that every probe an input names exists in both the registry and the query module.
//
// The files are read as text on purpose: registry.ts imports app code that Node cannot resolve on its own.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const configs = read("ui/app/components/checkDetailConfigs.ts");
const registry = read("ui/app/readiness/registry.ts");
const queries = read("ui/app/queries/maturityQueries.ts");

// Scorecard checks: `  "3. Logs Correlated": {\n    level: "L1",` -> L1-3 "Logs Correlated"
const scorecard = [...configs.matchAll(/^ {2}"(\d+)\. ([^"]+)": \{\n {4}level: "(L\d)"/gm)].map((m) => ({ id: `${m[3]}-${m[1]}`, name: m[2] }));

// Registry checks, one per line in CHECKS.
const mapped = [...registry.matchAll(/\{ id: "(L\d-\d+)", level: "L\d", name: "([^"]+)", inputs: \[([^\]]*)\](, notImplemented: true)?(, naWhenAbsent: true)? \}/g)].map((m) => ({
  id: m[1],
  name: m[2],
  inputs: [...m[3].matchAll(/"(IN-\d+)"/g)].map((x) => x[1]),
  notImplemented: Boolean(m[4]),
}));

const inputIds = new Set([...registry.matchAll(/\{ id: "(IN-\d+)", name:/g)].map((m) => m[1]));
const inputProbes = [...registry.matchAll(/\{ id: "(IN-\d+)", name: "[^"]+", description: "[^"]*", fix: "[^"]*", probe: (?:"(\w+)"|null) \}/g)].map((m) => ({ id: m[1], probe: m[2] }));
const probeKeys = new Set([...registry.matchAll(/^ {4}key: "(\w+)",$/gm)].map((m) => m[1]));
const queryKeys = new Set([...queries.slice(queries.indexOf("export const READINESS_QUERIES")).matchAll(/^ {2}(\w+): `/gm)].map((m) => m[1]));

// Per-application pieces: the interpreters in registry.ts and the query builder in maturityQueries.ts.
const appInterpKeys = new Set([...registry.slice(registry.indexOf("export const APP_INTERPRETERS")).matchAll(/^ {2}(\w+): \(rec/gm)].map((m) => m[1]));
const appQueryKeys = new Set([...queries.slice(queries.indexOf("export const readinessAppQueries")).matchAll(/^ {4}(\w+): `/gm)].map((m) => m[1]));

const problems = [];
if (inputProbes.length !== inputIds.size) problems.push(`read ${inputIds.size} inputs but only ${inputProbes.length} in full (a field order or quoting change in INPUTS?), so probe names were not checked`);
if (scorecard.length === 0) problems.push("could not read any checks from checkDetailConfigs.ts (has its layout changed?)");
if (mapped.length === 0) problems.push("could not read any checks from registry.ts CHECKS");

const byId = new Map(mapped.map((c) => [c.id, c]));
for (const c of scorecard) {
  const m = byId.get(c.id);
  if (!m) problems.push(`scorecard check ${c.id} "${c.name}" has no entry in registry.ts CHECKS`);
  else if (m.name !== c.name) problems.push(`check ${c.id} is named "${c.name}" in the scorecard but "${m.name}" in the registry`);
}
const scoreIds = new Set(scorecard.map((c) => c.id));
for (const c of mapped) if (!scoreIds.has(c.id)) problems.push(`registry check ${c.id} "${c.name}" is not a scorecard check`);
for (const c of mapped) {
  if (!c.notImplemented && c.inputs.length === 0) problems.push(`check ${c.id} reads no input but is not marked notImplemented`);
  for (const id of c.inputs) if (!inputIds.has(id)) problems.push(`check ${c.id} names input ${id}, which is not defined`);
}
for (const i of inputProbes) {
  if (i.probe && !probeKeys.has(i.probe)) problems.push(`input ${i.id} names probe "${i.probe}", which is not in PROBES`);
  if (i.probe && !queryKeys.has(i.probe)) problems.push(`input ${i.id} names probe "${i.probe}", which has no query in READINESS_QUERIES`);
}
for (const k of probeKeys) if (!queryKeys.has(k)) problems.push(`probe "${k}" has no query in READINESS_QUERIES`);
for (const k of probeKeys) {
  if (k === "map") continue; // the AppCI map is a prerequisite, not something one application has
  if (!appQueryKeys.has(k)) problems.push(`probe "${k}" has no per-application query in readinessAppQueries`);
  if (!appInterpKeys.has(k)) problems.push(`probe "${k}" has no per-application interpreter in APP_INTERPRETERS`);
}

if (problems.length) {
  console.error("[check-readiness-registry] out of sync:\n  - " + problems.join("\n  - "));
  process.exit(1);
}
console.log(`[check-readiness-registry] ok: ${scorecard.length} checks, ${inputIds.size} inputs, ${probeKeys.size} probes (${appQueryKeys.size} per-application)`);
