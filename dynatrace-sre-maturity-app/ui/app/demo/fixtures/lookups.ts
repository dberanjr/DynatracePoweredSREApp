import type { DemoFixture } from "../types";
import { DEMO_APPS } from "../portfolio";

// The Lookups tab loads each app-managed table with `load "<path>" | limit 20000`.
// Demo mode shows sample rows; saving is blocked in the page itself.

const TIER = { 1: "1 - most critical", 2: "2 - somewhat critical", 3: "3 - less critical", 4: "4 - not critical" } as const;

export const lookupsFixtures: DemoFixture[] = [
  {
    id: "lookups-cmdb",
    match: /^load "\/lookups\/dynatrace\/cmdb_appId_owner_mapping" \| limit \d+/,
    respond: () => ({
      records: DEMO_APPS.map((a) => ({
        applicationci: a.code.toLowerCase(),
        name: a.name,
        operational_status: a.status,
        business_criticality: TIER[a.tier],
        owned_by: a.owner,
        managed_by: a.owner,
        u_maintained_by: a.team,
        support_group: a.team,
        "managed_by.u_managing_director": a.owner,
        "managed_by.u_vp": a.owner,
        "managed_by.u_director": a.owner,
      })),
    }),
  },
  {
    id: "lookups-appId-map",
    match: /^load "\/lookups\/app_map" \| limit \d+/,
    respond: () => ({
      records: DEMO_APPS.slice(0, 5).map((a) => ({ app_name: a.name.toLowerCase().replace(/[^a-z0-9]/g, ""), applicationci: a.code.toLowerCase() })),
    }),
  },
  {
    id: "lookups-entity-severity",
    match: /^load "\/lookups\/entity_severity" \| limit \d+/,
    respond: () => ({
      records: DEMO_APPS.filter((a) => a.tier <= 2).map((a) => ({
        appId: a.code.toLowerCase(),
        entity_name: `${a.name} API`,
        severity: a.tier === 1 ? "critical" : "high",
        business_impact: "revenue",
      })),
    }),
  },
];
