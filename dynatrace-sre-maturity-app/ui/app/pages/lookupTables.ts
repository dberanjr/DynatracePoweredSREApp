import { APP_ID_FIELD, APP_ID_LABEL, LOOKUP_SETTINGS, CATALOG_SETTINGS } from "../settings/appSettings";
import { APP_ID_TOKEN, LOOKUP_DEFS, defaultLookupSettings, type LookupKey } from "../settings/lookupDefs";
// Describes each lookup table the "Lookups" tab can maintain. Keep in sync with TABLES in
// api/saveLookup.function.ts, which holds the authoritative validation and file layout.

export interface LookupColumn {
  key: string;
  label: string;
  required?: boolean;
}

export interface LookupTableConfig {
  id: "cmdb" | "entity_severity" | "app_map";
  tabLabel: string;
  title: string;
  description: string;
  path: string;
  backupPath: string;
  columns: LookupColumn[];
  /** Column holding the application ID (validated against APP_ID_PATTERN). */
  appIdKey: string;
  /** Columns normalised to lower case on save (consumers compare them lower-cased). */
  lowercase: string[];
  /** Columns that together identify a row; must be unique. */
  keyColumns: string[];
  keyLabel: string;
  /**
   * Settings point this table at the customer's own table (other path or column names). It is shown, but not
   * edited here: Save replaces the whole table with only the columns the app knows, which would drop the rest
   * of a table the customer maintains elsewhere.
   */
  readOnly?: boolean;
}

const DEFAULT_TABLES: LookupTableConfig[] = [
  {
    id: "cmdb",
    tabLabel: "CMDB owner mapping",
    title: "CMDB — Application Owner Mapping",
    description:
      `Supplies application names, owners, criticality and status across the app (header ${APP_ID_LABEL} picker, scorecards, leaderboard, dependencies).`,
    path: "/lookups/dtsrepoweredapp/cmdb",
    backupPath: "/lookups/dtsrepoweredapp/cmdb_backup",
    columns: [
      { key: `${APP_ID_FIELD}`, label: `${APP_ID_LABEL}`, required: true },
      { key: "name", label: "Name", required: true },
      { key: "operational_status", label: "Operational status" },
      { key: "business_criticality", label: "Business criticality" },
      { key: "owned_by", label: "Owned by" },
      { key: "managed_by", label: "Managed by" },
      { key: "u_maintained_by", label: "Maintained by" },
      { key: "support_group", label: "Support group" },
      { key: "managed_by.u_managing_director", label: "Managing director" },
      { key: "managed_by.u_vp", label: "VP" },
      { key: "managed_by.u_director", label: "Director" },
    ],
    appIdKey: `${APP_ID_FIELD}`,
    lowercase: [],
    keyColumns: [`${APP_ID_FIELD}`],
    keyLabel: `${APP_ID_LABEL}`,
  },
  {
    id: "entity_severity",
    tabLabel: "Critical services seed",
    title: "Critical Services — Entity Severity Seed",
    description:
      `Which services or endpoints are critical for each ${APP_ID_LABEL}. The refresh-lookups-critical-services workflow reads this table and resolves each name to Dynatrace entity IDs. Entity names must match the service or endpoint name in Dynatrace exactly.`,
    path: "/lookups/dtsrepoweredapp/entity_severity",
    backupPath: "/lookups/dtsrepoweredapp/entity_severity_backup",
    columns: [
      { key: `${APP_ID_FIELD}`, label: `${APP_ID_LABEL}`, required: true },
      { key: "entity_name", label: "Entity name", required: true },
      { key: "severity", label: "Severity (critical, high, medium…)", required: true },
      { key: "business_impact", label: "Business impact" },
    ],
    appIdKey: APP_ID_FIELD,
    lowercase: [APP_ID_FIELD, "severity"],
    keyColumns: [APP_ID_FIELD, "entity_name"],
    keyLabel: `${APP_ID_LABEL} + entity name`,
  },
  {
    id: "app_map",
    tabLabel: `${APP_ID_LABEL} map`,
    title: `${APP_ID_LABEL} Map — Application Tag to ${APP_ID_LABEL}`,
    description:
      `Translates the application name in your tenant's Application tag to its ${APP_ID_LABEL}, so entities, hosts and problems can be scored without an ${APP_ID_FIELD} tag. Enter the name WITHOUT its environment suffix: the tag Application:BillingPortal::CRT (or ::SPT, ::PRD) is matched by the name billingportal. Names are matched case-insensitively. Several names can share one ${APP_ID_LABEL}; a name can have only one.`,
    path: "/lookups/dtsrepoweredapp/app_map",
    backupPath: "/lookups/dtsrepoweredapp/app_map_backup",
    columns: [
      { key: "app_name", label: "Application name (no environment suffix)", required: true },
      { key: `${APP_ID_FIELD}`, label: `${APP_ID_LABEL}`, required: true },
    ],
    appIdKey: `${APP_ID_FIELD}`,
    lowercase: ["app_name", `${APP_ID_FIELD}`],
    keyColumns: ["app_name"],
    keyLabel: "Application name",
  },
];

const resolveCol = (c: string) => (c === APP_ID_TOKEN ? APP_ID_FIELD : c);

/** The app-managed table with Settings applied, or the table as the customer's own, read-only, when remapped. */
function fromSettings(base: LookupTableConfig, key: LookupKey): LookupTableConfig {
  const def = defaultLookupSettings()[key];
  const cur = LOOKUP_SETTINGS[key];
  const fields = LOOKUP_DEFS[key].fields as Record<string, { canonical: string; label: string }>;
  const remapped =
    cur.path !== def.path || Object.keys(def.columns).some((f) => cur.columns[f].trim() && cur.columns[f] !== def.columns[f]);
  if (!remapped) return base;

  const columns: LookupColumn[] = [];
  for (const [f, d] of Object.entries(fields)) {
    const col = resolveCol(cur.columns[f] ?? "").trim();
    if (!col) continue; // not mapped
    const label = f === "appId" ? APP_ID_LABEL : CATALOG_SETTINGS.labels[f] ?? d.label;
    columns.push({ key: col, label, required: f === "appId" || f === "name" || f === "appName" });
  }
  if (key === "cmdb") for (const e of CATALOG_SETTINGS.extras) columns.push({ key: e.column, label: e.label });
  const idCol = resolveCol(cur.columns.appId);
  const keyCol = key === "appciMap" ? cur.columns.appName : idCol;
  return {
    ...base,
    path: cur.path,
    backupPath: `${cur.path}_backup`,
    columns,
    appIdKey: idCol,
    lowercase: [],
    keyColumns: [keyCol],
    readOnly: true,
    description: `${base.description} This is the table named in Settings (${cur.path}); columns are shown under the names you mapped.`,
  };
}

export const LOOKUP_TABLES: LookupTableConfig[] = DEFAULT_TABLES.map((t) =>
  t.id === "cmdb" ? fromSettings(t, "cmdb") : t.id === "app_map" ? fromSettings(t, "appciMap") : t
);
