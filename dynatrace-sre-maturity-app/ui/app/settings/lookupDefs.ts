// NO IMPORTS, erasable TypeScript only: scripts/generate-snapshot-workflow.mjs loads this file with Node's
// built-in type stripping so generated workflows use the same settings as the app.

/** Sentinel default meaning "the same name as the application identifier field (Settings)". */
export const APP_ID_TOKEN = "$APPCI";

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
  /** Shown as a chip in the application profile banners; the label can be renamed in Settings. */
  display?: { label: string; bannerLabel: string };
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
    defaultPath: "/lookups/sre/cmdb",
    fields: {
      appId: { canonical: APP_ID_TOKEN, default: APP_ID_TOKEN, label: "Application ID", hint: "Unique application identifier" },
      name: { canonical: "name", default: "name", label: "Application name", hint: "Human-readable name" },
      tier: { canonical: "business_criticality", default: "business_criticality", label: "Business criticality / tier", hint: "Drives the leaderboard tier groups (see Tier values)", optional: true, display: { label: "Tier", bannerLabel: "Criticality" } },
      status: { canonical: "operational_status", default: "operational_status", label: "Operational status", hint: 'Leave blank if you have none. Rows with "Retired" are hidden from the selector', optional: true, display: { label: "Status", bannerLabel: "Status" } },
      director: { canonical: "managed_by.u_managing_director", default: "managed_by.u_managing_director", label: "Managing director", hint: "Executive owner", optional: true, display: { label: "MD", bannerLabel: "Managing Director" } },
      owner: { canonical: "owned_by", default: "owned_by", label: "Owner", hint: "Application owner", optional: true, display: { label: "Owner", bannerLabel: "Owner" } },
      supportGroup: { canonical: "support_group", default: "support_group", label: "Support group", hint: "Team that supports the app", optional: true, display: { label: "Support", bannerLabel: "Support Group" } },
    },
  },
  appciMap: {
    label: "Application name → ID map",
    description: "Translates the application name in an entity's Application tag to its application ID, for tenants that don't tag the ID directly.",
    defaultPath: "/lookups/sre/app_map",
    fields: {
      appName: { canonical: "app_name", default: "app_name", label: "Application name", hint: "Lower-case name from the Application tag" },
      appId: { canonical: APP_ID_TOKEN, default: APP_ID_TOKEN, label: "Application ID", hint: "Application identifier it maps to" },
    },
  },
  criticalServices: {
    label: "Critical services",
    description: "One row per critical service, with the Dynatrace entity IDs it resolved to (space separated, or \"-\" when unresolved).",
    defaultPath: "/lookups/sre/critical_services",
    fields: {
      appId: { canonical: "appId", default: APP_ID_TOKEN, label: "Application ID", hint: "Joins to the application identifier" },
      entityIds: { canonical: "entity_ids", default: "entity_ids", label: "Entity IDs", hint: 'Space-separated entity IDs; "-" if none' },
      entityName: { canonical: "entity_name", default: "entity_name", label: "Service name", hint: "Display name of the critical service" },
      severity: { canonical: "severity", default: "severity", label: "Severity", hint: "high / medium / low" },
      businessImpact: { canonical: "business_impact", default: "business_impact", label: "Business impact", hint: "e.g. revenue, security", optional: true },
    },
  },
  slo: {
    label: "SLOs",
    description: "One row per SLO. The application is the Application ID column when you map one, otherwise the first 3 characters of the SLO name.",
    defaultPath: "/lookups/sre/slo",
    fields: {
      slo: { canonical: "slo", default: "slo", label: "SLO name", hint: "Name starting with the application code" },
      appId: { canonical: "appId", default: "", label: "Application ID", hint: "Leave blank to use the first 3 characters of the SLO name", optional: true },
    },
  },
  sloDashboards: {
    label: "SLO dashboards",
    description: "One row per SLO dashboard.",
    defaultPath: "/lookups/sre/slo_dashboards",
    fields: {
      appId: { canonical: "appId", default: APP_ID_TOKEN, label: "Application ID", hint: "Joins to the application identifier" },
    },
  },
  guardians: {
    label: "Site Reliability Guardians",
    description: "One row per guardian.",
    defaultPath: "/lookups/sre/guardians",
    fields: {
      appId: { canonical: "appId", default: APP_ID_TOKEN, label: "Application ID", hint: "Joins to the application identifier" },
    },
  },
} as const satisfies Record<string, LookupTableDef>;

export type LookupKey = keyof typeof LOOKUP_DEFS;
export type LookupFieldKey<K extends LookupKey> = keyof (typeof LOOKUP_DEFS)[K]["fields"] & string;

/** Maps a raw value of the CMDB tier column to how the app shows and treats it. */
export interface TierRule {
  /** Raw value in the tier column (matched case-insensitively), e.g. "yes" or "1 - most critical". */
  value: string;
  /** Name shown for the tier in the leaderboard and banners. Blank = show the raw value. */
  label: string;
  /** Counts toward the leaderboard's critical-tier enterprise score. */
  critical: boolean;
}

/** Original deployment's tier values; with these, the app behaves exactly as before. */
export const DEFAULT_TIERS: TierRule[] = [
  { value: "1 - most critical", label: "", critical: true },
  { value: "2 - somewhat critical", label: "", critical: true },
  { value: "3 - less critical", label: "", critical: false },
  { value: "4 - not critical", label: "", critical: false },
];

/** Extra CMDB columns shown as chips after the built-in ones. */
export interface ExtraField {
  label: string;
  column: string;
}

export interface CatalogSettings {
  /** Renamed chip labels for built-in display fields, by field key (tier, status, director, owner, supportGroup). */
  labels: Record<string, string>;
  extras: ExtraField[];
  tiers: TierRule[];
}

export const MAX_EXTRA_FIELDS = 6;

export const defaultCatalogSettings = (): CatalogSettings => ({ labels: {}, extras: [], tiers: DEFAULT_TIERS.map((t) => ({ ...t })) });

export function normalizeCatalogSettings(stored: unknown): CatalogSettings {
  const out = defaultCatalogSettings();
  if (!stored || typeof stored !== "object") return out;
  const s = stored as { labels?: unknown; extras?: unknown; tiers?: unknown };
  if (s.labels && typeof s.labels === "object") {
    for (const [k, v] of Object.entries(s.labels as Record<string, unknown>)) if (typeof v === "string" && v.trim()) out.labels[k] = v.trim();
  }
  if (Array.isArray(s.extras)) {
    out.extras = (s.extras as Array<Partial<ExtraField> | null>)
      .filter((e): e is ExtraField => !!e && typeof e.label === "string" && typeof e.column === "string" && !!e.label.trim() && !validateColumn(e.column, false))
      .slice(0, MAX_EXTRA_FIELDS)
      .map((e) => ({ label: e.label.trim(), column: e.column.trim() }));
  }
  if (Array.isArray(s.tiers)) {
    const tiers = (s.tiers as Array<Partial<TierRule> | null>)
      .filter((t): t is TierRule => !!t && typeof t.value === "string" && !!t.value.trim())
      .map((t) => ({ value: t.value.trim(), label: typeof t.label === "string" ? t.label.trim() : "", critical: !!t.critical }));
    if (tiers.length) out.tiers = tiers;
  }
  return out;
}

export interface LookupTableSettings {
  path: string;
  /** field key → customer's column name ("" = not mapped, optional fields only) */
  columns: Record<string, string>;
}
export type LookupSettings = Record<LookupKey, LookupTableSettings>;

export const LOOKUP_KEYS = Object.keys(LOOKUP_DEFS) as LookupKey[];

/** Resolve the APP_ID sentinel to the configured identifier field. */
const resolveColumn = (name: string, appIdField: string): string => (name === APP_ID_TOKEN ? appIdField : name);

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
export function buildLoad(key: LookupKey, s: LookupTableSettings, appIdField: string, extras: ExtraField[] = []): string {
  const fields: Record<string, LookupFieldDef> = LOOKUP_DEFS[key].fields;
  const renames = Object.entries(fields)
    .map(([f, d]) => [resolveColumn(d.canonical, appIdField), resolveColumn(s.columns[f] ?? d.default, appIdField)] as const)
    // an optional column that is unmapped and has no default is simply absent (not renamed to "")
    .filter(([canonical, mapped], i) => mapped !== canonical && !(mapped === "" && Object.values(fields)[i].default === ""))
    .map(([canonical, mapped]) => `${dqlColumn(canonical)} = ${dqlColumn(mapped)}`);
  // Extra display columns (CMDB only) are exposed as extra_0, extra_1, ...
  if (key === "cmdb") extras.forEach((e, i) => renames.push(`${extraAlias(i)} = ${dqlColumn(e.column)}`));
  const head = `load "${s.path}"`;
  return renames.length ? `${head}\n| fieldsAdd ${renames.join(", ")}` : head;
}

export const extraAlias = (i: number): string => `extra_${i}`;

/** A chip in the application profile banners. */
export interface ProfileField {
  key: string;
  /** Short label (identity bar). */
  label: string;
  /** Long label (context banner). */
  bannerLabel: string;
  /** Column name in the loaded CMDB table (the app's canonical name, or extra_N). */
  alias: string;
}

/** Banner chips for the columns that are mapped, in display order, with any renamed labels applied. */
export function buildProfileFields(lookups: LookupSettings, catalog: CatalogSettings): ProfileField[] {
  const out: ProfileField[] = [];
  const fields: Record<string, LookupFieldDef> = LOOKUP_DEFS.cmdb.fields;
  for (const [key, d] of Object.entries(fields)) {
    if (!d.display) continue;
    if (!(lookups.cmdb.columns[key] ?? d.default).trim()) continue; // not mapped: no chip
    const renamed = catalog.labels[key];
    out.push({ key, label: renamed || d.display.label, bannerLabel: renamed || d.display.bannerLabel, alias: d.canonical });
  }
  catalog.extras.forEach((e, i) => out.push({ key: extraAlias(i), label: e.label, bannerLabel: e.label, alias: extraAlias(i) }));
  return out;
}

/** What the query layer needs, computed once from the settings. */
export interface SreConfig {
  /** Application identifier field: entity tag key, DQL alias, and the ID column of app-managed lookups. */
  appIdField: string;
  /** Tag key on cloud resources (smartscapeNodes: AWS tags, Azure tags, GCP labels) and guardians. */
  cloudTagKey: string;
  /** Longest application ID the bulk queries accept (a sanity cap on tag values). The original deployment's IDs are 3 characters. */
  idMaxLength: number;
  /** `load "<path>"` plus renames of the customer's columns to the app's names, per lookup table. */
  loads: Record<LookupKey, string>;
  paths: Record<LookupKey, string>;
  /** True when the SLO table has an Application ID column (otherwise the ID is the first 3 characters of the SLO name). */
  sloIdFromColumn: boolean;
  /** Chips for the application profile banners. */
  profileFields: ProfileField[];
  /** Tier value rules for the leaderboard. */
  tiers: TierRule[];
  /** True when the tier rules are the original deployment's, so original wording is kept. */
  defaultTiers: boolean;
}

export const DEFAULT_ID_MAX_LENGTH = 3;
/** A whole number from 1 to 64; anything else falls back to the default. */
export const normalizeIdMaxLength = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v.trim()) : typeof v === "number" ? v : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 64 ? n : DEFAULT_ID_MAX_LENGTH;
};

export function resolveConfig(appIdField: string, lookups: LookupSettings, catalog: CatalogSettings = defaultCatalogSettings(), cloudTagKeyOverride = "", idMaxLength = DEFAULT_ID_MAX_LENGTH): SreConfig {
  const loads = {} as Record<LookupKey, string>;
  const paths = {} as Record<LookupKey, string>;
  for (const k of LOOKUP_KEYS) {
    loads[k] = buildLoad(k, lookups[k], appIdField, catalog.extras);
    paths[k] = lookups[k].path;
  }
  return {
    appIdField,
    cloudTagKey: resolveCloudTagKey(appIdField, cloudTagKeyOverride),
    idMaxLength,
    sloIdFromColumn: !!lookups.slo.columns.appId,
    loads,
    paths,
    profileFields: buildProfileFields(lookups, catalog),
    tiers: catalog.tiers,
    defaultTiers: JSON.stringify(catalog.tiers) === JSON.stringify(DEFAULT_TIERS),
  };
}

export const DEFAULT_APP_ID_FIELD = "appId";
/** Seed table the critical-services workflow reads (not remappable in Settings; the Lookups tab edits it). */
export const DEFAULT_ENTITY_SEVERITY_PATH = "/lookups/sre/entity_severity";
/**
 * Cloud resource / guardian tag key. Unset: the identifier field as typed (tag keys are case-sensitive:
 * override it if the tag on your cloud resources is spelled differently, for example "ApplicationCI").
 */
export const resolveCloudTagKey = (appIdField: string, override: string): string => override.trim() || appIdField;
export const defaultConfig = (): SreConfig => resolveConfig(DEFAULT_APP_ID_FIELD, defaultLookupSettings());

/** The config the app publishes at startup (see settings/appSettings.ts) and the workflow generator sets. */
export const CONFIG_GLOBAL_KEY = "__SRE_CONFIG__";
