// Fixtures for the signal / observability pages: Overview (Home), Golden
// Signals (L2), AI Ops (L3), Proactive (L4), Problem Analytics, and the
// Dependencies-tab service golden-signals table. See ../signalsModel.ts.
import type { DemoFixture } from "../types";
import { extractAppId } from "../portfolio";
import { servicesForApp } from "../services";
import {
  EVENT_CATEGORIES, EVENT_POINTS, EVENT_STEP, SVC_STEP, EventCategory,
  eventModel, inventory, problemModel, svcSignals, svcTotals, tsResult,
} from "../signalsModel";

const app = extractAppId;
const rows = (records: Record<string, unknown>[]) => ({ records });
const one = (key: string, value: number) => rows([{ [key]: value }]);
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const re = (r: RegExp) => (q: string) => r.test(q);

export const signalsFixtures: DemoFixture[] = [
  // ── Dependencies tab: service golden-signals table ────────────────────────
  {
    id: "svc-golden-signals-table",
    match: /fields id, entity\.name, calls/,
    respond: (q) => {
      const a = app(q);
      const records = servicesForApp(a.code).map((s) => {
        const upstream = servicesForApp(a.code).filter((x) => x.callsIds.includes(s.id)).length + (s.index === 1 ? a.calls.length : 0);
        return {
          service: s.name,
          entityId: s.id,
          requests: s.reqCount,
          errorRate: s.reqCount > 0 ? Math.round((s.failCount * 100 * 100) / s.reqCount) / 100 : 0,
          p95Us: s.p95Us,
          critSeverity: s.severity,
          downstream: s.callsIds.length,
          upstream,
          problems: s.problem
            ? [{ role: s.problem.role, problemId: s.problem.problemId, problemName: s.problem.problemName, problemDisplayId: s.problem.problemDisplayId }]
            : [],
        };
      });
      return rows(records);
    },
  },

  // ── Golden Signals page ───────────────────────────────────────────────────
  {
    id: "gs-service-summary",
    match: /Requests = totalReq/,
    respond: (q) => rows(svcTotals(app(q)).rows.sort((x, y) => y.Requests - x.Requests)),
  },
  { id: "gs-total-requests", match: /summarize `Total Requests`/, respond: (q) => one("Total Requests", svcTotals(app(q)).totalRequests) },
  { id: "gs-total-errors", match: /summarize `Total Errors`/, respond: (q) => one("Total Errors", svcTotals(app(q)).totalErrors) },
  { id: "gs-avg-p90", match: /summarize `Avg P90`/, respond: (q) => one("Avg P90", svcTotals(app(q)).avgP90ms) },
  {
    id: "gs-timeseries",
    match: /fields serviceName = entity\.name, timeframe/,
    respond: (q) => {
      const field = /timeseries (Requests|Errors|P90|P99) =/.exec(q)?.[1] ?? "Requests";
      const key = ({ Requests: "requests", Errors: "errors", P90: "p90", P99: "p99" } as const)[field as "Requests" | "Errors" | "P90" | "P99"];
      return tsResult(field, svcSignals(app(q)).map((s) => ({ dims: { serviceName: s.svc.name }, values: s[key] })), SVC_STEP);
    },
  },

  // ── Davis problems (Problem Analytics) ────────────────────────────────────
  {
    id: "pa-top-alerting-services",
    match: /Service = entityName\(dt\.entity\.service\)/,
    respond: (q) => rows(problemModel(app(q)).alertingServices),
  },
  { id: "pa-total", match: /fetch dt\.davis\.problems[\s\S]*summarize `Total` = count/, respond: (q) => one("Total", problemModel(app(q)).total) },
  { id: "pa-active", match: /fetch dt\.davis\.problems[\s\S]*summarize `Active` = count/, respond: (q) => one("Active", problemModel(app(q)).active) },
  { id: "pa-closed", match: /fetch dt\.davis\.problems[\s\S]*summarize `Closed` = count/, respond: (q) => one("Closed", problemModel(app(q)).closed) },
  { id: "pa-user", match: /summarize `User-impacting` = count/, respond: (q) => one("User-impacting", problemModel(app(q)).userImpacting) },
  { id: "pa-noisy-kpi", match: /summarize `Noisy Alerts` = count/, respond: (q) => one("Noisy Alerts", problemModel(app(q)).noisy) },
  {
    id: "pa-avg-mttr-kpi",
    match: /dt\.davis\.problems[\s\S]*summarize `Avg MTTR \(min\)` = round\(avg\(toDouble\(resolved_problem_duration\)/,
    respond: (q) => one("Avg MTTR (min)", problemModel(app(q)).mttr),
  },
  {
    id: "pa-mttr-by-type",
    match: /summarize `Avg MTTR \(min\)` = round\(avg\(durationMin\), decimals:1\), by:\{event\.type\}/,
    respond: (q) => rows(problemModel(app(q)).mttrByType),
  },
  { id: "pa-active-vs-closed", match: /makeTimeseries Problems = count\(\), by:\{event\.status\}/, respond: (q) => tsResult("Problems", problemModel(app(q)).activeVsClosed, EVENT_STEP) },
  { id: "pa-by-category-trend", match: /makeTimeseries Problems = count\(\), by:\{event\.category\}/, respond: (q) => tsResult("Problems", problemModel(app(q)).catSeries, EVENT_STEP) },
  { id: "pa-mttr-trend", match: /makeTimeseries `MTTR \(min\)`/, respond: (q) => tsResult("MTTR (min)", [{ values: problemModel(app(q)).mttrSeries }], EVENT_STEP) },
  { id: "pa-median-trend", match: /makeTimeseries `Median Duration`/, respond: (q) => tsResult("Median Duration", problemModel(app(q)).medianSeries, EVENT_STEP) },
  { id: "pa-by-category", match: /summarize Problems = count\(\), by:\{event\.category\}/, respond: (q) => rows(problemModel(app(q)).byCat) },
  { id: "pa-by-name", match: /summarize Problems = count\(\), by:\{event\.name\}/, respond: (q) => rows(problemModel(app(q)).names.slice(0, 20)) },
  { id: "pa-root-causes", match: /by:\{rcName = root_cause_entity_name\}/, respond: (q) => rows(problemModel(app(q)).rootCauses) },
  { id: "pa-noisy-alerts", match: /by:\{alertName\}/, respond: (q) => rows(problemModel(app(q)).noisyAlerts) },

  // ── AI Ops (events matched via affected_entity_ids lookup) ────────────────
  {
    id: "aiops-trend-by-category",
    match: /idStr[\s\S]*dedup event\.id, event\.category[\s\S]*makeTimeseries Events = count\(\),\s*by:\{event\.category\}/,
    respond: (q) => {
      const m = eventModel(app(q));
      return tsResult("Events", EVENT_CATEGORIES.map((c) => ({ dims: { "event.category": c }, values: m.series[c] })), EVENT_STEP);
    },
  },
  {
    id: "aiops-trend-total",
    match: /idStr[\s\S]*dedup event\.id\s*\| makeTimeseries Events = count\(\)/,
    respond: (q) => {
      const m = eventModel(app(q));
      const total = Array.from({ length: EVENT_POINTS }, (_, i) => EVENT_CATEGORIES.reduce((t, c) => t + m.series[c][i], 0));
      return tsResult("Events", [{ values: total }], EVENT_STEP);
    },
  },
  { id: "aiops-noisy-services", match: /serviceName = `svc\.serviceName`/, respond: (q) => rows(eventModel(app(q)).noisy) },
  {
    id: "aiops-by-category",
    match: /idStr[\s\S]*summarize Events = countDistinct\(event\.id\),\s*by:\{event\.category\}/,
    respond: (q) => {
      const m = eventModel(app(q));
      return rows(EVENT_CATEGORIES.map((c) => ({ "event.category": c, Events: m.byCat[c] })).sort((a, b) => b.Events - a.Events));
    },
  },
  { id: "aiops-top-types", match: /idStr[\s\S]*by:\{event\.type\}/, respond: (q) => rows(eventModel(app(q)).types.slice(0, 15)) },
  {
    id: "aiops-kpi",
    match: /idStr[\s\S]*summarize `(Total|Count)` = countDistinct\(event\.id\)/,
    respond: (q) => {
      const m = eventModel(app(q));
      const cat = /event\.category == "(\w+)"/.exec(q)?.[1] as EventCategory | undefined;
      return cat ? one("Count", m.byCat[cat]) : one("Total", m.total);
    },
  },

  // ── Proactive (events matched via affected_entity_tags) ───────────────────
  {
    id: "proactive-deploy-trend",
    match: /CUSTOM_DEPLOYMENT[\s\S]*makeTimeseries Deployments = count\(\)/,
    respond: (q) => tsResult("Deployments", [{ values: eventModel(app(q)).deploys }], EVENT_STEP),
  },
  {
    id: "proactive-category-trend",
    match: /affected_entity_tags[\s\S]*event\.category == "(RESOURCE_CONTENTION|CUSTOM_ALERT)"[\s\S]*makeTimeseries (Events|Alerts) = count\(\)/,
    respond: (q) => {
      const cat = /event\.category == "(\w+)"/.exec(q)![1] as EventCategory;
      return tsResult(cat === "CUSTOM_ALERT" ? "Alerts" : "Events", [{ values: eventModel(app(q)).series[cat] }], EVENT_STEP);
    },
  },
  {
    id: "proactive-category-count",
    match: /affected_entity_tags[\s\S]*event\.category == "(RESOURCE_CONTENTION|CUSTOM_ALERT)"[\s\S]*summarize `Count` = count\(\)/,
    respond: (q) => one("Count", sum(eventModel(app(q)).series[/event\.category == "(\w+)"/.exec(q)![1] as EventCategory])),
  },
  {
    id: "deploy-count",
    match: /CUSTOM_DEPLOYMENT[\s\S]*summarize `?Count`? = count\(\)\s*$/,
    respond: (q) => one("Count", sum(eventModel(app(q)).deploys)),
  },

  // ── Overview + shared inventory lists / counts ────────────────────────────
  { id: "aws-by-type", match: /workflow\.summary\.cloud\.aws[\s\S]*summarize Count = count\(\), by:\{type\}/, respond: (q) => rows(inventory(app(q)).aws) },
  {
    id: "aws-count",
    match: /workflow\.summary\.cloud\.aws[\s\S]*summarize `?Count`? = count\(\)\s*$/,
    respond: (q) => one("Count", sum(inventory(app(q)).aws.map((x) => x.Count))),
  },
  { id: "list-services", match: re(/^fetch dt\.entity\.service[\s\S]*\| fields Service = entity\.name\s*\| sort Service asc/), respond: (q) => rows(servicesForApp(app(q).code).map((s) => ({ Service: s.name })).sort((a, b) => a.Service.localeCompare(b.Service))) },
  { id: "list-hosts", match: /fields Host = entity\.name, monitoringMode/, respond: (q) => rows(inventory(app(q)).hosts) },
  { id: "list-k8s", match: /fields Workload = entity\.name/, respond: (q) => rows(inventory(app(q)).workloads.map((Workload) => ({ Workload }))) },
  { id: "count-services", match: re(/^fetch dt\.entity\.service[\s\S]*summarize `?(Count|Services)`? = count\(\)\s*$/), respond: (q) => one("Count", servicesForApp(app(q).code).length) },
  { id: "count-hosts", match: re(/^fetch dt\.entity\.host[\s\S]*summarize Count = count\(\)\s*$/), respond: (q) => one("Count", inventory(app(q)).hosts.length) },
  { id: "count-process-groups", match: re(/^fetch dt\.entity\.process_group[\s\S]*summarize Count = count\(\)\s*$/), respond: (q) => one("Count", inventory(app(q)).processGroups) },
  { id: "count-k8s", match: re(/^fetch dt\.entity\.cloud_application[\s\S]*summarize `?Count`? = count\(\)\s*$/), respond: (q) => one("Count", inventory(app(q)).workloads.length) },
  { id: "count-rum", match: re(/^fetch dt\.entity\.application,[\s\S]*summarize Count = count\(\)\s*$/), respond: (q) => one("Count", inventory(app(q)).rum) },
  { id: "count-logs", match: re(/^fetch logs, samplingRatio:100[\s\S]*summarize Count = count\(\)\s*$/), respond: () => one("Count", 1) },
];
