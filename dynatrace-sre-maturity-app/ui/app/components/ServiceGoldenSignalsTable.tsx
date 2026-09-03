import React, { useMemo, useState } from "react";
import { Paragraph } from "@dynatrace/strato-components/typography";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { useDqlWithCache } from "../hooks/useDqlWithCache";
import { RefreshOverlay } from "./RefreshOverlay";
import { severityColor, severityLabel, severityRank, formatDurationUs } from "./dependencyUtils";
import { openProblem } from "./SmartscapeViewMenu";

export type SeverityFilterValue = "high" | "medium" | "low" | "none";

function severityBucket(severity: string | null): SeverityFilterValue {
  switch (severityRank(severity)) {
    case 1:
      return "high";
    case 2:
      return "medium";
    case 3:
      return "low";
    default:
      return "none";
  }
}

interface Props {
  appCI: string;
  selectedServiceId: string | null;
  onSelect: (serviceId: string, serviceName: string) => void;
  /** Empty set = no filtering (show all services). */
  severityFilter: Set<SeverityFilterValue>;
  /** When set, shows only these specific entity ids (e.g. "the problematic
   * services" handed off from an AppCI click in the Unique AppCIs list) —
   * a separate, additive restriction on top of severityFilter. Null/undefined
   * = no restriction. */
  restrictToServiceIds?: Set<string> | null;
}

// Adapts the existing L2 "Golden Signal SLIs" query (checkDetailConfigs.ts)
// with four additions:
//  - critical-service severity, scoped to this AppCI, joined by entity id
//    (not entity_name — service names collide across apps) after exploding
//    entity_ids (a single critical_services row can pack multiple ids).
//  - direct upstream/downstream dependency counts, reusing the exact query
//    shape from the "4. Smartscape Discovery" check (checkDetailConfigs.ts) —
//    downstream comes straight off the service's own `calls` field; upstream
//    is a global (cross-app) inverted lookup, since callers can belong to
//    other AppCIs.
//  - active (status == "ACTIVE") Davis problem enrichment, joined by
//    exploding affected_entity_ids, with root-cause vs. victim distinguished
//    by comparing to root_cause_entity_id. A service can be listed in more
//    than one active problem simultaneously, so all matches are collected
//    into an array (root-cause entries sorted first) rather than deduped
//    down to one.
const buildQuery = (appCI: string) => `fetch dt.entity.service
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup id
| fields id, entity.name, calls
| limit 500
| lookup [
    timeseries {
      req = sum(dt.service.request.count, rollup: sum, scalar:true),
      fail = sum(dt.service.request.failure_count, rollup: sum, scalar:true),
      p95 = percentile(dt.service.request.response_time, 95, rollup: avg, scalar:true)
    }, by:{dt.entity.service}, from:now()-1h
  ], sourceField:id, lookupField:dt.entity.service, fields:{req, fail, p95}
| fieldsAdd requests = if(isNull(req), 0, else: toLong(req))
| fieldsAdd errorRate = if(isNotNull(req) and req > 0, round(fail * 100.0 / req, decimals:2), else: 0)
| fieldsAdd p95Us = p95
| lookup [
    load "/lookups/critical_services"
    | filter lower(appci) == lower("${appCI}")
    | filter entity_ids != "-"
    | fieldsAdd idList = splitString(entity_ids, " ")
    | expand idList
    | fields idList, severity
  ], sourceField:id, lookupField:idList, fields:{critSeverity = severity}
| fieldsFlatten calls, prefix:"calls_"
| fieldsAdd downstreamIds = \`calls_dt.entity.service\`
| fieldsAdd downstream = arraySize(downstreamIds)
| lookup [
    fetch dt.entity.service
    | fieldsFlatten calls, prefix:"calls_"
    | fieldsAdd downstreamIds = \`calls_dt.entity.service\`
    | expand downstreamIds
    | summarize upstream = countDistinct(id), by:{callee = downstreamIds}
  ], sourceField:id, lookupField:callee, fields:{upstream}
| fieldsAdd upstream = if(isNull(upstream), 0, else: upstream)
| fieldsAdd downstream = if(isNull(downstream), 0, else: downstream)
| lookup [
    fetch dt.davis.problems, from:now()-30d
    | filter event.status == "ACTIVE"
    | expand affected_entity_ids
    | fieldsAdd role = if(affected_entity_ids == root_cause_entity_id, "Root cause", else: "Impacted")
    | fieldsAdd roleRank = if(role == "Root cause", 0, else: 1)
    | sort roleRank asc
    | summarize problems = collectArray(record(role = role, problemId = event.id, problemName = event.name, problemDisplayId = display_id)), by:{affected_entity_ids}
  ], sourceField:id, lookupField:affected_entity_ids, fields:{problems}
| fields service = entity.name, entityId = id, requests, errorRate, p95Us, critSeverity, downstream, upstream, problems
| sort errorRate desc, requests desc
| limit 200`;

// Error % / latency thresholds match the existing ServicePerformanceTable
// (GoldenSignalsPage.tsx) convention. Dependency-count thresholds have no
// existing precedent in this codebase — these are reasonable starting
// defaults based on the fan-out observed during the dependency-viewer spike.
const RED = "#dc3545";
const AMBER = "#f0ad4e";
const redBg = "rgba(220,53,69,0.12)";
const amberBg = "rgba(240,173,78,0.12)";

function errorRateColor(pct: number) {
  if (pct >= 5) return RED;
  if (pct >= 1) return AMBER;
  return "var(--sre-text-primary)";
}
function errorRateBg(pct: number) {
  if (pct >= 5) return redBg;
  if (pct >= 1) return amberBg;
  return "transparent";
}
function latencyColor(us: number) {
  if (us >= 1000000) return RED;
  if (us >= 500000) return AMBER;
  return "var(--sre-text-primary)";
}
function latencyBg(us: number) {
  if (us >= 1000000) return redBg;
  if (us >= 500000) return amberBg;
  return "transparent";
}
function depCountColor(count: number) {
  if (count >= 25) return RED;
  if (count >= 10) return AMBER;
  return "var(--sre-text-primary)";
}
function depCountBg(count: number) {
  if (count >= 25) return redBg;
  if (count >= 10) return amberBg;
  return "transparent";
}

interface ProblemRef {
  role: string;
  problemId: string;
  problemName: string;
  problemDisplayId: string;
}

// Shows the actual "P-XXXX" problem id rather than the generic role word —
// with several simultaneous problems on one service, "Impacted"/"Impacted"
// gave no way to tell them apart. Role is still color-coded (root cause vs.
// impacted) and available on hover.
function ProblemChip({ role, problemId, problemDisplayId }: { role: string; problemId: string; problemDisplayId: string }) {
  const isRootCause = role === "Root cause";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openProblem(problemId);
      }}
      style={{
        fontSize: 9,
        fontWeight: 700,
        padding: "1px 6px",
        borderRadius: 10,
        border: "none",
        cursor: "pointer",
        color: "#fff",
        background: isRootCause ? RED : AMBER,
      }}
      title={`Open active problem: ${role}`}
    >
      {problemDisplayId || (isRootCause ? "Root cause" : "Impacted")}
    </button>
  );
}

// Hollow ring = criticality (or neutral grey if unrated); solid red fill
// only when the service currently has an active problem — live incident
// state is a separate signal from a static criticality rating, matching
// the convention used everywhere else in the Dependencies tab (chips,
// topology nodes).
function CriticalityDot({ severity, hasProblem }: { severity: string | null; hasProblem: boolean }) {
  const ringColor = severityColor(severity) || "var(--sre-border, rgba(0,0,0,0.3))";
  return (
    <span
      title={hasProblem ? "Active problem" : severityLabel(severity)}
      style={{
        display: "inline-block",
        width: 9,
        height: 9,
        borderRadius: "50%",
        border: `2px solid ${hasProblem ? RED : ringColor}`,
        background: hasProblem ? RED : "transparent",
      }}
    />
  );
}

type SortKey = "service" | "requests" | "errorRate" | "p95Us" | "upstream" | "downstream" | "critSeverity";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "critSeverity", label: "Critical" },
  { key: "service", label: "Service" },
  { key: "requests", label: "Requests (1h)" },
  { key: "errorRate", label: "Error %" },
  { key: "p95Us", label: "P95" },
  { key: "upstream", label: "Upstream" },
  { key: "downstream", label: "Downstream" },
];

// Ascending is the natural reading order per column: alphabetical for
// service, most-severe-first for critical (severityRank is already
// low-number-is-worse), smallest-first for everything else. Numeric/critical
// columns default to descending on first click since "biggest/worst first"
// is usually what's wanted; service defaults ascending (A-Z).
function compareRows(a: Record<string, unknown>, b: Record<string, unknown>, key: SortKey): number {
  if (key === "service") return String(a.service || "").localeCompare(String(b.service || ""));
  if (key === "critSeverity") {
    return severityRank(a.critSeverity != null ? String(a.critSeverity) : null) - severityRank(b.critSeverity != null ? String(b.critSeverity) : null);
  }
  return Number(a[key] || 0) - Number(b[key] || 0);
}

function SortableHeader({ col, sortKey, sortDir, onSort }: { col: { key: SortKey; label: string }; sortKey: SortKey; sortDir: "asc" | "desc"; onSort: (k: SortKey) => void }) {
  const isActive = sortKey === col.key;
  return (
    <th
      onClick={() => onSort(col.key)}
      style={{
        textAlign: col.key === "service" || col.key === "critSeverity" ? "left" : "right",
        padding: "4px 9px",
        borderBottom: "2px solid var(--sre-table-border)",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.5,
        color: isActive ? "#1966FF" : "var(--sre-text-secondary)",
        textTransform: "uppercase",
        position: "sticky",
        top: 0,
        background: "var(--sre-surface)",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
      title="Click to sort"
    >
      {col.label}
      {isActive && <span style={{ marginLeft: 4 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}

export const ServiceGoldenSignalsTable = ({ appCI, selectedServiceId, onSelect, severityFilter, restrictToServiceIds }: Props) => {
  const { data, isLoading, isRefreshing, error } = useDqlWithCache({ query: buildQuery(appCI) });
  const [sortKey, setSortKey] = useState<SortKey>("errorRate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "service" ? "asc" : "desc");
    }
  };

  const records = useMemo(() => {
    let rows = (data?.records || []) as Record<string, unknown>[];
    if (severityFilter.size > 0) {
      rows = rows.filter((r) => severityFilter.has(severityBucket(r.critSeverity != null ? String(r.critSeverity) : null)));
    }
    if (restrictToServiceIds && restrictToServiceIds.size > 0) {
      rows = rows.filter((r) => restrictToServiceIds.has(String(r.entityId || "")));
    }
    rows = rows.slice();
    rows.sort((a, b) => compareRows(a, b, sortKey) * (sortDir === "asc" ? 1 : -1));
    return rows;
  }, [data, sortKey, sortDir, severityFilter, restrictToServiceIds]);

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
        <ProgressCircle />
      </div>
    );
  }
  if (error) {
    return <Paragraph style={{ color: "var(--dt-colors-text-critical-default)", fontSize: 12 }}>{error.message}</Paragraph>;
  }
  if (records.length === 0) {
    return (
      <Paragraph style={{ color: "var(--sre-text-secondary)", opacity: 0.6 }}>
        {restrictToServiceIds && restrictToServiceIds.size > 0
          ? "None of the flagged services matched this AppCI's service list."
          : severityFilter.size > 0
            ? "No services match the selected severity filter."
            : "No services found for this AppCI."}
      </Paragraph>
    );
  }

  return (
    <RefreshOverlay isRefreshing={isRefreshing}>
      <div style={{ maxHeight: 340, overflowY: "auto", border: "1px solid var(--sre-border)", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <SortableHeader key={col.key} col={col} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((row, i) => {
              const entityId = String(row.entityId || "");
              const isSelected = entityId === selectedServiceId;
              const errPct = Number(row.errorRate || 0);
              const p95 = row.p95Us != null ? Number(row.p95Us) : null;
              const upstream = Number(row.upstream || 0);
              const downstream = Number(row.downstream || 0);
              const severity = row.critSeverity != null ? String(row.critSeverity) : null;
              const problems = (Array.isArray(row.problems) ? (row.problems as unknown[]) : []).map((p) => {
                const rec = p as Record<string, unknown>;
                return {
                  role: String(rec.role || ""),
                  problemId: String(rec.problemId || ""),
                  problemName: String(rec.problemName || ""),
                  problemDisplayId: String(rec.problemDisplayId || ""),
                } as ProblemRef;
              });
              const hasProblem = problems.length > 0;
              const isRootCause = problems.some((p) => p.role === "Root cause");

              return (
                <tr
                  key={entityId || i}
                  onClick={() => entityId && onSelect(entityId, String(row.service || entityId))}
                  style={{
                    cursor: entityId ? "pointer" : "default",
                    background: isSelected ? "rgba(25,102,255,0.08)" : i % 2 === 0 ? "transparent" : "var(--sre-table-stripe)",
                  }}
                >
                  <td style={{ padding: "4px 9px", borderBottom: "1px solid var(--sre-table-border)" }}>
                    <CriticalityDot severity={severity} hasProblem={hasProblem} />
                  </td>
                  <td style={{ padding: "4px 9px", borderBottom: "1px solid var(--sre-table-border)", fontWeight: 600, color: isRootCause ? RED : "var(--sre-text-primary)" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {String(row.service || "—")}
                      {problems.map((p) => (
                        <ProblemChip key={p.problemId} role={p.role} problemId={p.problemId} problemDisplayId={p.problemDisplayId} />
                      ))}
                    </span>
                  </td>
                  <td style={{ padding: "4px 9px", borderBottom: "1px solid var(--sre-table-border)", textAlign: "right" }}>
                    {Number(row.requests || 0).toLocaleString()}
                  </td>
                  <td
                    style={{
                      padding: "4px 9px",
                      borderBottom: "1px solid var(--sre-table-border)",
                      textAlign: "right",
                      fontWeight: 700,
                      color: errorRateColor(errPct),
                      background: errorRateBg(errPct),
                    }}
                  >
                    {errPct}%
                  </td>
                  <td
                    style={{
                      padding: "4px 9px",
                      borderBottom: "1px solid var(--sre-table-border)",
                      textAlign: "right",
                      fontWeight: 700,
                      color: p95 != null ? latencyColor(p95) : "var(--sre-text-primary)",
                      background: p95 != null ? latencyBg(p95) : "transparent",
                    }}
                  >
                    {p95 != null ? formatDurationUs(p95) : "—"}
                  </td>
                  <td
                    style={{
                      padding: "4px 9px",
                      borderBottom: "1px solid var(--sre-table-border)",
                      textAlign: "right",
                      fontWeight: 700,
                      color: depCountColor(upstream),
                      background: depCountBg(upstream),
                    }}
                  >
                    {upstream}
                  </td>
                  <td
                    style={{
                      padding: "4px 9px",
                      borderBottom: "1px solid var(--sre-table-border)",
                      textAlign: "right",
                      fontWeight: 700,
                      color: depCountColor(downstream),
                      background: depCountBg(downstream),
                    }}
                  >
                    {downstream}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </RefreshOverlay>
  );
};
