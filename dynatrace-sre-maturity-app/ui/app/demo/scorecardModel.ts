import { APP_ID_LABEL } from "../settings/appSettings";
// Deterministic per-app model behind the scorecard + check-detail demo fixtures.
// One `getFacts(app)` call yields every number/list the L1..L5 check strings and
// their detail tables/charts need, so the headline ("pass 6 SLOs configured") and
// the drill-down (the 6 SLO rows) always agree.

import type { DemoApp } from "./portfolio";
import { seeded } from "./portfolio";
import { servicesForApp, upstreamIds } from "./services";
import type { DemoService } from "./services";
import { demoRunbookCount } from "./fixtures/portfolio";

export type LevelNo = 1 | 2 | 3 | 4 | 5;

const MAX: Record<LevelNo, number> = { 1: 7, 2: 6, 3: 7, 4: 5, 5: 5 };
// L4 / L5 each contain two hard-coded "fail" checks, so at most 3 can pass.
const CAP: Record<LevelNo, number> = { 1: 7, 2: 6, 3: 7, 4: 3, 5: 3 };

export const DAY = 86_400_000;
export const HOUR = 3_600_000;
export const iso = (ms: number) => new Date(ms).toISOString();
export const dayStart = (offsetDays: number) => Math.floor(Date.now() / DAY) * DAY - offsetDays * DAY;

const hex = (r: () => number, n: number) => {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(r() * 16).toString(16).toUpperCase();
  return s;
};
const uuid = (r: () => number) => {
  const h = (n: number) => hex(r, n).toLowerCase();
  return `${h(8)}-${h(4)}-4${h(3)}-a${h(3)}-${h(12)}`;
};
const pick = <T,>(r: () => number, arr: T[]): T => arr[Math.floor(r() * arr.length)];

export const hasK8s = (a: DemoApp) => a.tier <= 2;

/** Raw level score as the leaderboard computes it: round(fraction × max), L4/L5 capped at 3. */
export function demoLevelTotal(a: DemoApp, level: LevelNo): number {
  const n = Math.round(a.level[level - 1] * MAX[level]);
  const always = level === 1 ? (hasK8s(a) ? 1 : 2) : 0;
  return Math.min(CAP[level], Math.max(n, always));
}

function fillGroups(groups: number[][], n: number): Set<number> {
  const out = new Set<number>();
  let rem = n;
  for (const g of groups) {
    if (g.length <= rem) {
      g.forEach((x) => out.add(x));
      rem -= g.length;
    }
  }
  return out;
}

/** Which checks (1-based index) pass for the given level. */
export function passSet(a: DemoApp, level: LevelNo): Set<number> {
  const n = demoLevelTotal(a, level);
  switch (level) {
    case 1: {
      const always = hasK8s(a) ? [6] : [5, 6];
      const rest = (hasK8s(a) ? [1, 2, 3, 4, 5, 7] : [1, 2, 3, 4, 7]).map((x) => [x]);
      const s = fillGroups(rest, Math.max(0, n - always.length));
      always.forEach((x) => s.add(x));
      return s;
    }
    case 2:
      return fillGroups([[1], [5], [2], [4], [3], [6]], n);
    case 3: {
      const rb = demoRunbookCount(a) > 0;
      const s = fillGroups([[1], [2, 7], [3], [6], [5]], Math.max(0, n - (rb ? 1 : 0)));
      if (rb) s.add(4);
      return s;
    }
    case 4:
      return fillGroups([[1], [2], [4]], n);
    case 5:
    default:
      return fillGroups([[1, 2], [4]], n);
  }
}

// ───────────────────────── fact types ─────────────────────────

export interface Host { id: string; name: string; mode: "Full-Stack" | "Full-Stack (PaaS)" | "Infrastructure" }
export interface CloudRes { type: string; name: string; region: string; provider: string; id: string; resourceType: string; min?: number; max?: number; desired?: number }
export interface SloD { sloId: string; sloName: string; sloType: string; target: number; description: string }
export interface GuardianD { guardianId: string; guardianName: string; objectiveCount: number; objectives: string[]; eventKind: string }
export interface DashD { dashboardName: string; dashboardId: string; createdTime: string; lastModifiedTime: string; ownerName: string }
export interface RunbookD { runbookName: string; runbookId: string; createdTime: string; lastModifiedTime: string; ownerName: string }
export interface ProblemRow { name: string; category: string; status: string; events: number; entities: number; rootCause: string | null; started: string; id: string }
export interface NoiseRow { alert: string; category: string; occurrences: number; lastSeen: string; problemId: string }
export interface DeployRow { repo: string; environment: string; ref: string; outcome: string; durationSec: number; platform: string; ts: number; url: string; repoUrl: string; leadMs: number | null }
export interface BurnRow { slo: string; burnType: "Availability" | "Performance"; fired: number; active: number; lastFired: string; problemId: string }
export interface SrgRun { guardian: string; result: string; objectives: string; trigger: string; ts: number; guardianId: string }

export interface Facts {
  app: DemoApp;
  pass: Record<LevelNo, Set<number>>;
  svcs: DemoService[];
  // L1
  hosts: Host[];
  fullStack: number;
  k8sClusters: number;
  cloud: CloudRes[];
  rum: { app: string; active: boolean }[];
  syn: number;
  // L2
  slos: SloD[];
  guardians: GuardianD[];
  dashboards: DashD[];
  critical: { service: string; severity: string; businessImpact: string; resolved: boolean }[];
  // L3
  causal: ProblemRow[];
  noise: NoiseRow[];
  noiseTotal: number;
  otherCount: number;
  total7d: number;
  correlated: number;
  rcCount: number;
  rcPct: number;
  noisePct: number;
  deploys: DeployRow[];
  itsm: boolean;
  runbooks: RunbookD[];
  otherNotebooks: { notebookName: string; reason: string }[];
  // L4
  burn: BurnRow[];
  burnFired: number;
  scale: { asg: number; ecs: number; ng: number };
  srgRuns: SrgRun[];
  srgEventTriggered: number;
  // L5
  workflowTitles: string[];
  enriched: number;
  totalProblems: number;
  enrichPct: number;
}

const cache = new Map<string, Facts>();

const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "");

export function getFacts(app: DemoApp): Facts {
  const hit = cache.get(app.code);
  if (hit) return hit;
  const f = build(app);
  cache.set(app.code, f);
  return f;
}

function build(app: DemoApp): Facts {
  const r = seeded("sc:" + app.code);
  const code = app.code;
  const lc = code.toLowerCase();
  const pass: Record<LevelNo, Set<number>> = { 1: passSet(app, 1), 2: passSet(app, 2), 3: passSet(app, 3), 4: passSet(app, 4), 5: passSet(app, 5) };
  const svcs = servicesForApp(code);
  const now = Date.now();

  // ── L1: hosts ──
  const hostCount = pass[1].has(1) ? Math.max(4, svcs.length + 2 + Math.floor(r() * 5)) : 0;
  const infraCount = hostCount > 4 ? Math.floor(r() * 2) + (app.tier >= 3 ? 1 : 0) : 0;
  const roles = ["web", "app", "api", "worker", "batch", "cache"];
  const hosts: Host[] = Array.from({ length: hostCount }, (_, i) => {
    const isInfra = i >= hostCount - infraCount;
    const isPaas = !isInfra && hasK8s(app) && i === hostCount - infraCount - 1;
    return {
      id: "HOST-" + hex(r, 16),
      name: `${lc}-${roles[i % roles.length]}-${String(i + 1).padStart(2, "0")}.corp.example.com`,
      mode: isInfra ? "Infrastructure" : isPaas ? "Full-Stack (PaaS)" : "Full-Stack",
    };
  });
  const fullStack = hosts.filter((h) => h.mode !== "Infrastructure").length;
  const k8sClusters = hasK8s(app) ? 3 + Math.floor(seeded("k8s:" + code)() * 6) : 0;

  // ── L4 scaling targets (decided first: they are also cloud resources) ──
  const scalePass = pass[4].has(2);
  const scale = scalePass
    ? { asg: 1 + Math.floor(r() * 2), ecs: 1 + Math.floor(r() * 2), ng: hasK8s(app) ? 1 + Math.floor(r() * 2) : 0 }
    : { asg: 0, ecs: 0, ng: 0 };

  // ── cloud ──
  const regions = ["us-east-1", "us-west-2"];
  const cloudTpl: [string, string, string][] = [
    ["AWS_EC2_INSTANCE", "AWS::EC2::Instance", "ec2"],
    ["AWS_RDS_DBINSTANCE", "AWS::RDS::DBInstance", "db"],
    ["AWS_LAMBDA_FUNCTION", "AWS::Lambda::Function", "fn"],
    ["AWS_S3_BUCKET", "AWS::S3::Bucket", "bucket"],
    ["AWS_ELASTICLOADBALANCINGV2_LOADBALANCER", "AWS::ElasticLoadBalancingV2::LoadBalancer", "alb"],
    ["AWS_SQS_QUEUE", "AWS::SQS::Queue", "queue"],
    ["AWS_DYNAMODB_TABLE", "AWS::DynamoDB::Table", "table"],
    ["AWS_ECS_SERVICE", "AWS::ECS::Service", "svc"],
  ];
  const baseCloud = 8 + (5 - app.tier) * 3 + Math.floor(r() * 4);
  const cloud: CloudRes[] = Array.from({ length: baseCloud }, (_, i) => {
    const [type, resourceType, tag] = cloudTpl[i % cloudTpl.length];
    return { type, resourceType, provider: "AWS", region: regions[i % 2], name: `${lc}-prod-${tag}-${String(Math.floor(i / cloudTpl.length) + 1).padStart(2, "0")}`, id: type + "-" + hex(r, 12) };
  });
  const addScale = (n: number, type: string, resourceType: string, tag: string, withSizes: boolean) => {
    for (let i = 0; i < n; i++) {
      const min = 2 + Math.floor(r() * 2);
      const pinned = withSizes && r() < 0.25;
      cloud.push({
        type, resourceType, provider: "AWS", region: regions[i % 2], name: `${lc}-prod-${tag}-${i + 1}`, id: type + "-" + hex(r, 12),
        min, max: pinned ? min : min + 2 + Math.floor(r() * 6), desired: min + (pinned ? 0 : Math.floor(r() * 2)),
      });
    }
  };
  addScale(scale.asg, "AWS_AUTOSCALING_AUTOSCALINGGROUP", "AWS::AutoScaling::AutoScalingGroup", "asg", true);
  addScale(scale.ecs, "AWS_APPLICATIONAUTOSCALING_SCALABLETARGET", "AWS::ApplicationAutoScaling::ScalableTarget", "ecs-scale", true);
  addScale(scale.ng, "AWS_EKS_NODEGROUP", "AWS::EKS::Nodegroup", "ng", true);

  // ── RUM / Synthetics ──
  const rumN = pass[1].has(7) ? 1 + (app.tier <= 2 ? 1 : 0) : 0;
  const rum = Array.from({ length: rumN + (rumN && app.tier === 3 ? 1 : 0) }, (_, i) => ({
    app: i === 0 ? `${app.name} Web` : i === 1 ? `${app.name} Mobile` : `${app.name} Legacy Portal`,
    active: i < rumN,
  }));
  const syn = pass[1].has(7) ? 2 + Math.floor(r() * 4) : 0;

  // ── L2 ──
  const types = ["Availability", "Performance"];
  const sloN = pass[2].has(2) ? 3 + Math.floor(r() * 5) : 0;
  const slos: SloD[] = Array.from({ length: sloN }, (_, i) => {
    const svc = svcs[Math.floor(i / 2) % Math.max(1, svcs.length)];
    const type = types[i % 2];
    return {
      sloId: uuid(r),
      sloName: `${code}-${slug(svc?.name.replace(app.name, "") || "Service")}-${type}SLO`,
      sloType: type,
      target: type === "Availability" ? pick(r, [99.9, 99.95, 99.5]) : pick(r, [95, 98, 99]),
      description: type === "Availability" ? `Successful request ratio for ${svc?.name ?? app.name}` : `Share of requests under the latency threshold for ${svc?.name ?? app.name}`,
    };
  });
  const objPool = ["Error rate", "Response time p95", "Throughput", "CPU saturation", "Apdex", "Failed deployments"];
  const gN = pass[2].has(3) ? 1 + Math.floor(r() * 3) : 0;
  const guardians: GuardianD[] = Array.from({ length: gN }, (_, i) => {
    const k = 3 + Math.floor(r() * 3);
    return {
      guardianId: "objectId-" + hex(r, 10).toLowerCase(),
      guardianName: [`${code} - Release Validation`, `${code} - Nightly Health Check`, `${code} - Canary Gate`][i % 3],
      objectiveCount: k,
      objectives: objPool.slice(0, k),
      eventKind: i === 1 ? "BIZ_EVENT" : "SDLC_EVENT",
    };
  });
  const dN = pass[2].has(4) ? 1 + Math.floor(r() * 3) : 0;
  const dashNames = [`${code} - SLO Overview`, `${code} SLO Burn Rate`, `${code} - Executive SLO Summary`];
  const dashboards: DashD[] = Array.from({ length: dN }, (_, i) => ({
    dashboardName: dashNames[i],
    dashboardId: uuid(r),
    createdTime: iso(now - (120 + Math.floor(r() * 200)) * DAY),
    lastModifiedTime: iso(now - Math.floor(r() * 25) * DAY),
    ownerName: app.owner,
  }));
  const critical: Facts["critical"] = [];
  if (pass[2].has(6) || app.level[1] < 0.5) {
    const cN = 2 + Math.floor(r() * 4);
    const resolvedN = pass[2].has(6) ? Math.max(1, Math.floor(cN * 0.6)) : 0;
    const sev = ["High", "High", "Medium", "Low", "Medium"];
    for (let i = 0; i < cN; i++) {
      critical.push({
        service: svcs[i % Math.max(1, svcs.length)]?.name ?? `${app.name} Service ${i + 1}`,
        severity: sev[i % sev.length],
        businessImpact: { High: "Revenue impacting", Medium: "Customer facing", Low: "Internal" }[sev[i % sev.length]] as string,
        resolved: i >= cN - resolvedN,
      });
    }
  }

  // ── L3: problems ──
  const causalN = pass[3].has(1) ? 4 + Math.floor(r() * 10) : 0;
  const probTpl = [
    (s: string) => `Response time degradation on ${s}`,
    (s: string) => `Failure rate increase on ${s}`,
    (s: string) => `Multiple infrastructure problems affecting ${s}`,
    (s: string) => `Slowdown on ${s}`,
  ];
  const rcPass = pass[3].has(6);
  const rcWith = causalN === 0 ? 0 : rcPass ? Math.ceil(causalN * 0.6) : Math.floor(causalN * 0.2);
  const activeN = Math.floor(causalN * 0.25);
  const causal: ProblemRow[] = Array.from({ length: causalN }, (_, i) => {
    const svc = svcs[i % Math.max(1, svcs.length)];
    const sn = svc?.name ?? app.name;
    return {
      name: probTpl[i % probTpl.length](sn),
      category: i % 3 === 1 ? "ERROR" : "SLOWDOWN",
      status: i < activeN ? "ACTIVE" : "CLOSED",
      events: 2 + Math.floor(r() * 8),
      entities: i % 5 === 4 ? 1 : 2 + Math.floor(r() * 10),
      rootCause: i < rcWith ? pick(r, [sn, `${lc}-app-02.corp.example.com`, `${app.name} Data Access`]) : null,
      started: iso(now - (i * 0.55 + r() * 0.4) * DAY),
      id: uuid(r),
    };
  });
  const otherCount = causalN === 0 ? 0 : Math.floor(causalN * 0.2);
  const noisePass = pass[3].has(5);
  const noiseTotal = causalN === 0 ? 0 : noisePass ? Math.floor((causalN + otherCount) * 0.4) : Math.ceil((causalN + otherCount) * 2);
  const noiseTpl: [string, string][] = [
    ["Host CPU saturation", "RESOURCE_CONTENTION"],
    ["Low disk space", "RESOURCE_CONTENTION"],
    ["Synthetic availability check failed", "AVAILABILITY"],
    ["Custom alert: queue depth high", "CUSTOM_ALERT"],
    ["OneAgent unavailable", "MONITORING_UNAVAILABLE"],
  ];
  const noise: NoiseRow[] = [];
  if (noiseTotal > 0) {
    const rows = Math.min(noiseTpl.length, Math.max(1, noiseTotal));
    let left = noiseTotal;
    for (let i = 0; i < rows; i++) {
      const occ = i === rows - 1 ? left : Math.max(1, Math.ceil(left / (rows - i) + (rows - i > 1 ? 1 : 0)));
      left -= occ;
      noise.push({ alert: noiseTpl[i][0], category: noiseTpl[i][1], occurrences: occ, lastSeen: iso(now - (i + 0.3) * DAY), problemId: uuid(r) });
      if (left <= 0) break;
    }
    noise.sort((a, b) => b.occurrences - a.occurrences);
  }
  const total7d = causalN + otherCount + noiseTotal;
  const noisePct = total7d > 0 ? Math.round((noiseTotal * 100) / total7d) : 0;
  const rcPct = causalN > 0 ? Math.round((rcWith * 100) / causalN) : 0;
  const correlated = Math.min(total7d, Math.floor(causalN * 0.7));

  // ── deploys ──
  const deployN = pass[3].has(2) ? 12 + Math.floor(r() * 30) : 0;
  const repos = [`${lc}-service`, `${lc}-web`, `${lc}-infra`];
  const envs = ["prd", "prd", "prd", "stg", "stg", "qa", "qa", "dev"];
  const deploys: DeployRow[] = Array.from({ length: deployN }, (_, i) => {
    const repo = repos[Math.floor(r() * repos.length)];
    const roll = r();
    const platform = repo.endsWith("infra") ? "GitHub Actions" : r() < 0.5 ? "Harness" : "GitHub Actions";
    const newDep = r() < 0.7;
    return {
      repo,
      environment: envs[Math.floor(r() * envs.length)],
      ref: `v${1 + Math.floor(r() * 3)}.${Math.floor(r() * 20)}.${Math.floor(r() * 10)}`,
      outcome: roll < 0.85 ? "success" : roll < 0.95 ? "failure" : "cancelled",
      durationSec: 90 + Math.floor(r() * 520),
      platform,
      ts: now - (i / Math.max(1, deployN)) * 30 * DAY - Math.floor(r() * 6) * HOUR,
      url: platform === "Harness" ? `https://app.harness.io/ng/account/demo/pipelines/${repo}/executions/${hex(r, 8)}` : `https://github.com/demo-org/${repo}/actions/runs/${Math.floor(1_000_000 + r() * 8_000_000)}`,
      repoUrl: `https://github.com/demo-org/${repo}`,
      leadMs: newDep ? Math.round((1 + r() * 5) * DAY) : null,
    };
  });
  deploys.sort((a, b) => b.ts - a.ts);

  const itsm = pass[3].has(3);

  // runbooks (count shared with the portfolio fork so L3 totals line up)
  const rbN = demoRunbookCount(app);
  const rbTitles = ["Checkout latency triage", "Database failover", "Cache stampede mitigation", "Queue backlog drain"];
  const runbooks: RunbookD[] = Array.from({ length: rbN }, (_, i) => ({
    runbookName: `${code} Runbook - ${rbTitles[i % rbTitles.length]}`,
    runbookId: uuid(r),
    createdTime: iso(now - (90 + Math.floor(r() * 250)) * DAY),
    lastModifiedTime: iso(now - Math.floor(r() * 40) * DAY),
    ownerName: app.owner,
  }));
  const otherNotebooks: Facts["otherNotebooks"] = [];
  if (rbN === 0 && app.level[2] > 0) otherNotebooks.push({ notebookName: `${code} Incident Response Notes`, reason: 'Missing the word "Runbook" in the name' });
  if (rbN === 0 && app.tier <= 3) otherNotebooks.push({ notebookName: `Payments-retry Runbook (${lc} dependency)`, reason: "The application ID is not the leading 3-letter token" });
  if (rbN > 0 && r() < 0.4) otherNotebooks.push({ notebookName: `${code} Postmortem Draft`, reason: 'Missing the word "Runbook" in the name' });

  // ── L4 ──
  const burnN = pass[4].has(1) ? 2 + Math.floor(r() * 3) : 0;
  const burn: BurnRow[] = Array.from({ length: burnN }, (_, i) => ({
    slo: slos[i % Math.max(1, slos.length)]?.sloName ?? `${code}-Core-${types[i % 2]}SLO`,
    burnType: types[i % 2] as "Availability" | "Performance",
    fired: 1 + Math.floor(r() * 5),
    active: i === 0 && r() < 0.4 ? 1 : 0,
    lastFired: iso(now - (i * 3 + r() * 2) * DAY),
    problemId: uuid(r),
  }));
  const burnFired = burn.reduce((s, b) => s + b.fired, 0);

  const eventTrig = pass[4].has(4);
  const srgN = guardians.length === 0 ? 0 : eventTrig ? 4 + Math.floor(r() * 8) : Math.floor(r() * 4) + (app.level[3] >= 0.2 ? 2 : 0);
  const srgRuns: SrgRun[] = Array.from({ length: srgN }, (_, i) => {
    const g = guardians[i % guardians.length];
    const passed = Math.max(1, g.objectiveCount - (r() < 0.2 ? 1 : 0));
    const result = passed === g.objectiveCount ? "pass" : "warning";
    return {
      guardian: g.guardianName,
      result,
      objectives: `${passed}/${g.objectiveCount} passed`,
      trigger: eventTrig ? pick(r, ["Event", "Event", "Workflow", "Schedule"]) : pick(r, ["Schedule", "Manual"]),
      ts: now - (i / Math.max(1, srgN)) * 30 * DAY - Math.floor(r() * 5) * HOUR,
      guardianId: g.guardianId,
    };
  });
  if (eventTrig && !srgRuns.some((x) => x.trigger !== "Schedule" && x.trigger !== "Manual") && srgRuns[0]) srgRuns[0].trigger = "Event";
  const srgEventTriggered = srgRuns.filter((x) => x.trigger !== "Schedule" && x.trigger !== "Manual").length;

  // ── L5 ──
  const wfN = pass[5].has(1) ? 2 + Math.floor(r() * 5) : 0;
  const wfTpl = ["Auto-remediate unhealthy pods", "Weekly SLO report", "Deployment validation gate", "Problem enrichment", "Scale-out on saturation", "Nightly cost report"];
  const workflowTitles = Array.from({ length: wfN }, (_, i) => `${code} ${wfTpl[i % wfTpl.length]}`);
  const totalProblems = pass[5].has(4) ? 24 + Math.floor(r() * 40) : app.level[4] > 0 || app.level[2] > 0 ? 10 + Math.floor(r() * 20) : 0;
  const enriched = totalProblems === 0 ? 0 : pass[5].has(4) ? Math.ceil(totalProblems * 0.62) : Math.floor(totalProblems * 0.3);
  const enrichPct = totalProblems > 0 ? Math.round((enriched * 100) / totalProblems) : 0;

  return {
    app, pass, svcs, hosts, fullStack, k8sClusters, cloud, rum, syn, slos, guardians, dashboards, critical,
    causal, noise, noiseTotal, otherCount, total7d, correlated, rcCount: rcWith, rcPct, noisePct, deploys, itsm,
    runbooks, otherNotebooks, burn, burnFired, scale, srgRuns, srgEventTriggered, workflowTitles, enriched, totalProblems, enrichPct,
  };
}

export { upstreamIds };

// ───────────────────────── check status strings ─────────────────────────

const rcWord = (f: Facts) => (f.rcPct >= 40 ? "pass " : f.rcPct >= 30 ? "warn " : "fail ");

/** The "pass …/fail …/warn …/n/a …" string for check `idx` of `level`. */
export function checkValue(f: Facts, level: LevelNo, idx: number): string {
  const p = f.pass[level].has(idx);
  switch (level) {
    case 1:
      switch (idx) {
        case 1: return f.hosts.length > 0 ? `pass ${f.fullStack}/${f.hosts.length} Full-Stack` : "fail No hosts";
        case 2: return p ? `pass ${f.svcs.length} services` : "fail No services";
        case 3: return p ? "pass Active" : "fail No logs";
        case 4: return p ? "pass Active" : "fail Not discovered";
        case 5:
          return f.k8sClusters === 0
            ? "pass N/A — no Kubernetes detected"
            : p ? `pass ${f.k8sClusters} cluster(s), cloud-native full-stack healthy` : `fail ${f.k8sClusters} cluster(s) detected, operator or signal issue`;
        case 6: return f.cloud.length > 0 ? `pass ${f.cloud.length} resources` : "n/a N/A";
        default: return p ? `pass RUM:${f.rum.filter((x) => x.active).length} Syn:${f.syn}` : "fail Not configured";
      }
    case 2:
      switch (idx) {
        case 1: return p ? `pass ${f.svcs.length} services with metrics` : "fail No services";
        case 2: return p ? `pass ${f.slos.length} SLOs configured` : "fail No SLOs detected";
        case 3: return p ? `pass ${f.guardians.length} guardian(s)` : "fail None found";
        case 4: return p ? `pass ${f.dashboards.length} dashboards` : `fail No ${APP_ID_LABEL} dashboards`;
        case 5: return p ? "pass CMDB tier assigned" : "fail No tier data";
        default: {
          const c = f.critical.length;
          const res = f.critical.filter((x) => x.resolved).length;
          return res > 0 ? `pass ${res} of ${c} tagged services resolved` : c > 0 ? `fail Listed but unresolved (0/${c})` : "n/a No critical services listed for this application ID";
        }
      }
    case 3:
      switch (idx) {
        case 1: {
          const active = f.causal.filter((x) => x.status === "ACTIVE").length;
          return f.causal.length > 0 ? `pass ${f.causal.length} problems (${active} active, ${f.causal.length - active} closed), ${f.correlated} correlated` : "fail No causal problems in last 7 days";
        }
        case 2: return f.deploys.length > 0 ? `pass ${f.deploys.filter((d) => d.outcome === "success").length}/${f.deploys.length} successful deploys (30d)` : "fail No deployments detected";
        case 3: return f.itsm ? "pass 1 alert routing workflow(s)" : "fail No 'Production Dynatrace Alerts' workflow";
        case 4: return "n/a Checking live runbook status…";
        case 5: return f.total7d > 0 ? `${f.noisePct > 50 ? "warn " : "pass "}${f.noiseTotal} noise / ${f.total7d} problems (${f.noisePct}%)` : "n/a No problems in last 7 days";
        default:
          if (idx === 6) return f.causal.length > 0 ? `${rcWord(f)}${f.rcCount}/${f.causal.length} w/ root cause (${f.rcPct}%)` : "n/a No problems in last 7 days";
          return f.deploys.length > 0 ? `pass ${f.deploys.length} deploys, ${avgLeadDays(f)}d avg lead time` : "fail No deployment data";
      }
    case 4:
      switch (idx) {
        case 1: return f.burn.length > 0 ? `pass ${f.burn.length} burn-rate alert(s), ${f.burnFired} fired (30d)` : "fail No SLO burn-rate alerts fired (30d)";
        case 2: {
          const t = f.scale.asg + f.scale.ecs + f.scale.ng;
          return t > 0 ? `pass ${t} autoscaling target(s): ${f.scale.asg} ASG / ${f.scale.ecs} ECS / ${f.scale.ng} nodegroup` : `fail ${f.cloud.length} cloud resources, none autoscaling`;
        }
        case 3: return "fail Davis forecasting not adopted";
        case 4: {
          const dep = f.deploys.length;
          const runs = f.srgRuns.length;
          if (f.srgEventTriggered > 0) return `pass ${f.srgEventTriggered} deploy-triggered guardian run(s) (30d)`;
          if (runs > 0 && dep > 0) return `warn ${runs} scheduled guardian runs / ${dep} deploys — not deploy-triggered`;
          if (runs > 0) return `warn ${runs} scheduled guardian runs, no deploys (30d)`;
          if (dep > 0) return `fail ${dep} deploys, no guardian validation`;
          return "fail No deployments or guardian validations (30d)";
        }
        default: return "fail Error budget not sent to change management";
      }
    default:
      switch (idx) {
        case 1: return f.workflowTitles.length > 0 ? `pass ${f.workflowTitles.length} automation workflow(s) (30d)` : "fail No automation detected";
        case 2: return f.workflowTitles.length > 0 ? "pass Workflows active" : "fail Not configured";
        case 3: return "fail Not detected";
        case 4: return f.totalProblems > 0 ? `${f.enrichPct >= 50 ? "pass " : "warn "}${f.enriched}/${f.totalProblems} enriched (${f.enrichPct}%)` : "fail No problems";
        default: return "fail Not detected";
      }
  }
}

export function avgLeadDays(f: Facts): number {
  const leads = f.deploys.map((d) => d.leadMs).filter((x): x is number => x !== null);
  if (leads.length === 0) return 0;
  return Math.round((leads.reduce((s, x) => s + x, 0) / leads.length / DAY) * 10) / 10;
}

/** Score the DQL baseline reports for the level (L3 excludes the live Runbooks check). */
export function baselineScore(f: Facts, level: LevelNo): number {
  const set = f.pass[level];
  return set.size - (level === 3 && set.has(4) ? 1 : 0);
}
