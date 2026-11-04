/**
 * Customer-specific app settings.
 *
 * APP_CI_FIELD is the name of the unique application identifier a customer
 * carries on their Grail records / entity tags (United: "applicationci",
 * others: e.g. "app_id", "service_id", "costcenter"). It is interpolated into
 * DQL throughout the app, so queries are built from the value that was in
 * effect when the app loaded. The Settings page therefore reloads the app
 * after saving.
 */

export const DEFAULT_APP_CI_FIELD = DEFAULT_APPCI_FIELD;
export const DEFAULT_APP_CI_LABEL = "ApplicationCI";
/** Company name from the build (.env COMPANY_NAME → generated constants.ts); Settings can override it at runtime. */
export const DEFAULT_COMPANY_NAME = BUILD_COMPANY_NAME;
export const DEFAULT_COMPANY_LOGO_URL = "";

import { COMPANY_NAME as BUILD_COMPANY_NAME } from "../constants";
import {
  CONFIG_GLOBAL_KEY,
  DEFAULT_APPCI_FIELD,
  defaultLookupSettings,
  normalizeCatalogSettings,
  normalizeLookupSettings,
  resolveConfig,
  defaultCatalogSettings,
  type CatalogSettings,
  type LookupSettings,
  type SreConfig,
} from "./lookupDefs";

const STORAGE_KEY = "sre-maturity.settings.v1";

export interface AppSettings {
  /** Field / tag-key name that identifies an application on Grail records. */
  appCiField: string;
  /** Human-readable label for that identifier shown in the UI. */
  appCiLabel: string;
  /** Organization name shown in headings on the landing page and leaderboard. */
  companyName: string;
  /** Optional background logo on the landing page (relative path, https URL or data:image). Blank = none. */
  companyLogoUrl: string;
  /** Lookup table paths and column mappings. */
  lookups: LookupSettings;
  /** CMDB display: renamed labels, extra fields, tier values. */
  catalog: CatalogSettings;
}

/** Letters, digits, underscore and dots; must not start with a digit. Safe to use unquoted in DQL. */
const FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]*$/;

export function validateAppCiField(value: string): string | null {
  const v = value.trim();
  if (!v) return "Field name is required.";
  if (!FIELD_PATTERN.test(v)) {
    return "Use only letters, digits, underscores and dots, and don't start with a digit.";
  }
  return null;
}

const LOGO_PATTERN = /^(\.{0,2}\/|https:\/\/|data:image\/)\S+$/;

export function validateCompanyLogoUrl(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return LOGO_PATTERN.test(v) ? null : 'Use a relative path (e.g. "./assets/logo.png"), an https:// URL or a data:image URI — or leave blank for no logo.';
}

function read(): Partial<AppSettings> {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return raw ? (JSON.parse(raw) as Partial<AppSettings>) : {};
  } catch {
    return {};
  }
}

export function loadSettings(): AppSettings {
  const s = read();
  const field = typeof s.appCiField === "string" && !validateAppCiField(s.appCiField) ? s.appCiField.trim() : DEFAULT_APP_CI_FIELD;
  const label = typeof s.appCiLabel === "string" && s.appCiLabel.trim() ? s.appCiLabel.trim() : DEFAULT_APP_CI_LABEL;
  const companyName = typeof s.companyName === "string" && s.companyName.trim() ? s.companyName.trim() : DEFAULT_COMPANY_NAME;
  const companyLogoUrl =
    typeof s.companyLogoUrl === "string" && !validateCompanyLogoUrl(s.companyLogoUrl) ? s.companyLogoUrl.trim() : DEFAULT_COMPANY_LOGO_URL;
  return { appCiField: field, appCiLabel: label, companyName, companyLogoUrl, lookups: normalizeLookupSettings(s.lookups), catalog: normalizeCatalogSettings(s.catalog) };
}

export function saveSettings(next: AppSettings): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      appCiField: next.appCiField.trim(),
      appCiLabel: next.appCiLabel.trim() || DEFAULT_APP_CI_LABEL,
      companyName: next.companyName.trim() || DEFAULT_COMPANY_NAME,
      companyLogoUrl: next.companyLogoUrl.trim(),
      lookups: next.lookups,
      catalog: next.catalog,
    })
  );
}

export function resetSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
}

const loaded = loadSettings();

/** Field name used in DQL (tag keys, aliases, lookup columns). Fixed for the lifetime of the page. */
export const APP_CI_FIELD: string = loaded.appCiField;
/** Display label for the identifier. */
export const APP_CI_LABEL: string = loaded.appCiLabel;
/** Organization name shown in the UI. */
export const COMPANY_NAME: string = loaded.companyName;
/** Landing-page background logo URL; empty string means none. */
export const COMPANY_LOGO_URL: string = loaded.companyLogoUrl;
/** Effective CMDB display options (labels, extra fields, tier values). */
export const CATALOG_SETTINGS: CatalogSettings = loaded.catalog;
/** Effective lookup table paths and column mappings. */
export const LOOKUP_SETTINGS: LookupSettings = loaded.lookups;

export { defaultLookupSettings, defaultCatalogSettings };
/** Resolved config for the query layer. */
export const SRE_CONFIG: SreConfig = resolveConfig(loaded.appCiField, loaded.lookups, loaded.catalog);

// Publish for queries/maturityQueries.ts, which has no imports (the workflow generator loads it directly)
// and reads this when it is first evaluated. ui/main.tsx imports this module before the app so it is set in time.
(globalThis as Record<string, unknown>)[CONFIG_GLOBAL_KEY] = SRE_CONFIG;

/**
 * Ready-to-embed DQL for each lookup table: `load "<path>"` plus a rename of the
 * customer's columns to the names the app's queries use. Use as `${LOAD.guardians}`.
 */
export const LOAD = SRE_CONFIG.loads;
