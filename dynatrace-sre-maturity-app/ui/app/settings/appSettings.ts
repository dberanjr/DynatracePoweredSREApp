/**
 * Customer settings, shared by every user and every DT-SRE APP workflow.
 *
 * They live in the lookup /lookups/dtsrepoweredapp/config (see SHARED_CONFIG_PATH in lookupDefs.ts). ui/main.tsx reads that
 * table before the app loads and hands the rows to this module, because the DQL of the whole app is built from these values
 * when it loads. The Settings page writes the table back (through the saveLookup function, which needs the user to be allowed
 * to write lookup tables) and reloads the app.
 *
 * - The application ID tag keys (`<key>:<id>` on entities) are a list: any one of them identifies the application.
 * - The DQL alias and the ID column of every lookup are always `appId`; the customer's own column is mapped to it by the
 *   catalog workflow, from the source table configured here.
 */

export { DEFAULT_APP_ID_FIELD, SNAPSHOT_BUCKET };
export const DEFAULT_APP_ID_LABEL = "Application ID";
/** Company name from the build (.env COMPANY_NAME → generated constants.ts); Settings can override it. */
export const DEFAULT_COMPANY_NAME = BUILD_COMPANY_NAME;
export const DEFAULT_COMPANY_LOGO_URL = "";

import { COMPANY_NAME as BUILD_COMPANY_NAME } from "../constants";
import {
  CONFIG_GLOBAL_KEY,
  DEFAULT_APP_ID_FIELD,
  SHARED_CONFIG_GLOBAL_KEY,
  SNAPSHOT_BUCKET,
  defaultLookupSettings,
  defaultCatalogSettings,
  defaultSourceSettings,
  normalizeIdMaxLength,
  parseSharedSettings,
  resolveConfig,
  serializeSharedSettings,
  validateCompanyLogoUrlText,
  type CatalogSettings,
  type LookupSettings,
  type SharedSettings,
  type SourceSettings,
  type SreConfig,
} from "./lookupDefs";

/** What ui/main.tsx found when it read the shared config. */
export interface SharedConfigState {
  /** saved: read the table. missing: it does not exist yet (nothing saved on this tenant). unreadable: any other failure. */
  state: "saved" | "missing" | "unreadable";
  rows: Array<{ key?: unknown; value?: unknown }>;
  error?: string;
}

export const validateCompanyLogoUrl = validateCompanyLogoUrlText;

const published = (globalThis as Record<string, unknown>)[SHARED_CONFIG_GLOBAL_KEY] as SharedConfigState | undefined;
export const SHARED_CONFIG_STATE: SharedConfigState = published ?? { state: "missing", rows: [] };

/** Settings as parsed from the config table (defaults for anything not saved). */
export function loadSettings(): SharedSettings {
  return parseSharedSettings(SHARED_CONFIG_STATE.rows, DEFAULT_COMPANY_NAME);
}

/** The rows to write for these settings. Used by the Settings page's save. */
export const settingsToRows = (s: SharedSettings): Array<{ key: string; value: string }> =>
  serializeSharedSettings({ ...s, idMaxLength: normalizeIdMaxLength(s.idMaxLength) }).map(([key, value]) => ({ key, value }));

const loaded = loadSettings();

/** DQL alias / ID column of every lookup. Always "appId". */
export const APP_ID_FIELD: string = DEFAULT_APP_ID_FIELD;
/** Entity tag keys that carry the application ID (any one identifies the application). */
export const APP_ID_TAG_KEYS: string[] = loaded.tagKeys;
/** The primary tag key, for wording ("tag it <key>:<code>"). */
export const APP_ID_TAG_KEY: string = loaded.tagKeys[0];
/** Display label for the identifier. */
export const APP_ID_LABEL: string = loaded.appIdLabel;
/** Organization name shown in the UI. */
export const COMPANY_NAME: string = loaded.companyName;
/** Landing-page background logo URL; empty string means none. */
export const COMPANY_LOGO_URL: string = loaded.companyLogoUrl;
/** Effective CMDB display options (labels, extra fields, tier values). */
export const CATALOG_SETTINGS: CatalogSettings = loaded.catalog;
/** The customer's source table and column mapping for the catalog. */
export const SOURCE_SETTINGS: SourceSettings = loaded.source;
/** Lookup tables are at fixed paths with fixed columns. */
export const LOOKUP_SETTINGS: LookupSettings = defaultLookupSettings();

export { defaultLookupSettings, defaultCatalogSettings, defaultSourceSettings };
/** Resolved config for the query layer. */
export const SRE_CONFIG: SreConfig = resolveConfig(loaded.tagKeys, LOOKUP_SETTINGS, loaded.catalog, loaded.cloudTagKey, loaded.idMaxLength);
/** Cloud resource / guardian tag key (e.g. ApplicationCI), case-sensitive. */
export const APP_ID_CLOUD_TAG: string = SRE_CONFIG.cloudTagKey;
/** True when the SLO lookup has an Application ID column (the workflow always writes one). */
export const SLO_ID_FROM_COLUMN: boolean = SRE_CONFIG.sloIdFromColumn;
/** Longest application ID the bulk queries accept. */
export const APP_ID_MAX_LENGTH: number = loaded.idMaxLength;
/** The cloud tag override as saved (blank = the primary tag key). */
export const CLOUD_TAG_OVERRIDE: string = loaded.cloudTagKey;

// Publish for queries/maturityQueries.ts, which has no imports (the workflow generator loads it directly)
// and reads this when it is first evaluated. ui/main.tsx imports this module before the app so it is set in time.
(globalThis as Record<string, unknown>)[CONFIG_GLOBAL_KEY] = SRE_CONFIG;

/**
 * Ready-to-embed DQL for each lookup table: `load "<path>"` plus a rename of the
 * customer's columns to the names the app's queries use. Use as `${LOAD.guardians}`.
 */
export const LOAD = SRE_CONFIG.loads;
