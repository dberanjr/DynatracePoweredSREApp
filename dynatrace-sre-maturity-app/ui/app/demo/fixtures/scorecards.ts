import type { DemoFixture, DemoFunctionFixture, DemoRecord } from "../types";
import { DEMO_APPS, DEMO_APP_BY_CODE, extractAppId, seeded } from "../portfolio";
import type { DemoApp } from "../portfolio";
import { upstreamIds } from "../services";
import { CHECK_DETAIL_CONFIGS } from "../../components/checkDetailConfigs";
import {
  DAY, HOUR, baselineScore, checkValue, dayStart, getFacts, hasK8s, iso,
} from "../scorecardModel";
import type { Facts, LevelNo } from "../scorecardModel";

// Scorecards page (L1..L5 + trend), the check-detail modal (every per-check
// detail/secondary query) and the app functions behind it. All numbers come
// from demo/scorecardModel.ts so headline strings and drill-downs agree.

const REQ_PER_LEVEL: Record<LevelNo, number> = { 1: 7, 2: 6, 3: 7, 4: 5, 5: 5 };
const MAX_TOTAL = 30;

// ───────────────────────── scorecard level records ─────────────────────────

function levelRecord(f: Facts, level: LevelNo): DemoRecord {
  const rec: DemoRecord = { [`L${level} Score`]: `${baselineScore(f, level)} / ${REQ_PER_LEVEL[level]}` };
  const names = CHECK_NAMES[level];
  names.forEach((name, i) => {
    rec[name] = checkValue(f, level, i + 1);
  });
  return rec;
}

const CHECK_NAMES: Record<LevelNo, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
for (const key of Object.keys(CHECK_DETAIL_CONFIGS)) {
  const cfg = CHECK_DETAIL_CONFIGS[key];
  const lvl = Number(cfg.level.slice(1)) as LevelNo;
  CHECK_NAMES[lvl][Number(key.split(".")[0]) - 1] = key;
}

const levelFixtures: DemoFixture[] = ([1, 2, 3, 4, 5] as LevelNo[]).map((level) => ({
  id: `scorecard-l${level}`,
  match: new RegExp(`^// L${level} [A-Za-z\\- ]+ - Maturity Scorecard`),
  respond: (q: string) => ({ records: [levelRecord(getFacts(extractAppId(q)), level)] }),
}));

// Trend: ~60 daily snapshots climbing to today's scores.
function trendRecords(app: DemoApp): DemoRecord[] {
  const f = getFacts(app);
  const cur = ([1, 2, 3, 4, 5] as LevelNo[]).map((l) => {
    const set = f.pass[l];
    return set.size; // full score incl. live runbooks for L3
  });
  const r = seeded("trend:" + app.code);
  const days = 60;
  const out: DemoRecord[] = [];
  let prev = cur.map(() => 0);
  for (let d = days - 1; d >= 0; d--) {
    const progress = 0.45 + 0.55 * ((days - 1 - d) / (days - 1));
    const scores = cur.map((c, i) => {
      const target = Math.round(c * progress + (r() - 0.5) * 0.6);
      const v = Math.max(prev[i], Math.min(c, Math.max(0, target)));
      return d === 0 ? c : v;
    });
    prev = scores;
    const total = scores.reduce((s, x) => s + x, 0);
    const pct = Math.round((total / MAX_TOTAL) * 100);
    // grade: same 80% gate as the daily snapshot workflow
    let idx = 0;
    const maxes = [7, 6, 7, 5, 5];
    for (let i = 0; i < 5; i++) {
      if (scores[i] / maxes[i] >= 0.8) idx = Math.min(i + 1, 4);
      else { idx = i; break; }
    }
    const ts = dayStart(d) + 6 * HOUR;
    out.push({
      timestamp: iso(ts),
      snapshotDate: new Date(ts).toISOString().slice(0, 10),
      l1Score: scores[0], l2Score: scores[1], l3Score: scores[2], l4Score: scores[3], l5Score: scores[4],
      total, totalMax: MAX_TOTAL, pct, grade: `L${idx + 1}`,
    });
  }
  return out;
}

const trendFixture: DemoFixture = {
  id: "scorecard-trend",
  match: /\| fields timestamp, snapshotDate, l1Score, l2Score/,
  respond: (q) => ({ records: trendRecords(extractAppId(q)) }),
};

// ───────────────────────── modal helpers ─────────────────────────

const appInfoFixture: DemoFixture = {
  id: "modal-app-info",
  match: /fields appName = name, tier = business_criticality, owner = owned_by/,
  respond: (q) => {
    const a = extractAppId(q);
    const label = { 1: "1 - most critical", 2: "2 - somewhat critical", 3: "3 - less critical", 4: "4 - not critical" }[a.tier];
    return { records: [{ appName: a.name, tier: label, owner: a.owner }] };
  },
};

const cloudAccountFixture: DemoFixture = {
  id: "modal-cloud-account",
  match: /summarize accountIds = collectDistinct\(aws\.account\.id\)/,
  respond: (q) => {
    const a = extractAppId(q);
    const r = seeded("acct:" + a.code);
    let id = "";
    for (let i = 0; i < 12; i++) id += Math.floor(r() * 10);
    return { records: [{ accountId: id, accountName: `${a.name} Production` }] };
  },
};

// ───────────────────────── per-check generators ─────────────────────────

type Gen = (f: Facts, facet?: string) => DemoRecord[];

const dailyStamps = (days: number) => Array.from({ length: days }, (_, i) => dayStart(days - 1 - i));
const hourStamps = (hours: number) => {
  const end = Math.floor(Date.now() / HOUR) * HOUR;
  return Array.from({ length: hours }, (_, i) => end - (hours - 1 - i) * HOUR);
};

const notAdopted = (status: string, message: string): Gen => () => [{ status, message }];

const problemsDonut = (f: Facts): DemoRecord[] =>
  [
    { classification: "Causal (investigable)", problems: f.causal.length },
    { classification: "Noise (single-event alerts)", problems: f.noiseTotal },
    { classification: "Other (unclassified)", problems: f.otherCount },
  ].filter((x) => x.problems > 0);

const facetDeploys = (f: Facts, facet?: string) => (facet ? f.deploys.filter((d) => d.environment === facet) : f.deploys);

// Tenant-wide Automation Engine workflows (the L3 ITSM and L5 detail queries
// are not scoped to one application ID — they list every workflow that ran).
interface Wf { workflow: string; workflowId: string; executions: number; succeeded: number; failed: number; lastRun: string; itsm: boolean }
let tenantWfCache: Wf[] | null = null;
function tenantWorkflows(): Wf[] {
  if (tenantWfCache) return tenantWfCache;
  const out: Wf[] = [];
  for (const app of DEMO_APPS) {
    const f = getFacts(app);
    const r = seeded("wf:" + app.code);
    const titles = [...(f.itsm ? [`${app.code} Production Dynatrace Alerts`] : []), ...f.workflowTitles];
    titles.forEach((t, i) => {
      const executions = t.includes("Production Dynatrace Alerts") ? 40 + Math.floor(r() * 160) : 8 + Math.floor(r() * 90);
      const failed = Math.floor(executions * (r() < 0.3 ? 0.08 : 0.01));
      out.push({
        workflow: t, workflowId: `${(1000 + out.length * 37).toString(16)}${Math.floor(r() * 1e8).toString(16)}-demo-wf`.slice(0, 36),
        executions, succeeded: executions - failed, failed, lastRun: iso(Date.now() - (i + r()) * 0.4 * DAY),
        itsm: t.includes("Production Dynatrace Alerts"),
      });
    });
  }
  out.push(
    { workflow: "Platform Nightly Cloud Inventory", workflowId: "b7a1c0de-0001-demo-wf", executions: 30, succeeded: 30, failed: 0, lastRun: iso(Date.now() - 6 * HOUR), itsm: false },
    { workflow: "Refresh lookups - guardians by appId", workflowId: "b7a1c0de-0002-demo-wf", executions: 30, succeeded: 29, failed: 1, lastRun: iso(Date.now() - 9 * HOUR), itsm: false },
    { workflow: "DT-SRE APP: Daily Maturity Snapshot (one bizevent per AppId)", workflowId: "b7a1c0de-0003-demo-wf", executions: 30, succeeded: 30, failed: 0, lastRun: iso(Date.now() - 5 * HOUR), itsm: false },
  );
  tenantWfCache = out.sort((a, b) => b.executions - a.executions);
  return tenantWfCache;
}
const wfRow = (w: Wf): DemoRecord => ({ workflow: w.workflow, workflowId: w.workflowId, executions: w.executions, succeeded: w.succeeded, failed: w.failed, lastRun: w.lastRun });

interface CheckGen { detail?: Gen; secondary?: Gen }

const GENS: Record<string, CheckGen> = {
  // ── L1 ──
  "1. OneAgent Deployed": {
    detail: (f) =>
      [...f.hosts]
        .sort((a, b) => (a.mode === "Infrastructure" ? 0 : 1) - (b.mode === "Infrastructure" ? 0 : 1) || a.name.localeCompare(b.name))
        .map((h) => ({ entity: h.name, mode: h.mode, entityId: h.id })),
    secondary: (f) => {
      const modes: [string, number][] = [
        ["FULL_STACK", f.hosts.filter((h) => h.mode === "Full-Stack").length],
        ["FULL_STACK (PaaS)", f.hosts.filter((h) => h.mode === "Full-Stack (PaaS)").length],
        ["INFRASTRUCTURE", f.hosts.filter((h) => h.mode === "Infrastructure").length],
      ];
      return dailyStamps(7).flatMap((ts) => modes.filter(([, n]) => n > 0).map(([mode, n]) => ({ timestamp: iso(ts), mode, hosts: n })));
    },
  },
  "2. Tracing Validated": {
    detail: (f) =>
      f.svcs.map((s) => ({ service: s.name, entityId: s.id, traces: Math.round(s.reqCount / 14) })).sort((a, b) => b.traces - a.traces),
    secondary: (f) => {
      const total = f.svcs.reduce((s, x) => s + x.reqCount, 0);
      const fail = f.svcs.reduce((s, x) => s + x.failCount, 0);
      const end = Math.floor(Date.now() / (15 * 60_000)) * 15 * 60_000;
      return Array.from({ length: 8 }, (_, i) => end - (7 - i) * 15 * 60_000).flatMap((ts, i) => {
        const base = Math.round((total / 8) * (0.85 + ((i * 37) % 30) / 100));
        const failed = Math.round((fail / 8) * (0.7 + ((i * 53) % 60) / 100));
        return [
          { timestamp: iso(ts), outcome: "SUCCESS", traces: Math.max(0, base - failed) },
          { timestamp: iso(ts), outcome: "FAILED", traces: failed },
        ];
      });
    },
  },
  "3. Logs Correlated": {
    detail: (f) => {
      const r = seeded("logs:" + f.app.code);
      const rows = f.hosts.map((h) => {
        const total = Math.round(80_000 + r() * 900_000);
        return { type: "Host", source: h.name, totalLogs: total, errorLogs: Math.round(total * r() * 0.03), warnLogs: Math.round(total * r() * 0.08) };
      });
      f.svcs.slice(0, 2).forEach((s) => {
        const total = Math.round(20_000 + r() * 200_000);
        rows.push({ type: "Service", source: s.name.toLowerCase().replace(/\s+/g, "-"), totalLogs: total, errorLogs: Math.round(total * 0.02), warnLogs: Math.round(total * 0.06) });
      });
      return rows.sort((a, b) => b.totalLogs - a.totalLogs);
    },
    secondary: (f) => {
      const r = seeded("logtrend:" + f.app.code);
      const base = 60_000 + f.hosts.length * 18_000;
      return hourStamps(24).flatMap((ts) => {
        const v = Math.round(base * (0.7 + r() * 0.6));
        return [
          { timestamp: iso(ts), status: "INFO", logCount: Math.round(v * 0.9) },
          { timestamp: iso(ts), status: "WARN", logCount: Math.round(v * 0.07) },
          { timestamp: iso(ts), status: "ERROR", logCount: Math.round(v * 0.03) },
        ];
      });
    },
  },
  "4. Smartscape Discovery": {
    detail: (f) =>
      [...f.svcs].sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ service: s.name, entityId: s.id, downstream: s.callsIds.length, upstream: upstreamIds(s.id).length })),
  },
  "5. Kubernetes": {
    detail: (f) => {
      if (!hasK8s(f.app)) return [];
      const r = seeded("k8sw:" + f.app.code);
      const nsList = [`${f.app.code.toLowerCase()}-prod`, `${f.app.code.toLowerCase()}-shared`];
      const rows = f.svcs.flatMap((s, i) => {
        const base = s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const desired = 2 + Math.floor(r() * 4);
        const degraded = f.pass[1].has(5) ? false : i === 1;
        return [{
          workload: base, namespace: nsList[0], desired, running: degraded ? desired - 1 : desired,
          "health events": degraded ? 7 + Math.floor(r() * 12) : Math.floor(r() * 3), entityId: "K8S_DEPLOYMENT-" + (1000 + i * 17 + f.app.code.charCodeAt(0)).toString(16).toUpperCase().padStart(16, "A"),
        }, {
          workload: `${base}-worker`, namespace: nsList[1], desired: 1, running: 1,
          "health events": Math.floor(r() * 2), entityId: "K8S_DEPLOYMENT-" + (2000 + i * 31 + f.app.code.charCodeAt(1)).toString(16).toUpperCase().padStart(16, "B"),
        }];
      });
      return rows.sort((a, b) => Number(a.running >= a.desired) - Number(b.running >= b.desired) || a.workload.localeCompare(b.workload));
    },
    secondary: (f) => {
      if (!hasK8s(f.app)) return [];
      const r = seeded("k8sev:" + f.app.code);
      const noisy = !f.pass[1].has(5);
      return hourStamps(24).flatMap((ts) => {
        const rows: DemoRecord[] = [];
        const restarts = Math.floor(r() * (noisy ? 6 : 2));
        if (restarts) rows.push({ timestamp: iso(ts), category: "Restarts", count: restarts });
        const unhealthy = Math.floor(r() * (noisy ? 4 : 1.3));
        if (unhealthy) rows.push({ timestamp: iso(ts), category: "Unhealthy", count: unhealthy });
        if (noisy && r() < 0.35) rows.push({ timestamp: iso(ts), category: "Failed Scheduling", count: 1 + Math.floor(r() * 3) });
        if (noisy && r() < 0.2) rows.push({ timestamp: iso(ts), category: "OOM Kills", count: 1 });
        return rows;
      });
    },
  },
  "6. Cloud": {
    detail: (f) =>
      [...f.cloud].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)).map((c) => ({ type: c.type, name: c.name, region: c.region, provider: c.provider, entityId: c.id })),
    secondary: (f) => {
      const byType = new Map<string, { n: number; regions: Set<string>; rt: string }>();
      for (const c of f.cloud) {
        const e = byType.get(c.type) ?? { n: 0, regions: new Set<string>(), rt: c.resourceType };
        e.n++;
        e.regions.add(c.region);
        byType.set(c.type, e);
      }
      return [...byType.entries()]
        .sort((a, b) => b[1].n - a[1].n)
        .map(([type, e]) => ({ type, provider: "AWS", count: e.n, regions: [...e.regions].sort(), resourceType: e.rt }));
    },
  },
  "7. RUM / Synthetics": {
    detail: (f) => f.rum.map((x) => ({ app: x.app, type: "RUM", active: x.active ? "Active" : "Inactive" })).sort((a, b) => String(a.active).localeCompare(String(b.active))),
  },

  // ── L2 ──
  "1. Golden Signal SLIs": {
    detail: (f) =>
      f.svcs
        .map((s) => ({ service: s.name, entityId: s.id, requests: s.reqCount, errorRate: Math.round((s.failCount * 10000) / Math.max(1, s.reqCount)) / 100, p95Ms: Math.round(s.p95Us / 100) / 10 }))
        .sort((a, b) => b.errorRate - a.errorRate || b.requests - a.requests),
    secondary: (f) => {
      const r = seeded("gs:" + f.app.code);
      const req = f.svcs.reduce((s, x) => s + x.reqCount, 0) / 2;
      const err = (f.svcs.reduce((s, x) => s + x.failCount, 0) * 100) / Math.max(1, f.svcs.reduce((s, x) => s + x.reqCount, 0));
      const p95 = f.svcs.reduce((s, x) => s + x.p95Us, 0) / f.svcs.length / 1000;
      const end = Math.floor(Date.now() / (30 * 60_000)) * 30 * 60_000;
      return Array.from({ length: 12 }, (_, i) => end - (11 - i) * 30 * 60_000).map((ts) => ({
        timestamp: iso(ts),
        bReq: Math.round(req * (0.75 + r() * 0.5)),
        bErr: Math.round(err * (0.6 + r() * 0.9) * 100) / 100,
        bP95: Math.round(p95 * (0.8 + r() * 0.4) * 10) / 10,
        bCpu: Math.round((38 + r() * 30) * 10) / 10,
      }));
    },
  },
  "5. SRE Assessment in ARD": {
    detail: (f) => {
      if (!f.pass[2].has(5)) return [];
      const a = f.app;
      return [0, 1, 2].map((i) => ({
        ciName: a.name, tier: { 1: "1 - most critical", 2: "2 - somewhat critical", 3: "3 - less critical", 4: "4 - not critical" }[a.tier],
        owner: a.owner, supportGroup: `${a.code.toLowerCase()}-support@example.com`, escalationGroup: `SRE - ${a.team}`, timestamp: iso(Date.now() - (i * 0.9 + 0.1) * DAY),
      }));
    },
    secondary: (f) => (f.pass[2].has(5) ? dailyStamps(7).map((ts) => ({ timestamp: iso(ts), importCount: 1 })) : []),
  },
  "6. Critical Services Tagged": {
    detail: (f) => f.critical.map((c) => ({ service: c.service, severity: c.severity.toLowerCase(), businessImpact: c.businessImpact, resolved: c.resolved })),
  },

  // ── L3 ──
  "1. Causal AI Detection + Event Correlation": {
    detail: (f) =>
      f.causal.map((p) => ({ problem: p.name, category: p.category, status: p.status, eventsGrouped: p.events, entities: p.entities, rootCause: p.rootCause ?? "Not identified", started: p.started, problemId: p.id })),
    secondary: problemsDonut,
  },
  "2. CI/CD Integration": {
    detail: (f, facet) =>
      facetDeploys(f, facet).map((d) => ({ repo: d.repo, environment: d.environment, ref: d.ref, outcome: d.outcome, durationSec: d.durationSec, platform: d.platform, deployed: iso(d.ts), url: d.url })),
    secondary: (f, facet) => {
      const buckets = new Map<string, number>();
      for (const d of facetDeploys(f, facet)) {
        const day = iso(Math.floor(d.ts / DAY) * DAY);
        const k = `${day}|${d.outcome.toUpperCase()}`;
        buckets.set(k, (buckets.get(k) ?? 0) + 1);
      }
      return [...buckets.entries()].sort().map(([k, deploys]) => { const [timestamp, outcome] = k.split("|"); return { timestamp, outcome, deploys }; });
    },
  },
  "3. ITSM Integration": {
    detail: () => tenantWorkflows().filter((w) => w.itsm).map(wfRow),
    secondary: () => {
      const n = tenantWorkflows().filter((w) => w.itsm).reduce((s, w) => s + w.executions, 0);
      return [
        { channel: "Microsoft Teams", notifications: Math.round(n * 1.6) },
        { channel: "Email", notifications: Math.round(n * 0.9) },
      ];
    },
  },
  "5. Alert Noise Review": {
    detail: (f) => f.noise.map((n) => ({ alert: n.alert, category: n.category, occurrences: n.occurrences, lastSeen: n.lastSeen, problemId: n.problemId })),
    secondary: (f) => {
      const m = new Map<string, number>();
      for (const n of f.noise) m.set(n.category, (m.get(n.category) ?? 0) + n.occurrences);
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([category, noiseProblems]) => ({ category, noiseProblems }));
    },
  },
  "6. Problems with Root Cause": {
    detail: (f) =>
      f.causal.map((p) => ({ problem: p.name, status: p.status, rootCauseEntity: p.rootCause ?? "Not identified", entities: p.entities, started: p.started, problemId: p.id })),
    secondary: (f) =>
      [
        { outcome: "Root cause identified", problems: f.rcCount },
        { outcome: "No root cause", problems: f.causal.length - f.rcCount },
      ].filter((x) => x.problems > 0),
  },
  "7. DORA Metrics": {
    detail: (f, facet) => {
      const by = new Map<string, typeof f.deploys>();
      for (const d of facetDeploys(f, facet)) by.set(d.repo, [...(by.get(d.repo) ?? []), d]);
      return [...by.entries()]
        .map(([repo, ds]) => {
          const leads = ds.map((d) => d.leadMs).filter((x): x is number => x !== null);
          const failed = ds.filter((d) => d.outcome !== "success").length;
          return {
            repo, deploys: ds.length, successPct: Math.round(((ds.length - failed) * 100) / ds.length),
            avgLeadDays: leads.length ? Math.round((leads.reduce((s, x) => s + x, 0) / leads.length / DAY) * 10) / 10 : null,
            avgDurSec: Math.round(ds.reduce((s, d) => s + d.durationSec, 0) / ds.length), url: ds[0].repoUrl,
          };
        })
        .sort((a, b) => b.deploys - a.deploys);
    },
    secondary: (f, facet) => {
      const byDay = new Map<number, { n: number; failed: number; leads: number[] }>();
      for (const d of facetDeploys(f, facet)) {
        const k = Math.floor(d.ts / DAY) * DAY;
        const e = byDay.get(k) ?? { n: 0, failed: 0, leads: [] };
        e.n++;
        if (d.outcome !== "success") e.failed++;
        if (d.leadMs !== null) e.leads.push(d.leadMs);
        byDay.set(k, e);
      }
      return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([ts, e]) => ({
        timestamp: iso(ts), dFreq: e.n,
        dLead: e.leads.length ? Math.round((e.leads.reduce((s, x) => s + x, 0) / e.leads.length / DAY) * 100) / 100 : null,
        dCfr: Math.round((e.failed * 1000) / e.n) / 10,
      }));
    },
  },

  // ── L4 ──
  "1. SLO Burn Rate Alerting": {
    detail: (f) => f.burn.map((b) => ({ slo: b.slo, burnType: b.burnType, fired: b.fired, active: b.active, lastFired: b.lastFired, problemId: b.problemId })),
    secondary: (f) => {
      const r = seeded("burn:" + f.app.code);
      const out: DemoRecord[] = [];
      for (const b of f.burn) {
        for (let i = 0; i < b.fired; i++) out.push({ timestamp: iso(dayStart(Math.floor(r() * 30))), burnType: b.burnType, alerts: 1 });
      }
      const m = new Map<string, number>();
      for (const o of out) { const k = `${String(o.timestamp)}|${String(o.burnType)}`; m.set(k, (m.get(k) ?? 0) + 1); }
      return [...m.entries()].sort().map(([k, alerts]) => { const [timestamp, burnType] = k.split("|"); return { timestamp, burnType, alerts }; });
    },
  },
  "2. Dynamic Scaling / K8s Autoscaling": {
    detail: (f) =>
      f.cloud
        .filter((c) => c.min !== undefined)
        .map((c) => ({
          name: c.name,
          mechanism: c.type === "AWS_AUTOSCALING_AUTOSCALINGGROUP" ? "EC2 Auto Scaling Group" : c.type === "AWS_APPLICATIONAUTOSCALING_SCALABLETARGET" ? "ECS Service Auto Scaling" : "EKS Managed Nodegroup",
          region: c.region, minSize: c.min, maxSize: c.max, desired: c.desired, elasticity: (c.max as number) > (c.min as number) ? "Elastic" : "Pinned", entityId: c.id,
        }))
        .sort((a, b) => a.elasticity.localeCompare(b.elasticity) || a.name.localeCompare(b.name)),
    secondary: (f) => {
      const m = new Map<string, { targets: number; elastic: number; pinned: number; regions: Set<string> }>();
      for (const c of f.cloud.filter((x) => x.min !== undefined)) {
        const mech = c.type === "AWS_AUTOSCALING_AUTOSCALINGGROUP" ? "EC2 Auto Scaling Group" : c.type === "AWS_APPLICATIONAUTOSCALING_SCALABLETARGET" ? "ECS Service Auto Scaling" : "EKS Managed Nodegroup";
        const e = m.get(mech) ?? { targets: 0, elastic: 0, pinned: 0, regions: new Set<string>() };
        e.targets++;
        if ((c.max as number) > (c.min as number)) e.elastic++; else e.pinned++;
        e.regions.add(c.region);
        m.set(mech, e);
      }
      return [...m.entries()].sort((a, b) => b[1].targets - a[1].targets).map(([mechanism, e]) => ({ mechanism, targets: e.targets, elastic: e.elastic, pinned: e.pinned, regions: [...e.regions].sort() }));
    },
  },
  "3. Predictive Forecasting": {
    detail: notAdopted("not_adopted", "Davis predictive forecasting is not in use anywhere in this tenant. Zero forecast-analyzer actions found in 30 days of workflow executions."),
  },
  "4. Release Impact Tracking": {
    detail: (f) =>
      f.srgRuns.map((s) => ({ guardian: s.guardian, result: s.result, objectives: s.objectives, trigger: s.trigger, timestamp: iso(s.ts), guardianId: s.guardianId })),
    secondary: (f) => {
      const m = new Map<string, number>();
      for (const d of f.deploys) { const k = `${iso(Math.floor(d.ts / DAY) * DAY)}|Deployments`; m.set(k, (m.get(k) ?? 0) + 1); }
      for (const s of f.srgRuns) { const k = `${iso(Math.floor(s.ts / DAY) * DAY)}|Guardian validations`; m.set(k, (m.get(k) ?? 0) + 1); }
      return [...m.entries()].sort().map(([k, n]) => { const [timestamp, series] = k.split("|"); return { timestamp, series, n }; });
    },
  },
  "5. Error Budget Gating": {
    detail: notAdopted("not_configured", "No error budget gating detected. No ServiceNow workflow action exists tenant-wide; alert routing uses Microsoft Teams and email only."),
  },

  // ── L5 ──
  "1. Repetitive Tasks Identified": { detail: () => tenantWorkflows().slice(0, 50).map(wfRow) },
  "2. Workflow Automation": {
    detail: () => {
      const total = tenantWorkflows().reduce((s, w) => s + w.executions, 0);
      const r = seeded("wfdaily");
      return dailyStamps(30).map((ts) => ({ timestamp: iso(ts), count: Math.round((total / 30) * (0.7 + r() * 0.6)) }));
    },
  },
  "3. E2E Remediation Automated": { detail: notAdopted("not_enabled", "E2E remediation workflows not yet detected.") },
  "4. Incident Auto-Enrichment": {
    detail: (f) => {
      if (f.totalProblems === 0) return [];
      const code = f.app.code;
      const enrichedRows = [
        { profile: `["${code} Production"]`, share: 0.5 },
        { profile: `["${code} Business Hours"]`, share: 0.12 },
      ];
      const rows: DemoRecord[] = enrichedRows.map((e) => ({ "labels.alerting_profile": e.profile, total: Math.round(f.totalProblems * e.share), enriched: Math.round(f.totalProblems * e.share) }));
      const used = rows.reduce((s, r) => s + (r.total as number), 0);
      const defaultTotal = Math.max(0, f.totalProblems - used);
      const adj = f.enriched - used;
      if (adj > 0) { rows[0].total = (rows[0].total as number) + adj; rows[0].enriched = (rows[0].enriched as number) + adj; rows.push({ "labels.alerting_profile": '["Default"]', total: Math.max(0, defaultTotal - adj), enriched: 0 }); }
      else rows.push({ "labels.alerting_profile": '["Default"]', total: defaultTotal, enriched: 0 });
      return rows.filter((r) => (r.total as number) > 0).sort((a, b) => (b.enriched as number) - (a.enriched as number));
    },
  },
  "5. AI Postmortem / PTASK in ARD": { detail: notAdopted("not_enabled", "AI Postmortem / PTASK detection not yet configured.") },
};

// ───────────────────────── template-based query matching ─────────────────────────
// The modal builds each query with the per-check detailQuery builder,
// so we regenerate the same text with a sentinel application ID and turn it into a regex.

const SENT = "\u0001";
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function matcher(build: (appId: string, facet?: string) => string, facets: (string | undefined)[]) {
  const regs = facets.map((facet) => ({
    facet,
    re: new RegExp("^" + build(SENT, facet).split(SENT).map(esc).join("([A-Za-z0-9_]{1,12})") + "$"),
  }));
  return (q: string): { app: DemoApp; facet?: string } | null => {
    for (const { facet, re } of regs) {
      const m = re.exec(q);
      if (m) return { app: (m[1] && DEMO_APP_BY_CODE[m[1].toUpperCase()]) || extractAppId(q), facet };
    }
    return null;
  };
}

const checkFixtures: DemoFixture[] = [];
for (const [key, gen] of Object.entries(GENS)) {
  const cfg = CHECK_DETAIL_CONFIGS[key];
  if (!cfg) continue;
  const facets: (string | undefined)[] = [undefined, ...(cfg.facetOptions ?? [])];
  (["detail", "secondary"] as const).forEach((kind) => {
    const build = kind === "detail" ? cfg.detailQuery : cfg.secondaryQuery;
    const g = gen[kind];
    if (!build || !g) return;
    const m = matcher(build, facets);
    let last: { q: string; hit: ReturnType<typeof m> } | null = null;
    checkFixtures.push({
      id: `check:${key}:${kind}`,
      match: (q) => {
        const hit = m(q);
        last = hit ? { q, hit } : null;
        return !!hit;
      },
      respond: (q) => {
        const hit = last && last.q === q ? last.hit : m(q);
        if (!hit) return { records: [] };
        return { records: g(getFacts(hit.app), hit.facet) };
      },
    });
  });
}

export const scorecardsFixtures: DemoFixture[] = [
  ...levelFixtures,
  trendFixture,
  appInfoFixture,
  cloudAccountFixture,
  ...checkFixtures,
];

// ───────────────────────── app functions ─────────────────────────

const appOf = (data: Record<string, unknown> | undefined) => {
  const raw = data?.appId;
  const code = (typeof raw === "string" ? raw : "").toUpperCase();
  return DEMO_APP_BY_CODE[code] ?? DEMO_APP_BY_CODE["ADH"];
};

export const scorecardsFunctionFixtures: DemoFunctionFixture[] = [
  { name: "getSloDetail", respond: (d) => ({ slos: [...getFacts(appOf(d)).slos].sort((a, b) => a.sloName.localeCompare(b.sloName)) }) },
  { name: "getGuardianDetail", respond: (d) => ({ guardians: [...getFacts(appOf(d)).guardians].sort((a, b) => a.guardianName.localeCompare(b.guardianName)) }) },
  { name: "getDashboardDetail", respond: (d) => ({ dashboards: [...getFacts(appOf(d)).dashboards].sort((a, b) => a.dashboardName.localeCompare(b.dashboardName)) }) },
  {
    name: "getRunbookDetail",
    respond: (d) => {
      const f = getFacts(appOf(d));
      return {
        runbooks: [...f.runbooks].sort((a, b) => a.runbookName.localeCompare(b.runbookName)),
        otherNotebooks: [...f.otherNotebooks].sort((a, b) => a.notebookName.localeCompare(b.notebookName)),
      };
    },
  },
  {
    name: "getAllRunbookCounts",
    respond: () => {
      const counts: Record<string, number> = {};
      for (const a of DEMO_APPS) {
        const n = getFacts(a).runbooks.length;
        if (n > 0) counts[a.code.toLowerCase()] = n;
      }
      return { counts };
    },
  },
];
