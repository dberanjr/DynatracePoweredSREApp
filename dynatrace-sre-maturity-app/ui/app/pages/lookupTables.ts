import { APP_CI_FIELD, APP_CI_LABEL } from "../settings/appSettings";
// Describes each lookup table the "Lookups" tab can maintain. Keep in sync with TABLES in
// api/saveLookup.function.ts, which holds the authoritative validation and file layout.

export interface LookupColumn {
  key: string;
  label: string;
  required?: boolean;
}

export interface LookupTableConfig {
  id: "cmdb" | "entity_severity" | "appci_map";
  tabLabel: string;
  title: string;
  description: string;
  path: string;
  backupPath: string;
  columns: LookupColumn[];
  /** Column holding the AppCI (validated against APPCI_PATTERN). */
  appciKey: string;
  /** Columns normalised to lower case on save (consumers compare them lower-cased). */
  lowercase: string[];
  /** Columns that together identify a row; must be unique. */
  keyColumns: string[];
  keyLabel: string;
}

export const LOOKUP_TABLES: LookupTableConfig[] = [
  {
    id: "cmdb",
    tabLabel: "CMDB owner mapping",
    title: "CMDB — Application Owner Mapping",
    description:
      `Supplies application names, owners, criticality and status across the app (header ${APP_CI_LABEL} picker, scorecards, leaderboard, dependencies).`,
    path: "/lookups/dynatrace/cmdb_appci_owner_mapping",
    backupPath: "/lookups/dynatrace/cmdb_appci_owner_mapping_backup",
    columns: [
      { key: `${APP_CI_FIELD}`, label: `${APP_CI_LABEL}`, required: true },
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
    appciKey: `${APP_CI_FIELD}`,
    lowercase: [],
    keyColumns: [`${APP_CI_FIELD}`],
    keyLabel: `${APP_CI_LABEL}`,
  },
  {
    id: "entity_severity",
    tabLabel: "Critical services seed",
    title: "Critical Services — Entity Severity Seed",
    description:
      `Which services or endpoints are critical for each ${APP_CI_LABEL}. The refresh-lookups-critical-services workflow reads this table and resolves each name to Dynatrace entity IDs. Entity names must match the service or endpoint name in Dynatrace exactly.`,
    path: "/lookups/entity_severity",
    backupPath: "/lookups/entity_severity_backup",
    columns: [
      { key: "appci", label: `${APP_CI_LABEL}`, required: true },
      { key: "entity_name", label: "Entity name", required: true },
      { key: "severity", label: "Severity (critical, high, medium…)", required: true },
      { key: "business_impact", label: "Business impact" },
    ],
    appciKey: "appci",
    lowercase: ["appci", "severity"],
    keyColumns: ["appci", "entity_name"],
    keyLabel: `${APP_CI_LABEL} + entity name`,
  },
  {
    id: "appci_map",
    tabLabel: `${APP_CI_LABEL} map`,
    title: `${APP_CI_LABEL} Map — Application Tag to ${APP_CI_LABEL}`,
    description:
      `Translates the application name in your tenant's Application tag to its 3-letter ${APP_CI_LABEL}, so entities, hosts and problems can be scored without an ${APP_CI_FIELD} tag. Enter the name WITHOUT its environment suffix: the tag Application:BillingPortal::CRT (or ::SPT, ::PRD) is matched by the name billingportal. Names are matched case-insensitively. Several names can share one ${APP_CI_LABEL}; a name can have only one.`,
    path: "/lookups/appci_map",
    backupPath: "/lookups/appci_map_backup",
    columns: [
      { key: "app_name", label: "Application name (no environment suffix)", required: true },
      { key: `${APP_CI_FIELD}`, label: `${APP_CI_LABEL}`, required: true },
    ],
    appciKey: `${APP_CI_FIELD}`,
    lowercase: ["app_name", `${APP_CI_FIELD}`],
    keyColumns: ["app_name"],
    keyLabel: "Application name",
  },
];
