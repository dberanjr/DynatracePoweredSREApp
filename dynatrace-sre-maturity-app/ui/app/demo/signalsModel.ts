// Per-app signal model backing the signals/observability page fixtures.
// Everything is derived deterministically from DEMO_APPS + services.ts so the
// Overview, Golden Signals, AI Ops, Proactive and Problem pages agree with
// each other (and with the Dependencies page service ids).
import { DemoApp, seeded } from "./portfolio";
import { servicesForApp, DemoService } from "./services";
import type { DemoRecord, DemoResult } from "./types";

/** 0..1 — how healthy an app is, from its L1–L3 maturity. */
export const health = (app: DemoApp): number => (app.level[0] + app.level[1] + app.level[2]) / 3;

/** Integer total spread across `points` buckets; the buckets sum to exactly `total`. */
export function distribute(total: number, points: number, seed: string): number[] {
  const r = seeded(seed);
  const w = Array.from({ length: points }, () => 0.15 + r());
  const sum = w.reduce((a, b) => a + b, 0);
  const out = w.map((x) => Math.floor((x / sum) * total));
  let rest = total - out.reduce((a, b) => a + b, 0);
  for (let i = 0; rest > 0; i = (i + 7) % points, rest--) out[i] += 1;
  return out;
}

/**
 * Timeseries result in the exact shape convertToTimeseries() needs: ONE types
 * entry per record range whose mappings hold dims + timeframe + interval + the
 * array field(s).
 */
export function tsResult(
  valueField: string,
  series: { dims?: Record<string, string>; values: number[] }[],
  stepMs: number
): DemoResult {
  const points = series[0]?.values.length ?? 0;
  const end = Math.floor(Date.now() / stepMs) * stepMs;
  const start = end - points * stepMs;
  const records: DemoRecord[] = series.map((s) => ({
    ...(s.dims ?? {}),
    timeframe: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
    interval: String(stepMs * 1_000_000),
    [valueField]: s.values,
  }));
  const mappings: Record<string, unknown> = {};
  for (const k of Object.keys(series[0]?.dims ?? {})) mappings[k] = { type: "string" };
  mappings.timeframe = { type: "timeframe" };
  mappings.interval = { type: "duration" };
  mappings[valueField] = { type: "array", types: [{ mappings: { element: { type: "double" } } }] };
  return { records, types: [{ mappings, indexRange: [0, records.length - 1] }] };
}

// ── Services / golden signals ───────────────────────────────────────────────

export const SVC_POINTS = 288; // 24h @ 5m
export const SVC_STEP = 5 * 60 * 1000;

export interface SvcSignals {
  svc: DemoService;
  requests: number[];
  errors: number[];
  p90: number[]; // microseconds
  p99: number[];
}

export function svcSignals(app: DemoApp): SvcSignals[] {
  return servicesForApp(app.code).map((svc) => {
    const r = seeded(`sig:${svc.id}`);
    const perBucket = svc.reqCount / 12; // 1h count -> 5m bucket
    const errRate = svc.reqCount > 0 ? svc.failCount / svc.reqCount : 0;
    const requests: number[] = [];
    const errors: number[] = [];
    const p90: number[] = [];
    const p99: number[] = [];
    for (let i = 0; i < SVC_POINTS; i++) {
      const day = 0.75 + 0.25 * Math.sin((i / SVC_POINTS) * Math.PI * 2 - 1.2); // diurnal curve
      const req = Math.round(perBucket * day * (0.85 + r() * 0.3));
      const spike = svc.problem && i > SVC_POINTS - 40 ? 2.5 : 1;
      requests.push(req);
      errors.push(Math.round(req * errRate * spike * (0.6 + r() * 0.8)));
      const lat = svc.p95Us * 0.85 * (0.8 + r() * 0.4) * (svc.problem && i > SVC_POINTS - 40 ? 1.6 : 1);
      p90.push(Math.round(lat));
      p99.push(Math.round(lat * (1.6 + r() * 0.3)));
    }
    return { svc, requests, errors, p90, p99 };
  });
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const avg = (a: number[]) => (a.length ? sum(a) / a.length : 0);

export function svcTotals(app: DemoApp) {
  const s = svcSignals(app);
  return {
    totalRequests: s.reduce((t, x) => t + sum(x.requests), 0),
    totalErrors: s.reduce((t, x) => t + sum(x.errors), 0),
    avgP90ms: s.length ? Math.round((s.reduce((t, x) => t + avg(x.p90), 0) / s.length / 1000) * 10) / 10 : 0,
    services: s.length,
    rows: s.map((x) => {
      const req = sum(x.requests);
      const err = sum(x.errors);
      return {
        Service: x.svc.name,
        Requests: req,
        Errors: err,
        "Error %": req > 0 ? Math.round((err * 100 * 100) / req) / 100 : 0,
        "P90 (ms)": Math.round((avg(x.p90) / 1000) * 10) / 10,
      };
    }),
  };
}

// ── Infrastructure inventory ────────────────────────────────────────────────

export function inventory(app: DemoApp) {
  const r = seeded(`inv:${app.code}`);
  const code = app.code.toLowerCase();
  const nHosts = 2 + Math.round(health(app) * 4) + (app.tier === 1 ? 2 : 0);
  const hosts = Array.from({ length: nHosts }, (_, i) => ({
    Host: `${code}-prod-vm-${String(i + 1).padStart(2, "0")}.corp.example.com`,
    monitoringMode: app.level[1] >= 0.8 || i === 0 ? "FULL_STACK" : "INFRASTRUCTURE",
  }));
  const workloadNames = ["frontend", "api", "worker", "scheduler", "gateway", "cache-sidecar"];
  const nWork = app.level[2] > 0.2 ? 3 + Math.floor(r() * 3) : 0;
  const workloads = workloadNames.slice(0, nWork).map((w) => `${code}-${w}`);
  const awsTypes = [
    "AWS_EC2_INSTANCE",
    "AWS_RDS_INSTANCE",
    "AWS_LAMBDA_FUNCTION",
    "AWS_S3_BUCKET",
    "AWS_ELASTICLOADBALANCING_LOADBALANCER",
    "AWS_SQS_QUEUE",
  ];
  const awsOn = app.level[3] > 0.15;
  const aws = awsOn
    ? awsTypes.slice(0, 3 + Math.floor(r() * 4)).map((type) => ({ type, Count: 1 + Math.floor(r() * 9) * (type === "AWS_EC2_INSTANCE" ? 2 : 1) }))
    : [];
  aws.sort((a, b) => b.Count - a.Count);
  return {
    hosts,
    workloads,
    aws,
    processGroups: servicesForApp(app.code).length * 2 + 1,
    rum: app.level[1] >= 0.9 ? 2 : app.level[1] >= 0.4 ? 1 : 0,
  };
}

// ── Davis events (AI Ops / Proactive) ───────────────────────────────────────

export const EVENT_POINTS = 48;
export const EVENT_STEP = 30 * 60 * 1000;
export const EVENT_CATEGORIES = ["AVAILABILITY", "ERROR", "SLOWDOWN", "RESOURCE_CONTENTION", "CUSTOM_ALERT"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export function eventSeries(app: DemoApp): Record<EventCategory, number[]> {
  const r = seeded(`ev:${app.code}`);
  const scale = 1 + (1 - health(app)) * 5 + (app.tier === 1 ? 1 : 0);
  const mk = (base: number, cat: string) => distribute(Math.round(base * scale * (0.7 + r() * 0.6)), EVENT_POINTS, `ev:${app.code}:${cat}`);
  return {
    AVAILABILITY: mk(2, "a"),
    ERROR: mk(5, "e"),
    SLOWDOWN: mk(6, "s"),
    RESOURCE_CONTENTION: mk(4 + (app.level[3] < 0.5 ? 3 : 0), "r"),
    CUSTOM_ALERT: mk(8 + (app.level[3] < 0.5 ? 8 : 0), "c"),
  };
}

const EVENT_TYPES: Record<EventCategory, string[]> = {
  AVAILABILITY: ["SERVICE_UNAVAILABLE", "PROCESS_UNAVAILABLE", "PGI_UNAVAILABLE"],
  ERROR: ["FAILURE_RATE_INCREASED", "HTTP_5XX_ERRORS", "EXCEPTION_RATE_INCREASED"],
  SLOWDOWN: ["RESPONSE_TIME_DEGRADED", "SLOW_REQUESTS_INCREASED", "DB_RESPONSE_TIME_DEGRADED"],
  RESOURCE_CONTENTION: ["CPU_SATURATION", "MEMORY_SATURATION", "DISK_LOW_SPACE", "CONNECTION_POOL_EXHAUSTED"],
  CUSTOM_ALERT: ["CUSTOM_ALERT", "CUSTOM_DEPLOYMENT_ALERT", "SYNTHETIC_CHECK_FAILED"],
};

export function eventModel(app: DemoApp) {
  const series = eventSeries(app);
  const byCat = Object.fromEntries(EVENT_CATEGORIES.map((c) => [c, sum(series[c])])) as Record<EventCategory, number>;
  const total = sum(Object.values(byCat));
  const types: { "event.type": string; Events: number }[] = [];
  for (const c of EVENT_CATEGORIES) {
    const names = EVENT_TYPES[c];
    const parts = distribute(byCat[c], names.length, `evt:${app.code}:${c}`);
    names.forEach((n, i) => parts[i] > 0 && types.push({ "event.type": n, Events: parts[i] }));
  }
  types.sort((a, b) => b.Events - a.Events);
  const svcNames = servicesForApp(app.code).map((s) => s.name);
  const perSvc = distribute(total, svcNames.length, `evs:${app.code}`);
  const noisy = svcNames.map((serviceName, i) => ({ serviceName, Events: perSvc[i] })).sort((a, b) => b.Events - a.Events);
  const deployTotal = Math.round(2 + app.level[3] * 28 + app.level[4] * 10);
  return { series, byCat, total, types, noisy, deploys: distribute(deployTotal, EVENT_POINTS, `dep:${app.code}`) };
}

// ── Davis problems ──────────────────────────────────────────────────────────

const PROBLEM_NAMES: Record<EventCategory, string[]> = {
  AVAILABILITY: ["Service unavailable", "Pod crash looping", "Host or monitoring unavailable"],
  ERROR: ["Failure rate increase", "Multiple service problems"],
  SLOWDOWN: ["Response time degradation", "Slow database queries"],
  RESOURCE_CONTENTION: ["CPU saturation", "Memory saturation"],
  CUSTOM_ALERT: ["Queue depth above threshold", "Synthetic check failing", "Error budget burn rate high", "Certificate expiring soon"],
};

export function problemModel(app: DemoApp) {
  const r = seeded(`prb:${app.code}`);
  const h = health(app);
  const services = servicesForApp(app.code);
  const activeIds = new Set(services.filter((s) => s.problem).map((s) => s.problem!.problemId));
  const active = activeIds.size;
  const total = Math.max(active + 2, Math.round(4 + (1 - h) * 34 + r() * 6));
  const closed = total - active;
  const userImpacting = Math.round(total * (0.15 + (1 - h) * 0.3));
  const mttr = Math.round((22 + (1 - h) * 95 - app.level[2] * 12 + r() * 10) * 10) / 10;
  const catWeights: Record<EventCategory, number> = { AVAILABILITY: 0.1, ERROR: 0.25, SLOWDOWN: 0.28, RESOURCE_CONTENTION: 0.12, CUSTOM_ALERT: 0.25 };
  const catCounts = EVENT_CATEGORIES.map((c) => Math.round(total * catWeights[c]));
  catCounts[2] += total - catCounts.reduce((a, b) => a + b, 0); // fix rounding on SLOWDOWN
  const byCat = EVENT_CATEGORIES.map((c, i) => ({ "event.category": c, Problems: Math.max(0, catCounts[i]) })).filter((x) => x.Problems > 0).sort((a, b) => b.Problems - a.Problems);

  const names: { "event.name": string; Problems: number }[] = [];
  for (const row of byCat) {
    const list = PROBLEM_NAMES[row["event.category"] as EventCategory];
    const parts = distribute(row.Problems, list.length, `pn:${app.code}:${row["event.category"]}`);
    list.forEach((n, i) => parts[i] > 0 && names.push({ "event.name": n, Problems: parts[i] }));
  }
  names.sort((a, b) => b.Problems - a.Problems);

  const customAlerts = byCat.find((x) => x["event.category"] === "CUSTOM_ALERT")?.Problems ?? 0;
  const alertParts = distribute(customAlerts, PROBLEM_NAMES.CUSTOM_ALERT.length, `pa:${app.code}`);
  const noisyAlerts = PROBLEM_NAMES.CUSTOM_ALERT.map((alertName, i) => ({ alertName, Count: alertParts[i] }))
    .filter((x) => x.Count > 0)
    .sort((a, b) => b.Count - a.Count);

  const svcParts = distribute(total, services.length, `ps:${app.code}`);
  const alertingServices = services
    .map((s, i) => ({ Service: s.name, Problems: svcParts[i] + (s.problem ? 2 : 0) }))
    .sort((a, b) => b.Problems - a.Problems);

  const rcNames = [...services.map((s) => s.name), ...inventory(app).hosts.slice(0, 2).map((x) => x.Host.split(".")[0])];
  const rcParts = distribute(Math.max(1, Math.round(total * 0.8)), rcNames.length, `rc:${app.code}`);
  const rootCauses = rcNames.map((rcName, i) => ({ rcName, Problems: rcParts[i] })).filter((x) => x.Problems > 0).sort((a, b) => b.Problems - a.Problems).slice(0, 15);

  const eventTypes = ["RESPONSE_TIME_DEGRADED", "FAILURE_RATE_INCREASED", "CPU_SATURATION", "SERVICE_UNAVAILABLE", "MEMORY_SATURATION", "CUSTOM_ALERT"];
  const mttrByType = eventTypes
    .map((t, i) => ({ "event.type": t, "Avg MTTR (min)": Math.round(mttr * (0.5 + ((i * 37 + app.code.charCodeAt(0)) % 17) / 14) * 10) / 10 }))
    .sort((a, b) => b["Avg MTTR (min)"] - a["Avg MTTR (min)"]);

  const P = 48;
  const closedSeries = distribute(closed, P, `pc:${app.code}`);
  const activeSeries = new Array(P).fill(0);
  if (active > 0) activeSeries[P - 3] = active;
  const catSeries = byCat.map((c) => ({ dims: { "event.category": c["event.category"] as string }, values: distribute(c.Problems, P, `pcs:${app.code}:${c["event.category"]}`) }));
  const rr = seeded(`pm:${app.code}`);
  const mttrSeries = Array.from({ length: P }, () => Math.round(mttr * (0.6 + rr() * 0.8) * 10) / 10);
  const medSeries = (cat: string) => Array.from({ length: P }, () => Math.round(mttr * 0.7 * (0.5 + rr() * 1.0) * 10) / 10 + cat.length * 0);

  return {
    total, active, closed, userImpacting, mttr, noisy: customAlerts, byCat, names, noisyAlerts, alertingServices, rootCauses, mttrByType,
    activeVsClosed: [
      { dims: { "event.status": "CLOSED" }, values: closedSeries },
      { dims: { "event.status": "ACTIVE" }, values: activeSeries },
    ],
    catSeries,
    mttrSeries,
    medianSeries: byCat.map((c) => ({ dims: { "event.category": c["event.category"] as string }, values: medSeries(String(c["event.category"])) })),
  };
}
