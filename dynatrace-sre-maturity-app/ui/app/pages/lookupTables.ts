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
      "Supplies application names, owners, criticality and status across the app (header AppCI picker, scorecards, leaderboard, dependencies).",
    path: "/lookups/dynatrace/cmdb_appci_owner_mapping",
    backupPath: "/lookups/dynatrace/cmdb_appci_owner_mapping_backup",
    columns: [
      { key: "applicationci", label: "AppCI", required: true },
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
    appciKey: "applicationci",
    lowercase: [],
    keyColumns: ["applicationci"],
    keyLabel: "AppCI",
  },
  {
    id: "entity_severity",
    tabLabel: "Critical services seed",
    title: "Critical Services — Entity Severity Seed",
    description:
      "Which services or endpoints are critical for each AppCI. The refresh-lookups-critical-services workflow reads this table and resolves each name to Dynatrace entity IDs. Entity names must match the service or endpoint name in Dynatrace exactly.",
    path: "/lookups/entity_severity",
    backupPath: "/lookups/entity_severity_backup",
    columns: [
      { key: "appci", label: "AppCI", required: true },
      { key: "entity_name", label: "Entity name", required: true },
      { key: "severity", label: "Severity (critical, high, medium…)", required: true },
      { key: "business_impact", label: "Business impact" },
    ],
    appciKey: "appci",
    lowercase: ["appci", "severity"],
    keyColumns: ["appci", "entity_name"],
    keyLabel: "AppCI + entity name",
  },
  {
    id: "appci_map",
    tabLabel: "AppCI map",
    title: "AppCI Map — Application Tag to AppCI",
    description:
      "Translates the application name in your tenant's Application tag to its 3-letter AppCI, so entities, hosts and problems can be scored without an applicationci tag. Enter the name WITHOUT its environment suffix: the tag Application:BillingPortal::CRT (or ::SPT, ::PRD) is matched by the name billingportal. Names are matched case-insensitively. Several names can share one AppCI; a name can have only one.",
    path: "/lookups/appci_map",
    backupPath: "/lookups/appci_map_backup",
    columns: [
      { key: "app_name", label: "Application name (no environment suffix)", required: true },
      { key: "applicationci", label: "AppCI", required: true },
    ],
    appciKey: "applicationci",
    lowercase: ["app_name", "applicationci"],
    keyColumns: ["app_name"],
    keyLabel: "Application name",
  },
];
