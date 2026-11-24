// Shared demo dataset. Every fixture derives its numbers from this file so the
// portfolio, scorecards, dependencies and drill-downs tell one consistent story.

export interface DemoApp {
  /** ApplicationCI code (<= 3 chars, upper-case) — same shape as the real lookup. */
  code: string;
  name: string;
  owner: string;
  team: string;
  /** Entity-severity tier used by the app (1 = most critical). */
  tier: 1 | 2 | 3 | 4;
  status: "In Production" | "Implementing";
  /** Fraction (0..1) of checks passing per maturity level L1..L5. */
  level: [number, number, number, number, number];
  /** Ids of demo apps this app calls (downstream). Used for the dependency graph. */
  calls: string[];
}

export const DEMO_APPS: DemoApp[] = [
  { code: "ADH", name: "Acme Digital Hub", owner: "Priya Raman", team: "Digital Experience", tier: 1, status: "In Production", level: [1, 1, 0.9, 0.7, 0.4], calls: ["PAY", "CAT", "AUT"] },
  { code: "PAY", name: "Payments Gateway", owner: "Marcus Lee", team: "Payments Platform", tier: 1, status: "In Production", level: [1, 1, 1, 0.8, 0.6], calls: ["AUT", "LED", "FRD"] },
  { code: "CAT", name: "Product Catalog", owner: "Elena Rossi", team: "Commerce", tier: 2, status: "In Production", level: [1, 0.9, 0.7, 0.4, 0.2], calls: ["INV", "SRC"] },
  { code: "AUT", name: "Identity & Auth", owner: "Tom Becker", team: "Security Engineering", tier: 1, status: "In Production", level: [1, 1, 1, 0.9, 0.7], calls: [] },
  { code: "LED", name: "General Ledger", owner: "Aisha Khan", team: "Finance Systems", tier: 1, status: "In Production", level: [1, 0.8, 0.6, 0.3, 0.1], calls: ["NTF"] },
  { code: "FRD", name: "Fraud Detection", owner: "Jonas Weber", team: "Risk Engineering", tier: 2, status: "In Production", level: [1, 1, 0.8, 0.6, 0.5], calls: ["AUT"] },
  { code: "INV", name: "Inventory Service", owner: "Sofia Alvarez", team: "Supply Chain", tier: 2, status: "In Production", level: [0.9, 0.7, 0.5, 0.2, 0], calls: ["NTF"] },
  { code: "SRC", name: "Search & Discovery", owner: "Liam O'Brien", team: "Commerce", tier: 3, status: "In Production", level: [1, 0.8, 0.4, 0.2, 0], calls: [] },
  { code: "NTF", name: "Notification Hub", owner: "Yuki Tanaka", team: "Platform Services", tier: 3, status: "In Production", level: [0.8, 0.6, 0.3, 0.1, 0], calls: [] },
  { code: "RPT", name: "Reporting Warehouse", owner: "Grace Okafor", team: "Data Platform", tier: 3, status: "In Production", level: [0.7, 0.4, 0.2, 0, 0], calls: ["LED"] },
  { code: "MOB", name: "Mobile Backend", owner: "Diego Martins", team: "Digital Experience", tier: 2, status: "Implementing", level: [0.6, 0.3, 0.1, 0, 0], calls: ["AUT", "CAT"] },
  { code: "HRP", name: "HR Portal", owner: "Nina Petrova", team: "Corporate IT", tier: 4, status: "Implementing", level: [0.4, 0.1, 0, 0, 0], calls: ["AUT"] },
];

export const DEMO_APP_BY_CODE: Record<string, DemoApp> = Object.fromEntries(DEMO_APPS.map((a) => [a.code, a]));

/** Fallback when a query names an application ID we don't know about (or none at all). */
export const DEFAULT_DEMO_APP = DEMO_APP_BY_CODE["ADH"];

/**
 * Pull the application ID a query is scoped to. Looks for any known demo code appearing
 * as a quoted string literal (e.g. `== "PAY"`, `'ppay'`), case-insensitive.
 */
export function extractAppId(query: string): DemoApp {
  for (const a of DEMO_APPS) {
    const re = new RegExp(`["'\`]${a.code}["'\`]`, "i");
    if (re.test(query)) return a;
  }
  return DEFAULT_DEMO_APP;
}

/** Deterministic PRNG (mulberry32) so demo charts look the same every load. */
export function seeded(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
