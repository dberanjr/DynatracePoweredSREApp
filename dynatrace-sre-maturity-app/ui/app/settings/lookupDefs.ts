// NO IMPORTS, erasable TypeScript only: scripts/generate-snapshot-workflow.mjs loads this file with Node's
// built-in type stripping so generated workflows use the same settings as the app.

/** Sentinel default meaning "the same name as the application identifier field (Settings)". */
export const APPCI_TOKEN = "$APPCI";

/**
 * Lookup tables the app reads, and the columns it needs from each.
 *
 * `canonical` is the column name the app's DQL uses internally. When a customer's
 * table uses a different column name, the generated `load` snippet renames it to the
 * canonical name right after loading, so the rest of each query never changes.
 */
export interface LookupFieldDef {
  /** Column name the app's queries expect. */
  canonical: string;
  /** Column name in the reference (original) deployment. */
  default: string;
  label: string;
  hint: string;
  /** Optional columns may be left unmapped ("(none)") — the app then shows a blank value. */
  optional?: boolean;
}

export interface LookupTableDef {
  label: string;
  description: string;
  defaultPath: string;
  fields: Record<string, LookupFieldDef>;
}

export const LOOKUP_DEFS = {
  cmdb: {
    label: "Application catalog (CMDB)",
    description:
      "One row per application: identity, owner and tier. Feeds the application selector, profile banner and leaderboard.",
    defaultPath: "/lookups/dynatrace/cmdb_appci_owner_mapping",
    fields: {
      appId: { canonical: APPCI_TOKEN, default: APPCI_TOKEN, label: "Application ID", hint: "Unique application identifier" },
      name: { canonical: "name", default: "name", label: "Application name", hint: "Human-readable name" },
      tier: { canonical: "business_criticality", default: "business_criticality", label: "Business criticality / tier", hint: "e.g. Tier 1", optional: true },
      status: { canonical: "operational_status", default: "operational_status", label: "Operational status", hint: 'Rows with "Retired" are hidden from the selector', optional: true },
      director: { canonical: "managed_by.u_managing_director", default: "managed_by.u_managing_director", label: "Managing director", hint: "Executive owner", optional: true },
      owner: { canonical: "owned_by", default: "owned_by", label: "Owner", hint: "Application owner", optional: true },
      supportGroup: { canonical: "support_group", default: "support_group", label: "Support group", hint: "Team that supports the app", optional: true },
    },
  },
  appciMap: {
    label: "Application name → ID map",
    description: "Translates the application name in an entity's Application tag to its application ID, for tenants that don't tag the ID directly.",
    defaultPath: "/lookups/appci_map",
    fields: {
      appName: { canonical: "app_name", default: "app_name", label: "Application name", hint: "Lower-case name from the Application tag" },
      appId: { canonical: APPCI_TOKEN, default: APPCI_TOKEN, label: "Application ID", hint: "Application identifier it maps to" },
    },
  },
  criticalServices: {
    label: "Critical services",
    description: "One row per critical service, with the Dynatrace entity IDs it resolved to (space separated, or \"-\" when unresolved).",
    defaultPath: "/lookups/critical_services",
    fields: {
      appId: { canonical: "appci", default: "appci", label: "Application ID", hint: "Joins to the application identifier" },
      entityIds: { canonical: "entity_ids", default: "entity_ids", label: "Entity IDs", hint: 'Space-separated entity IDs; "-" if none' },
      entityName: { canonical: "entity_name", default: "entity_name", label: "Service name", hint: "Display name of the critical service" },
      severity: { canonical: "severity", default: "severity", label: "Severity", hint: "high / medium / low" },
      businessImpact: { canonical: "business_impact", default: "business_impact", label: "Business impact", hint: "e.g. revenue, security", optional: true },
    },
  },
  slo: {
    label: "SLOs",
    description: "One row per SLO. The application is derived from the first 3 characters of the SLO name.",
    defaultPath: "/lookups/slo",
    fields: {
      slo: { canonical: "slo", default: "slo", label: "SLO name", hint: "Name starting with the application code" },
    },
  },
  sloDashboards: {
    label: "SLO dashboards",
    description: "One row per SLO dashboard.",
    defaultPath: "/lookups/slo-dashboards",
    fields: {
      appId: { canonical: "appci", default: "appci", label: "Application ID", hint: "Joins to the application identifier" },
    },
  },
  guardians: {
    label: "Site Reliability Guardians",
    description: "One row per guardian.",
    defaultPath: "/lookups/guardians",
    fields: {
      appId: { canonical: "appci", default: "appci", label: "Application ID", hint: "Joins to the application identifier" },
    },
  },
} as const satisfies Record<string, LookupTableDef>;

export type LookupKey = keyof typeof LOOKUP_DEFS;
export type LookupFieldKey<K extends LookupKey> = keyof (typeof LOOKUP_DEFS)[K]["fields"] & string;

export interface LookupTableSettings {
  path: string;
  /** field key → customer's column name ("" = not mapped, optional fields only) */
  columns: Record<string, string>;
}
export type LookupSettings = Record<LookupKey, LookupTableSettings>;

export const LOOKUP_KEYS = Object.keys(LOOKUP_DEFS) as LookupKey[];

/** Resolve the APPCI sentinel to the configured identifier field. */
const resolveColumn = (name: string, appciField: string): string => (name === APPCI_TOKEN ? appciField : name);

export function defaultLookupSettings(): LookupSettings {
  const out = {} as LookupSettings;
  for (const k of LOOKUP_KEYS) {
    const def: LookupTableDef = LOOKUP_DEFS[k];
    out[k] = {
      path: def.defaultPath,
      columns: Object.fromEntries(Object.entries(def.fields).map(([f, d]) => [f, d.default])),
    };
  }
  return out;
}

const PATH_PATTERN = /^\/lookups\/[A-Za-z0-9_\-./]+$/;

export function validateLookupPath(path: string): string | null {
  const p = path.trim();
  if (!p) return "Path is required.";
  if (!PATH_PATTERN.test(p)) return 'Must start with "/lookups/" and contain only letters, digits, _ - . /';
  return null;
}

export function validateColumn(name: string, optional: boolean | undefined): string | null {
  const n = name.trim();
  if (!n) return optional ? null : "Column name is required.";
  if (/[`"'\\\n]/.test(n)) return "Column names can't contain quotes, backticks or backslashes.";
  return null;
}

/** Merge stored (possibly partial / stale) settings over defaults, discarding invalid entries. */
export function normalizeLookupSettings(stored: unknown): LookupSettings {
  const out = defaultLookupSettings();
  if (!stored || typeof stored !== "object") return out;
  for (const k of LOOKUP_KEYS) {
    const s = (stored as Record<string, { path?: unknown; columns?: unknown } | undefined>)[k];
    if (!s) continue;
    if (typeof s.path === "string" && !validateLookupPath(s.path)) out[k].path = s.path.trim();
    if (s.columns && typeof s.columns === "object") {
      const fields: Record<string, LookupFieldDef> = LOOKUP_DEFS[k].fields;
      for (const [f, d] of Object.entries(fields)) {
        const v = (s.columns as Record<string, unknown>)[f];
        if (typeof v === "string" && !validateColumn(v, d.optional)) out[k].columns[f] = v.trim();
      }
    }
  }
  return out;
}

const SIMPLE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Reference a column in DQL: backtick-quote anything that isn't a plain identifier; unmapped optional → "". */
export function dqlColumn(name: string): string {
  if (!name) return '""';
  return SIMPLE_IDENT.test(name) ? name : `\`${name}\``;
}

/**
 * DQL that loads a lookup table and renames the customer's columns to the names the
 * app's queries use. Columns that already match are not touched.
 */
export function buildLoad(key: LookupKey, s: LookupTableSettings, appciField: string): string {
  const fields: Record<string, LookupFieldDef> = LOOKUP_DEFS[key].fields;
  const renames = Object.entries(fields)
    .map(([f, d]) => [resolveColumn(d.canonical, appciField), resolveColumn(s.columns[f] ?? d.default, appciField)] as const)
    .filter(([canonical, mapped]) => mapped !== canonical)
    .map(([canonical, mapped]) => `${dqlColumn(canonical)} = ${dqlColumn(mapped)}`);
  const head = `load "${s.path}"`;
  return renames.length ? `${head}\n| fieldsAdd ${renames.join(", ")}` : head;
}

/** What the query layer needs, computed once from the settings. */
export interface SreConfig {
  /** Application identifier field: entity tag key, DQL alias, and the ID column of app-managed lookups. */
  appciField: string;
  /** `load "<path>"` plus renames of the customer's columns to the app's names, per lookup table. */
  loads: Record<LookupKey, string>;
  paths: Record<LookupKey, string>;
}

export function resolveConfig(appciField: string, lookups: LookupSettings): SreConfig {
  const loads = {} as Record<LookupKey, string>;
  const paths = {} as Record<LookupKey, string>;
  for (const k of LOOKUP_KEYS) {
    loads[k] = buildLoad(k, lookups[k], appciField);
    paths[k] = lookups[k].path;
  }
  return { appciField, loads, paths };
}

export const DEFAULT_APPCI_FIELD = "applicationci";
export const defaultConfig = (): SreConfig => resolveConfig(DEFAULT_APPCI_FIELD, defaultLookupSettings());

/** The config the app publishes at startup (see settings/appSettings.ts) and the workflow generator sets. */
export const CONFIG_GLOBAL_KEY = "__SRE_CONFIG__";
