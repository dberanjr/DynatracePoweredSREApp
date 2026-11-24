import type { DemoFixture } from "../types";
import { DEMO_APPS, extractAppId, seeded } from "../portfolio";
import type { DemoApp } from "../portfolio";
import { timeseries } from "../helpers";

// Portfolio-wide fixtures: application ID picker, app identity/profile strips, landing
// page MTTR, portfolio inventory and the maturity leaderboard bulk queries.

const TIER_LABEL: Record<DemoApp["tier"], string> = {
  1: "1 - most critical",
  2: "2 - somewhat critical",
  3: "3 - less critical",
  4: "4 - not critical",
};

// Per-app CMDB extras not carried by DEMO_APPS.
const DIRECTOR: Record<string, string> = {
  ADH: "Rachel Summers", PAY: "Anthony Cole", CAT: "Rachel Summers", AUT: "Helen Marsh",
  LED: "Victor Huang", FRD: "Helen Marsh", INV: "Anthony Cole", SRC: "Rachel Summers",
  NTF: "Dmitri Volkov", RPT: "Victor Huang", MOB: "Rachel Summers", HRP: "Dmitri Volkov",
};
const SUPPORT_GROUP: Record<string, string> = {
  ADH: "SRE - Digital Experience", PAY: "SRE - Payments", CAT: "SRE - Commerce", AUT: "SRE - Security Platform",
  LED: "AppOps - Finance Systems", FRD: "SRE - Risk Engineering", INV: "AppOps - Supply Chain", SRC: "SRE - Commerce",
  NTF: "SRE - Platform Services", RPT: "AppOps - Data Platform", MOB: "SRE - Digital Experience", HRP: "AppOps - Corporate IT",
};

/** Deterministic service count per app (bigger/more critical apps have more). */
function serviceCount(a: DemoApp): number {
  const base = { 1: 38, 2: 24, 3: 14, 4: 7 }[a.tier];
  return base + Math.floor(seeded("svc:" + a.code)() * 10);
}

const MAX = { l1: 7, l2: 6, l3: 7, l4: 5, l5: 5 };
const score = (a: DemoApp, idx: 0 | 1 | 2 | 3 | 4, max: number) => Math.round(a.level[idx] * max);

/** Runbooks Linked is added client-side from getAllRunbookCounts; apps with
 * decent L3 maturity have one. Exposed so the scorecards fork's function
 * fixture can stay consistent: counts keyed by lower-case application ID. */
export function demoRunbookCount(a: DemoApp): number {
  return score(a, 2, MAX.l3) >= 3 ? 1 + Math.floor(seeded("rb:" + a.code)() * 3) : 0;
}

const lc = (a: DemoApp) => a.code.toLowerCase();

export const portfolioFixtures: DemoFixture[] = [
  // ── App.tsx: application ID picker (lookup + entity-tag fallback) ──
  {
    id: "appId-picker-lookup",
    match: /filter operational_status != "Retired"/,
    respond: () => ({
      records: [...DEMO_APPS]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((a) => ({ applicationci: a.code, appName: a.name })),
    }),
  },
  {
    id: "appId-picker-fallback",
    match: /fieldsAdd appName = ""/,
    respond: () => ({
      records: [...DEMO_APPS]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((a) => ({ applicationci: a.code, appName: "" })),
    }),
  },

  // ── AppIdentityBar / AppContextBanner: per-app CMDB profile ──
  {
    id: "app-profile-lookup",
    match: (q) => /cmdb_appId_owner_mapping/.test(q) && /managed_by\.u_managing_director/.test(q) && /filter lower\(applicationci\) == lower\(/.test(q),
    respond: (q) => {
      const a = extractAppId(q);
      return {
        records: [
          {
            name: a.name,
            applicationci: a.code.toLowerCase(),
            business_criticality: TIER_LABEL[a.tier],
            operational_status: a.status,
            "managed_by.u_managing_director": DIRECTOR[a.code] ?? "Rachel Summers",
            owned_by: a.owner,
            support_group: SUPPORT_GROUP[a.code] ?? a.team,
          },
        ],
      };
    },
  },
  {
    id: "app-profile-fallback",
    match: (q) => /workflow\.import\.servicenow\.appId/.test(q) && /\| limit 1\s*$/.test(q),
    respond: (q) => {
      const a = extractAppId(q);
      return {
        records: [
          {
            ciname: a.name,
            applicationci: a.code.toLowerCase(),
            tier: TIER_LABEL[a.tier],
            install_status: a.status,
            app_owner_name: a.owner,
            assignment_group: SUPPORT_GROUP[a.code] ?? a.team,
          },
        ],
      };
    },
  },

  // ── LandingPage: MTTR sparkline (current week + previous week) ──
  {
    id: "landing-mttr-timeseries",
    match: /makeTimeseries `MTTR`/,
    respond: () =>
      timeseries("MTTR", { seed: "landing-mttr", base: 38, variance: 11, points: 28, stepMs: 6 * 60 * 60 * 1000 }),
  },
  {
    id: "landing-mttr-prev",
    match: /summarize `PrevAvg`/,
    respond: () => ({ records: [{ PrevAvg: 52.4 }] }),
  },

  // ── PortfolioPage: application inventory ──
  {
    id: "portfolio-inventory",
    match: /Services = serviceCount/,
    respond: () => ({
      records: [...DEMO_APPS]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((a) => ({
          AppId: a.code,
          Name: a.name,
          Tier: TIER_LABEL[a.tier],
          Owner: a.owner,
          Services: serviceCount(a),
        })),
    }),
  },

  // ── MaturityLeaderboard: bulk per-level scores (applicationci is lower-case) ──
  {
    id: "leaderboard-l1",
    match: /\| fields applicationci, l1Score/,
    respond: () => ({
      records: DEMO_APPS.map((a) => {
        const svc = serviceCount(a);
        return {
          applicationci: lc(a),
          l1Score: score(a, 0, MAX.l1),
          serviceCount: svc,
          hostCount: Math.max(2, Math.round(svc * 0.6)),
          k8sCount: a.tier <= 2 ? 3 + Math.floor(seeded("k8s:" + a.code)() * 6) : 0,
          logCount: 120000 + Math.floor(seeded("log:" + a.code)() * 900000),
        };
      }),
    }),
  },
  {
    id: "leaderboard-l2",
    match: /\| fields applicationci, l2Score/,
    respond: () => ({ records: DEMO_APPS.map((a) => ({ applicationci: lc(a), l2Score: score(a, 1, MAX.l2) })) }),
  },
  {
    id: "leaderboard-l3",
    match: /\| fields applicationci, l3Score/,
    respond: () => ({
      // DQL-side score excludes Runbooks Linked (merged in client-side from getAllRunbookCounts).
      records: DEMO_APPS.map((a) => ({
        applicationci: lc(a),
        l3Score: Math.max(0, score(a, 2, MAX.l3) - (demoRunbookCount(a) > 0 ? 1 : 0)),
      })),
    }),
  },
  {
    id: "leaderboard-l4",
    match: /\| fields applicationci, l4Score/,
    respond: () => ({ records: DEMO_APPS.map((a) => ({ applicationci: lc(a), l4Score: Math.min(score(a, 3, MAX.l4), 3) })) }),
  },
  {
    id: "leaderboard-l5",
    match: /\| fields applicationci, l5Score/,
    respond: () => ({ records: DEMO_APPS.map((a) => ({ applicationci: lc(a), l5Score: Math.min(score(a, 4, MAX.l5), 3) })) }),
  },

  // ── MaturityLeaderboard: CMDB lookup (+ bizevent fallback) ──
  {
    id: "leaderboard-cmdb-lookup",
    match: /fields appId, ciname = name, tier = business_criticality/,
    respond: () => ({
      records: DEMO_APPS.map((a) => ({
        appId: lc(a),
        ciname: a.name,
        tier: TIER_LABEL[a.tier],
        app_owner_name: a.owner,
      })),
    }),
  },
  {
    id: "leaderboard-cmdb-fallback",
    match: /\| fields appId, ciname, tier, app_owner_name\s*$/,
    respond: () => ({
      records: DEMO_APPS.map((a) => ({
        appId: lc(a),
        ciname: a.name,
        tier: TIER_LABEL[a.tier],
        app_owner_name: a.owner,
      })),
    }),
  },
];
