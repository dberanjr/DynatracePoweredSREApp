import type { DemoFixture, DemoFunctionFixture, DemoResult } from "./types";
import { dqlFixtures, functionFixtures } from "./fixtures";
import { APP_CI_FIELD, SRE_CONFIG } from "../settings/appSettings";
import { DEFAULT_APPCI_FIELD, LOOKUP_KEYS, LOOKUP_DEFS } from "../settings/lookupDefs";

const EMPTY: DemoResult = { records: [] };

/**
 * Resolve a DQL string to demo data. First matching fixture wins, so list the
 * more specific fixtures before the generic ones. Unmatched queries return an
 * empty result (the UI shows its normal "No data" state) and log a warning so
 * gaps are easy to spot in the console.
 */
/**
 * The fixtures were written against the default identifier field and lookup paths. When Settings change them,
 * map the query back to the defaults so the same fixtures still match (the demo dataset is the same either way).
 */
function toDefaults(q: string): string {
  let out = q;
  if (APP_CI_FIELD !== DEFAULT_APPCI_FIELD) {
    const esc = APP_CI_FIELD.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?<![A-Za-z0-9_])${esc}(?![A-Za-z0-9_])`, "g"), DEFAULT_APPCI_FIELD);
  }
  for (const k of LOOKUP_KEYS) {
    const custom = SRE_CONFIG.paths[k];
    const def = LOOKUP_DEFS[k].defaultPath;
    if (custom !== def) out = out.split(`"${custom}"`).join(`"${def}"`);
  }
  return out;
}

function match(q: string): DemoFixture | undefined {
  return (dqlFixtures as DemoFixture[]).find((f) => (typeof f.match === "function" ? f.match(q) : f.match.test(q)));
}

/** Fixtures return the default identifier column; rename it to the configured field. */
function withConfiguredField(r: DemoResult): DemoResult {
  if (APP_CI_FIELD === DEFAULT_APPCI_FIELD) return r;
  return {
    ...r,
    records: r.records.map((rec) =>
      DEFAULT_APPCI_FIELD in rec
        ? Object.fromEntries(Object.entries(rec).map(([k, v]) => [k === DEFAULT_APPCI_FIELD ? APP_CI_FIELD : k, v]))
        : rec
    ),
  };
}

export function resolveDemoDql(query: string): DemoResult {
  const q = query ?? "";
  const direct = match(q);
  if (direct) return withConfiguredField(direct.respond(q));
  const normalized = toDefaults(q);
  if (normalized !== q) {
    const f = match(normalized);
    if (f) return withConfiguredField(f.respond(normalized));
  }
  if (!/^\s*data record\(skip = true\)/.test(q)) {
    // eslint-disable-next-line no-console
    console.warn("[demo mode] no fixture for query:\n" + q.slice(0, 400));
  }
  return EMPTY;
}

export function resolveDemoFunction(name: string, data: Record<string, unknown> | undefined): unknown {
  const f = (functionFixtures as DemoFunctionFixture[]).find((x) => x.name === name);
  if (!f) {
    // eslint-disable-next-line no-console
    console.warn("[demo mode] no fixture for app function: " + name);
    return undefined;
  }
  return f.respond(data);
}
