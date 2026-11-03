import { READINESS_QUERIES, readinessAppQueries } from "../queries/maturityQueries";

// The data-readiness registry: what each check needs (an "input"), how to measure it (a "probe"), and how to
// read the result. See docs/superpowers/specs/2026-10-22-data-readiness-design.md.
//
// A low score is ambiguous: it can mean weak practice, or only that this environment does not provide the
// input a check was written against. This registry makes the second case visible, and shows which checks
// each missing input blocks.

export type Status = "ready" | "partial" | "missing" | "na" | "unknown";
export type Records = Record<string, unknown>[];

export interface Outcome {
  status: Status;
  /** One line of evidence, for example "0 of 4,969 sampled logs (0%)". */
  evidence: string;
  /** Optional context that changes how the evidence should be read. */
  note?: string;
}

export interface ProbeDef {
  key: keyof typeof READINESS_QUERIES;
  query: string;
  /** What window or sample the query looks at, shown beside the evidence. */
  window: string;
  /** The input ids this probe measures. */
  produces: string[];
  /** The lookup the probe loads as its own subject, if any. Its absence means "missing", not "unknown". */
  ownLookup?: string;
  interpret: (records: Records) => Record<string, Outcome>;
}

export interface InputDef {
  id: string;
  name: string;
  /** Plain-language description, free of any customer's naming. */
  description: string;
  /** One generic line on how to close the gap. Names no customer; fuller guidance comes with the plays. */
  fix: string;
  /** The probe that measures it, or null while it is not measurable with a read-only query yet. */
  probe: ProbeDef["key"] | null;
}

export interface CheckDef {
  /** "L1-3": level, then the number in the scorecard. */
  id: string;
  level: "L1" | "L2" | "L3" | "L4" | "L5";
  name: string;
  inputs: string[];
  /** True for the checks the app itself marks "not yet live": no input exists, so they are not gaps. */
  notImplemented?: boolean;
  /**
   * True where the scorecard counts "nothing of this kind for this application" as not applicable, which
   * passes, instead of as a failure (Kubernetes, cloud, scaling). The page must not call that a gap.
   */
  naWhenAbsent?: boolean;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const text = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "");
const fmt = (n: number): string => n.toLocaleString("en-US");
const pct = (ok: number, total: number): number => (total > 0 ? Math.round((ok * 100) / total) : 0);

/** ok of total, as a status: none ok = missing, at least `readyAt` = ready, in between = partial. */
function ratio(ok: number, total: number, noun: string, readyAt = 0.8): Outcome {
  if (total === 0) return { status: "na", evidence: `No ${noun} found` };
  const status: Status = ok === 0 ? "missing" : ok / total >= readyAt ? "ready" : "partial";
  return { status, evidence: `${fmt(ok)} of ${fmt(total)} ${noun} (${pct(ok, total)}%)` };
}

/** The same, but an empty population counts as missing (a table or event stream that should have rows). */
function ratioOrMissing(ok: number, total: number, noun: string, readyAt = 0.8): Outcome {
  return total === 0 ? { status: "missing", evidence: `No ${noun}` } : ratio(ok, total, noun, readyAt);
}

const present = (n: number, noun: string): Outcome => (n > 0 ? { status: "ready", evidence: `${fmt(n)} ${noun}` } : { status: "missing", evidence: `No ${noun}` });

const byKind = (records: Records): Record<string, { total: number; ok: number }> => {
  const out: Record<string, { total: number; ok: number }> = {};
  for (const r of records) out[text(r.kind)] = { total: num(r.total), ok: num(r.ok) };
  return out;
};
const sumKinds = (k: Record<string, { total: number; ok: number }>) =>
  Object.values(k).reduce((a, v) => ({ total: a.total + v.total, ok: a.ok + v.ok }), { total: 0, ok: 0 });
const breakdown = (k: Record<string, { total: number; ok: number }>) =>
  Object.entries(k)
    .map(([name, v]) => `${name} ${fmt(v.ok)} of ${fmt(v.total)}`)
    .join(", ");

const Q = READINESS_QUERIES;

export const PROBES: ProbeDef[] = [
  {
    key: "resolution",
    query: Q.resolution,
    window: "entities seen recently (hosts: last 2 hours)",
    produces: ["IN-01"],
    interpret: (rec) => {
      const k = byKind(rec);
      const t = sumKinds(k);
      const o = ratio(t.ok, t.total, "services and hosts resolve to an AppCI");
      return { "IN-01": { ...o, evidence: `${o.evidence}: ${breakdown(k)}` } };
    },
  },
  {
    key: "cmdb",
    query: Q.cmdb,
    window: "the CMDB lookup, active applications",
    produces: ["IN-02"],
    ownLookup: "/lookups/dynatrace/cmdb_appci_owner_mapping",
    interpret: (rec) => ({ "IN-02": ratioOrMissing(num(rec[0]?.ok), num(rec[0]?.total), "active applications have a tier") }),
  },
  {
    key: "map",
    query: Q.map,
    window: "the AppCI map lookup",
    produces: ["IN-03"],
    ownLookup: "/lookups/appci_map",
    interpret: (rec) => ({ "IN-03": present(num(rec[0]?.total), "rows in the AppCI map") }),
  },
  {
    key: "logs",
    query: Q.logs,
    window: "a ~1-in-1000 sample of the last 2 hours of logs",
    produces: ["IN-04"],
    interpret: (rec) => ({ "IN-04": ratio(num(rec[0]?.ok), num(rec[0]?.total), "sampled logs carry an applicationci attribute") }),
  },
  {
    key: "k8s",
    query: Q.k8s,
    window: "Kubernetes clusters seen recently",
    produces: ["IN-05"],
    interpret: (rec) => ({ "IN-05": ratio(num(rec[0]?.ok), num(rec[0]?.total), "clusters are named for a known AppCI") }),
  },
  {
    key: "cloud",
    query: Q.cloud,
    window: "AWS, Azure and GCP resources in Smartscape",
    produces: ["IN-06"],
    interpret: (rec) => ({ "IN-06": ratio(num(rec[0]?.ok), num(rec[0]?.total), "cloud resources carry an ApplicationCI tag") }),
  },
  {
    key: "rumSynthetic",
    query: Q.rumSynthetic,
    window: "RUM applications active in 7 days, and all synthetic tests",
    produces: ["IN-07"],
    interpret: (rec) => {
      const k = byKind(rec);
      const t = sumKinds(k);
      const o = ratio(t.ok, t.total, "RUM apps and synthetic tests resolve to an AppCI");
      return { "IN-07": { ...o, evidence: `${o.evidence}: ${breakdown(k)}` } };
    },
  },
  {
    key: "seed",
    query: Q.seed,
    window: "the resolved critical-services lookup",
    produces: ["IN-12"],
    ownLookup: "/lookups/critical_services",
    interpret: (rec) => ({ "IN-12": ratioOrMissing(num(rec[0]?.ok), num(rec[0]?.total), "critical-service rows resolved to an entity") }),
  },
  {
    key: "deployments",
    query: Q.deployments,
    window: "the last 30 days of events",
    produces: ["IN-13"],
    interpret: (rec) => {
      const total = num(rec[0]?.total);
      const ok = num(rec[0]?.ok);
      if (total === 0) return { "IN-13": { status: "missing", evidence: "No deployment events in 30 days" } };
      const o = ratio(ok, total, "deployment events carry application_ci");
      return { "IN-13": ok === 0 ? { ...o, note: "Events exist, but none carry the application_ci field the checks read." } : o };
    },
  },
  {
    key: "srgEvents",
    query: Q.srgEvents,
    window: "the last 30 days of events",
    produces: ["IN-14"],
    interpret: (rec) => ({ "IN-14": present(num(rec[0]?.total), "Site Reliability Guardian validation events in 30 days") }),
  },
  {
    key: "workflows",
    query: Q.workflows,
    window: "Automation workflows that ran in the last 30 days",
    produces: ["IN-16"],
    interpret: (rec) => ({ "IN-16": ratio(num(rec[0]?.ok), num(rec[0]?.total), "workflows resolve to an AppCI by their title") }),
  },
  {
    key: "alertRouting",
    query: Q.alertRouting,
    window: "Automation workflows that ran in the last 30 days",
    produces: ["IN-15"],
    interpret: (rec) => {
      const named = rec.find((r) => text(r.kind) === "named");
      const sn = rec.find((r) => text(r.kind) === "servicenow");
      const ok = num(named?.ok);
      const total = num(named?.total);
      const snCount = num(sn?.total);
      const evidence = `${fmt(ok)} of ${fmt(total)} workflows are named "<code> Production Dynatrace Alerts"; ${fmt(snCount)} call ServiceNow`;
      if (ok > 0) return { "IN-15": { status: "ready", evidence } };
      return {
        "IN-15": {
          status: "missing",
          evidence,
          note: snCount > 0 ? "Alert routing exists, but not under the naming the L3 ITSM check reads." : undefined,
        },
      };
    },
  },
  {
    key: "problems",
    query: Q.problems,
    window: "Davis problems in the last 7 days",
    produces: ["IN-17", "IN-18"],
    interpret: (rec) => {
      const total = num(rec[0]?.total);
      const ok = num(rec[0]?.ok);
      return {
        "IN-17": ratio(ok, total, "problems are on a non-default alerting profile"),
        "IN-18": total > 0 ? { status: "ready", evidence: `${fmt(total)} problems in 7 days` } : { status: "na", evidence: "No problems in 7 days, so nothing to score" },
      };
    },
  },
];

export const INPUTS: InputDef[] = [
  { id: "IN-01", name: "AppCI resolution", description: "Services and hosts can be tied to an AppCI, by an applicationci tag or by an Application tag listed in the AppCI map. Every score is keyed on it.", fix: "Tag services and hosts with applicationci:<code>, or add each application name to the AppCI map on the Lookups tab.", probe: "resolution" },
  { id: "IN-02", name: "CMDB table with tiers", description: "The CMDB lookup lists the active applications, each with a business criticality (its tier).", fix: "Set a business criticality for each application in the CMDB table on the Lookups tab.", probe: "cmdb" },
  { id: "IN-03", name: "AppCI map", description: "The lookup that translates an Application tag name into an AppCI exists and has rows.", fix: "Create the AppCI map on the Lookups tab, with one row per application name.", probe: "map" },
  { id: "IN-04", name: "Log attribution", description: "Log records carry an applicationci attribute, so logs can be counted per application.", fix: "Add an applicationci attribute to log records at ingest, for example with an OpenPipeline processor that derives it from host or Kubernetes metadata.", probe: "logs" },
  { id: "IN-05", name: "Kubernetes attribution", description: "Kubernetes clusters are named so that they start with an AppCI, which is how the scorecard attributes them.", fix: "Name Kubernetes clusters so they start with the AppCI, or extend the app to attribute clusters through workload tags.", probe: "k8s" },
  { id: "IN-06", name: "Cloud attribution", description: "Cloud resources (AWS, Azure, GCP) carry an ApplicationCI tag or label.", fix: "Tag or label cloud resources with ApplicationCI.", probe: "cloud" },
  { id: "IN-07", name: "RUM and synthetic tagging", description: "Active RUM applications and synthetic tests can be tied to an AppCI.", fix: "Tag RUM applications and synthetic tests with their application, and add each spelling to the AppCI map.", probe: "rumSynthetic" },
  { id: "IN-08", name: "SLO convention", description: "SLOs follow a naming or tagging convention that identifies their application.", fix: "Name SLOs with the AppCI as a prefix, or tag them.", probe: null },
  { id: "IN-09", name: "Guardians tagged", description: "Site Reliability Guardians carry an AppCI tag.", fix: "Tag each Site Reliability Guardian with applicationci:<code>.", probe: null },
  { id: "IN-10", name: "SLO dashboards named", description: "SLO dashboards follow the naming convention that identifies their application.", fix: "Name SLO dashboards with the AppCI as a prefix and include 'SLO'.", probe: null },
  { id: "IN-11", name: "Runbook notebooks", description: "Runbooks are notebooks whose names identify their application.", fix: "Name runbook notebooks with the AppCI as a prefix and include 'Runbook'.", probe: null },
  { id: "IN-12", name: "Critical-services seed", description: "The critical-services list has rows, and they resolve to real Dynatrace entities.", fix: "List the application's critical endpoints or services on the Lookups tab, using names Dynatrace actually sees.", probe: "seed" },
  { id: "IN-13", name: "Deployment events", description: "Deployments are reported as events that carry an application_ci field.", fix: "Send a CUSTOM_DEPLOYMENT event from the deployment pipeline, with the AppCI in application_ci.", probe: "deployments" },
  { id: "IN-14", name: "Guardian validation events", description: "Site Reliability Guardian runs are reported as SDLC validation events.", fix: "Run Site Reliability Guardian validations from pipelines so they emit SDLC validation events.", probe: "srgEvents" },
  { id: "IN-15", name: "Alert routing", description: "Alert-routing workflows follow the naming the L3 ITSM check reads.", fix: "Name alert-routing workflows '<code> Production Dynatrace Alerts', or change the check to read the naming in use.", probe: "alertRouting" },
  { id: "IN-16", name: "Automation naming", description: "Automation workflows have titles that identify their application.", fix: "Start Automation workflow titles with the AppCI, or with an application name listed in the AppCI map.", probe: "workflows" },
  { id: "IN-17", name: "Alerting profiles", description: "Problems are routed through an alerting profile other than the default.", fix: "Route problems through an alerting profile other than the default.", probe: "problems" },
  { id: "IN-18", name: "Problems present", description: "Davis has problems to analyse, so the problem-based checks have something to score.", fix: "Nothing to fix: this reflects whether Davis has problems to analyse.", probe: "problems" },
];

// One entry per scored check, kept one per line so scripts/check-readiness-registry.mjs can compare the list
// with checkDetailConfigs.ts and fail if a check is added or renamed without being mapped here.
export const CHECKS: CheckDef[] = [
  { id: "L1-1", level: "L1", name: "OneAgent Deployed", inputs: ["IN-01"] },
  { id: "L1-2", level: "L1", name: "Tracing Validated", inputs: ["IN-01"] },
  { id: "L1-3", level: "L1", name: "Logs Correlated", inputs: ["IN-04"] },
  { id: "L1-4", level: "L1", name: "Smartscape Discovery", inputs: ["IN-01"] },
  { id: "L1-5", level: "L1", name: "Kubernetes", inputs: ["IN-05"], naWhenAbsent: true },
  { id: "L1-6", level: "L1", name: "Cloud", inputs: ["IN-06"], naWhenAbsent: true },
  { id: "L1-7", level: "L1", name: "RUM / Synthetics", inputs: ["IN-07"] },
  { id: "L2-1", level: "L2", name: "Golden Signal SLIs", inputs: ["IN-01"] },
  { id: "L2-2", level: "L2", name: "SLOs Created", inputs: ["IN-08"] },
  { id: "L2-3", level: "L2", name: "Site Reliability Guardians Created", inputs: ["IN-09"] },
  { id: "L2-4", level: "L2", name: "SLO Dashboards Published", inputs: ["IN-10"] },
  { id: "L2-5", level: "L2", name: "SRE Assessment in ARD", inputs: ["IN-02"] },
  { id: "L2-6", level: "L2", name: "Critical Services Tagged", inputs: ["IN-12"] },
  { id: "L3-1", level: "L3", name: "Causal AI Detection + Event Correlation", inputs: ["IN-01", "IN-18"] },
  { id: "L3-2", level: "L3", name: "CI/CD Integration", inputs: ["IN-13"] },
  { id: "L3-3", level: "L3", name: "ITSM Integration", inputs: ["IN-15"] },
  { id: "L3-4", level: "L3", name: "Runbooks Linked", inputs: ["IN-11"] },
  { id: "L3-5", level: "L3", name: "Alert Noise Review", inputs: ["IN-01", "IN-18"] },
  { id: "L3-6", level: "L3", name: "Problems with Root Cause", inputs: ["IN-01", "IN-18"] },
  { id: "L3-7", level: "L3", name: "DORA Metrics", inputs: ["IN-13"] },
  { id: "L4-1", level: "L4", name: "SLO Burn Rate Alerting", inputs: ["IN-08"] },
  { id: "L4-2", level: "L4", name: "Dynamic Scaling / K8s Autoscaling", inputs: ["IN-06"], naWhenAbsent: true },
  { id: "L4-3", level: "L4", name: "Predictive Forecasting", inputs: [], notImplemented: true },
  { id: "L4-4", level: "L4", name: "Release Impact Tracking", inputs: ["IN-13", "IN-14"] },
  { id: "L4-5", level: "L4", name: "Error Budget Gating", inputs: [], notImplemented: true },
  { id: "L5-1", level: "L5", name: "Repetitive Tasks Identified", inputs: ["IN-16"] },
  { id: "L5-2", level: "L5", name: "Workflow Automation", inputs: ["IN-16"] },
  { id: "L5-3", level: "L5", name: "E2E Remediation Automated", inputs: [], notImplemented: true },
  { id: "L5-4", level: "L5", name: "Incident Auto-Enrichment", inputs: ["IN-01", "IN-17"] },
  { id: "L5-5", level: "L5", name: "AI Postmortem / PTASK in ARD", inputs: [], notImplemented: true },
];

/** How a failed probe is reported. A missing lookup the probe is about is "missing"; any other failure is "unknown". */
export function outcomeFromError(probe: ProbeDef, message: string): Outcome {
  const missingLookup = /UNKNOWN_TABULAR_FILE|doesn't exist/i.test(message);
  const path = /"(\/lookups\/[^"\\]+)/.exec(message)?.[1] ?? /\\"(\/lookups\/[^"\\]+)/.exec(message)?.[1];
  if (missingLookup && path) {
    if (probe.ownLookup && path === probe.ownLookup) return { status: "missing", evidence: `The lookup ${path} does not exist` };
    return { status: "unknown", evidence: `Could not measure: it needs ${path}, which does not exist`, note: "Create that lookup on the Lookups tab, then run again." };
  }
  if (/permission|forbidden|not authori[sz]ed|\b40[13]\b/i.test(message)) {
    return { status: "unknown", evidence: "Could not measure: this user lacks permission to run the query" };
  }
  return { status: "unknown", evidence: `Could not measure: ${message.slice(0, 140)}` };
}

export type CheckState = "blocked" | "at-risk" | "unknown" | "ready" | "not-implemented" | "not-measurable" | "not-run";

/** What a check's required inputs say about it. A missing input blocks it; a partial one puts it at risk. */
export function checkState(check: CheckDef, outcomes: Record<string, Outcome | undefined>): CheckState {
  if (check.notImplemented) return "not-implemented";
  // An input with no probe yet cannot be measured by a read-only query, whatever has or has not been run.
  const measurable = check.inputs.filter((id) => INPUTS.find((i) => i.id === id)?.probe);
  if (check.inputs.length > 0 && measurable.length === 0) return "not-measurable";
  const statuses = measurable.map((id) => outcomes[id]?.status);
  if (statuses.every((s) => s === undefined)) return "not-run";
  if (statuses.includes("missing")) return "blocked";
  if (statuses.includes("partial")) return "at-risk";
  if (statuses.includes("unknown") || statuses.includes(undefined)) return "unknown";
  return "ready";
}

// ── Per application ──
// The probes above describe the whole environment. To explain one application's scorecard, each probe also has
// an application version (readinessAppQueries). Comparing the two separates an ENVIRONMENT gap (the input
// exists nowhere, so no application can pass it) from an APPLICATION gap (it exists elsewhere, not here).

/** The probes that have an application version. The AppCI map is a prerequisite, not something a check reads. */
export const APP_PROBES: ProbeDef[] = PROBES.filter((p) => p.key !== "map");

const appCode = (appCI: string): string => appCI.toUpperCase();

type AppInterpret = (rec: Records, a: string) => Record<string, Outcome>;
const one = (rec: Records, key = "total"): number => num(rec[0]?.[key]);

export const APP_INTERPRETERS: Record<string, AppInterpret> = {
  // Evidence is "label: value" so it reads correctly at any count (no singular/plural verbs to get wrong).
  resolution: (rec, a) => {
    const k = byKind(rec);
    const services = k.services?.total ?? 0;
    const hosts = k.hosts?.total ?? 0;
    const evidence = `Services resolved to ${appCode(a)}: ${fmt(services)}; hosts: ${fmt(hosts)}`;
    return { "IN-01": services + hosts > 0 ? { status: "ready", evidence } : { status: "missing", evidence } };
  },
  cmdb: (rec, a) => {
    const total = one(rec);
    const ok = one(rec, "ok");
    if (total === 0) return { "IN-02": { status: "missing", evidence: `${appCode(a)} is not in the CMDB table` } };
    return { "IN-02": ok > 0 ? { status: "ready", evidence: `${appCode(a)} has a tier in the CMDB table` } : { status: "missing", evidence: `${appCode(a)} is in the CMDB table but has no business criticality` } };
  },
  logs: (rec, a) => {
    const evidence = `Sampled logs carrying applicationci=${appCode(a)}: ${fmt(one(rec))}`;
    return { "IN-04": one(rec) > 0 ? { status: "ready", evidence } : { status: "missing", evidence, note: "Logs are sampled about 1 in 1000, so a very low-volume application can be missed." } };
  },
  k8s: (rec, a) => {
    const evidence = `Kubernetes clusters named for ${appCode(a)}: ${fmt(one(rec))}`;
    return { "IN-05": one(rec) > 0 ? { status: "ready", evidence } : { status: "missing", evidence } };
  },
  cloud: (rec, a) => {
    const evidence = `Cloud resources tagged ApplicationCI=${appCode(a)}: ${fmt(one(rec))}`;
    return { "IN-06": one(rec) > 0 ? { status: "ready", evidence } : { status: "missing", evidence } };
  },
  rumSynthetic: (rec, a) => {
    const k = byKind(rec);
    const rum = k["RUM apps"]?.total ?? 0;
    const syn = k["synthetic tests"]?.total ?? 0;
    const evidence = `RUM apps resolved to ${appCode(a)}: ${fmt(rum)}; synthetic tests: ${fmt(syn)}`;
    return { "IN-07": rum + syn > 0 ? { status: "ready", evidence } : { status: "missing", evidence } };
  },
  seed: (rec, a) => {
    const total = one(rec);
    const ok = one(rec, "ok");
    if (total === 0) return { "IN-12": { status: "na", evidence: `Critical services listed for ${appCode(a)}: 0`, note: "The scorecard counts an application with none listed as a pass." } };
    const evidence = `Critical services listed for ${appCode(a)}: ${fmt(total)}; resolved to an entity: ${fmt(ok)}`;
    return { "IN-12": ok > 0 ? { status: "ready", evidence } : { status: "missing", evidence } };
  },
  deployments: (rec, a) => {
    const evidence = `Deployment events for ${appCode(a)} in 30 days: ${fmt(one(rec))}`;
    return { "IN-13": one(rec) > 0 ? { status: "ready", evidence } : { status: "missing", evidence } };
  },
  srgEvents: (rec, a) => {
    const evidence = `Guardian validation events for ${appCode(a)} in 30 days: ${fmt(one(rec))}`;
    return { "IN-14": one(rec) > 0 ? { status: "ready", evidence } : { status: "missing", evidence } };
  },
  workflows: (rec, a) => {
    const evidence = `Workflows whose title resolves to ${appCode(a)}: ${fmt(one(rec))}`;
    return { "IN-16": one(rec) > 0 ? { status: "ready", evidence } : { status: "missing", evidence } };
  },
  alertRouting: (rec, a) => {
    const evidence = `Workflows named "${appCode(a)} Production Dynatrace Alerts": ${fmt(one(rec))}`;
    return { "IN-15": one(rec) > 0 ? { status: "ready", evidence } : { status: "missing", evidence } };
  },
  problems: (rec, a) => {
    const total = one(rec);
    const ok = one(rec, "ok");
    if (total === 0) return { "IN-17": { status: "na", evidence: `Problems for ${appCode(a)} in 7 days: 0` }, "IN-18": { status: "na", evidence: `Problems for ${appCode(a)} in 7 days: 0, so nothing to score` } };
    const share = ratio(ok, total, "problems");
    return {
      "IN-17": { status: share.status, evidence: `Problems for ${appCode(a)} on a non-default alerting profile: ${fmt(ok)} of ${fmt(total)} (${pct(ok, total)}%)` },
      "IN-18": { status: "ready", evidence: `Problems for ${appCode(a)} in 7 days: ${fmt(total)}` },
    };
  },
};

export const appQueryFor = (key: string, appCI: string): string => (readinessAppQueries(appCI) as Record<string, string>)[key] ?? "";

export type Verdict = "environment-gap" | "app-gap" | "ok" | "not-applicable" | "unknown" | "later" | "not-implemented" | "not-run";

export interface Reason {
  inputId: string;
  kind: "environment" | "app" | "ok" | "unknown" | "later" | "na";
  /** A full sentence a person can read without knowing the registry. */
  text: string;
}

export interface Finding {
  check: CheckDef;
  verdict: Verdict;
  reasons: Reason[];
}

/** "1 services" -> "1 service", "1 RUM apps" -> "1 RUM app". Only when the count is exactly 1. */
export const tidy = (t: string): string =>
  t.replace(/\b1 ((?:[A-Za-z]+ )*?)(services|hosts|clusters|workflows|events|problems|resources|logs|rows|apps|tests)\b/g, (_m, pre: string, noun: string) => `1 ${pre}${noun.slice(0, -1)}`);

const sentence = (t: string): string => tidy(/[.!?]$/.test(t) ? t : `${t}.`);

/**
 * Explains one application's checks. For each input a check reads, the environment result and the application
 * result decide the reason: missing everywhere is an environment gap; present elsewhere but not for this
 * application is an application gap.
 */
export function explainApp(
  appCI: string,
  estate: Record<string, Outcome | undefined>,
  app: Record<string, Outcome | undefined>
): Finding[] {
  const code = appCode(appCI);
  return CHECKS.map((check): Finding => {
    if (check.notImplemented) return { check, verdict: "not-implemented", reasons: [] };
    const reasons: Reason[] = [];
    for (const id of check.inputs) {
      const def = INPUTS.find((i) => i.id === id);
      const e = estate[id];
      const a = app[id];
      if (!def?.probe) {
        reasons.push({ inputId: id, kind: "later", text: `${def?.name ?? id} is not measured yet (it needs the SLO, Settings or Documents APIs).` });
      } else if (!e || !a) {
        reasons.push({ inputId: id, kind: "unknown", text: `${def.name} has not been measured yet.` });
      } else if (check.naWhenAbsent && a.status === "missing") {
        // The scorecard passes an application with none of these. If the environment has such resources but
        // none are attributed to anything, say so: the pass may be hiding infrastructure nobody can see.
        const caution = e.status === "missing" ? ` Note: ${e.evidence}, so if ${code} runs there, it is not being attributed to ${code}.` : "";
        reasons.push({ inputId: id, kind: "na", text: `${sentence(a.evidence)} The scorecard counts that as not applicable.${caution}` });
      } else if (e.status === "missing") {
        reasons.push({ inputId: id, kind: "environment", text: `${sentence(e.evidence)} Until this exists, no application can pass.` });
      } else if (e.status === "unknown" || a.status === "unknown") {
        reasons.push({ inputId: id, kind: "unknown", text: sentence(a.status === "unknown" ? a.evidence : e.evidence) });
      } else if (a.status === "missing" || a.status === "partial") {
        reasons.push({ inputId: id, kind: "app", text: `${sentence(a.evidence)} It exists elsewhere (${e.evidence}), so this is specific to ${code}.` });
      } else if (a.status === "na" || e.status === "na") {
        reasons.push({ inputId: id, kind: "na", text: sentence(a.evidence) });
      } else {
        reasons.push({ inputId: id, kind: "ok", text: sentence(a.evidence) });
      }
    }
    const kinds = new Set(reasons.map((r) => r.kind));
    const verdict: Verdict = kinds.has("environment")
      ? "environment-gap"
      : kinds.has("app")
        ? "app-gap"
        : kinds.has("unknown")
          ? "unknown"
          : reasons.every((r) => r.kind === "later")
            ? "later"
            : reasons.every((r) => r.kind === "na")
              ? "not-applicable"
              : "ok";
    return { check, verdict, reasons };
  });
}
