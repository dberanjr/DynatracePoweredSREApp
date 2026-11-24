import { APP_ID_FIELD, SRE_CONFIG } from "./appSettings";
import { dqlColumn, type ProfileField } from "./lookupDefs";

// Shared by the application profile banners (AppIdentityBar, AppContextBanner) and the leaderboard:
// which CMDB fields to show, what they are called, and how tier values are interpreted.

export const PROFILE_FIELDS: ProfileField[] = SRE_CONFIG.profileFields;

/** `fields` list for the profile lookup query. */
export const PROFILE_SELECT = ["name", dqlColumn(APP_ID_FIELD), ...PROFILE_FIELDS.map((f) => dqlColumn(f.alias))].join(", ");

// The ServiceNow-import fallback returns raw records with their own column names.
const FALLBACK_KEYS: Record<string, string[]> = {
  tier: ["tier"],
  status: ["install_status", "u_operational_status"],
  director: ["app_owner_name"],
  owner: ["app_owner_name"],
  supportGroup: ["assignment_group", "u_support_group"],
};

export function profileValue(rec: Record<string, unknown>, f: ProfileField): string {
  for (const k of [f.alias, ...(FALLBACK_KEYS[f.key] ?? [])]) {
    const v = rec[k];
    if ((typeof v === "string" || typeof v === "number" || typeof v === "boolean") && String(v).trim() !== "") return String(v);
  }
  return "";
}

// ── Tier values ──────────────────────────────────────────────────────────────

export interface TierInfo {
  label: string;
  /** Position in the configured list: 0 = most critical. -1 when the value isn't configured. */
  rank: number;
  critical: boolean;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Interpret a raw tier value using Settings → Tier values. Unconfigured values fall back to the original text rules. */
export function tierInfo(raw: string): TierInfo {
  const v = norm(raw);
  const i = SRE_CONFIG.tiers.findIndex((t) => norm(t.value) === v);
  if (i >= 0) {
    const t = SRE_CONFIG.tiers[i];
    return { label: t.label || t.value, rank: i, critical: t.critical };
  }
  const legacyCritical = v.includes("1") || v.includes("2") || v.includes("most critical") || v.includes("somewhat critical");
  return { label: raw, rank: -1, critical: legacyCritical };
}

const DARK = ["#FF6B6B", "#FF9F5A", "#FBBF24", "#4ADE80"];
const LIGHT = ["#b91c1c", "#c2410c", "#a16207", "#15803d"];
const LEADERBOARD = ["#C93FDB", "#8D1CDC", "#5E28E5", "#49C2B3"];

/** Chip color for a tier: most critical = red end of the palette. */
export function tierChipColor(raw: string, palette: "dark" | "light"): string | undefined {
  const { rank } = tierInfo(raw);
  const colors = palette === "dark" ? DARK : LIGHT;
  if (rank >= 0) return colors[Math.min(rank, colors.length - 1)];
  return undefined;
}

/** Bar color for a tier in the leaderboard rollup. */
export function tierBarColor(raw: string): string {
  const { rank } = tierInfo(raw);
  return rank >= 0 ? LEADERBOARD[Math.min(rank, LEADERBOARD.length - 1)] : "#6F747F";
}

/** Subtitle for the critical-tier rollup. Keeps the original wording with the original tier values. */
export const CRITICAL_TIERS_NOTE: string = SRE_CONFIG.defaultTiers
  ? "(Tier 1-2 apps only)"
  : `(${SRE_CONFIG.tiers.filter((t) => t.critical).map((t) => t.label || t.value).join(" & ") || "no critical tiers set"} apps only)`;
