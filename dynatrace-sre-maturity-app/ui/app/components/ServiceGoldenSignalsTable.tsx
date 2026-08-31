import React from "react";
import { Paragraph } from "@dynatrace/strato-components/typography";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { getEnvironmentUrl } from "@dynatrace-sdk/app-environment";
import { useDqlWithCache } from "../hooks/useDqlWithCache";
import { RefreshOverlay } from "./RefreshOverlay";
import { severityColor, severityLabel } from "./dependencyUtils";

interface Props {
  appCI: string;
  selectedServiceId: string | null;
  onSelect: (serviceId: string, serviceName: string) => void;
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
//    by comparing to root_cause_entity_id. A service could theoretically be
//    listed in more than one active problem — the root-cause role wins ties.
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
| fieldsAdd p95Ms = if(isNotNull(p95), round(p95 / 1000.0, decimals:1), else: null)
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
    | dedup affected_entity_ids
    | fields affected_entity_ids, role, problemName = event.name, problemId = event.id
  ], sourceField:id, lookupField:affected_entity_ids, fields:{problemRole = role, problemName, problemId}
| fields service = entity.name, entityId = id, requests, errorRate, p95Ms, critSeverity, downstream, upstream, problemRole, problemName, problemId
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
function latencyColor(ms: number) {
  if (ms >= 1000) return RED;
  if (ms >= 500) return AMBER;
  return "var(--sre-text-primary)";
}
function latencyBg(ms: number) {
  if (ms >= 1000) return redBg;
  if (ms >= 500) return amberBg;
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

function ProblemChip({ role, problemId }: { role: string; problemId: string }) {
  const isRootCause = role === "Root cause";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        // Problems app takes the internal event.id UUID, NOT the display_id
        // (P-XXXX) — display_id renders a blank page.
        const envUrl = getEnvironmentUrl().replace(/\/$/, "");
        window.open(`${envUrl}/ui/apps/dynatrace.davis.problems/problem/${encodeURIComponent(problemId)}`, "_blank");
      }}
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 10,
        border: "none",
        cursor: "pointer",
        marginLeft: 8,
        color: "#fff",
        background: isRootCause ? RED : AMBER,
      }}
      title={`Open active problem: ${role}`}
    >
      {isRootCause ? "Root cause" : "Impacted"}
    </button>
  );
}

export const ServiceGoldenSignalsTable = ({ appCI, selectedServiceId, onSelect }: Props) => {
  const { data, isLoading, isRefreshing, error } = useDqlWithCache({ query: buildQuery(appCI) });
  const records = (data?.records || []) as Record<string, unknown>[];

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
    return <Paragraph style={{ color: "var(--sre-text-secondary)", opacity: 0.6 }}>No services found for this AppCI.</Paragraph>;
  }

  return (
    <RefreshOverlay isRefreshing={isRefreshing}>
      <div style={{ maxHeight: 340, overflowY: "auto", border: "1px solid var(--sre-border)", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["Service", "Requests (1h)", "Error %", "P95 (ms)", "Upstream", "Downstream", "Critical"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: h === "Service" ? "left" : "right",
                    padding: "8px 12px",
                    borderBottom: "2px solid var(--sre-table-border)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    color: "var(--sre-text-secondary)",
                    textTransform: "uppercase",
                    position: "sticky",
                    top: 0,
                    background: "var(--sre-surface)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((row, i) => {
              const entityId = String(row.entityId || "");
              const isSelected = entityId === selectedServiceId;
              const errPct = Number(row.errorRate || 0);
              const p95 = row.p95Ms != null ? Number(row.p95Ms) : null;
              const upstream = Number(row.upstream || 0);
              const downstream = Number(row.downstream || 0);
              const dot = severityColor(row.critSeverity != null ? String(row.critSeverity) : null);
              const problemRole = row.problemRole != null ? String(row.problemRole) : null;
              const problemId = row.problemId != null ? String(row.problemId) : null;

              return (
                <tr
                  key={entityId || i}
                  onClick={() => entityId && onSelect(entityId, String(row.service || entityId))}
                  style={{
                    cursor: entityId ? "pointer" : "default",
                    background: isSelected ? "rgba(25,102,255,0.08)" : i % 2 === 0 ? "transparent" : "var(--sre-table-stripe)",
                  }}
                >
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--sre-table-border)", fontWeight: 600 }}>
                    {String(row.service || "—")}
                    {problemRole && problemId && <ProblemChip role={problemRole} problemId={problemId} />}
                  </td>
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--sre-table-border)", textAlign: "right" }}>
                    {Number(row.requests || 0).toLocaleString()}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
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
                      padding: "8px 12px",
                      borderBottom: "1px solid var(--sre-table-border)",
                      textAlign: "right",
                      fontWeight: 700,
                      color: p95 != null ? latencyColor(p95) : "var(--sre-text-primary)",
                      background: p95 != null ? latencyBg(p95) : "transparent",
                    }}
                  >
                    {p95 != null ? p95.toLocaleString() : "—"}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
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
                      padding: "8px 12px",
                      borderBottom: "1px solid var(--sre-table-border)",
                      textAlign: "right",
                      fontWeight: 700,
                      color: depCountColor(downstream),
                      background: depCountBg(downstream),
                    }}
                  >
                    {downstream}
                  </td>
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--sre-table-border)", textAlign: "right" }}>
                    {dot ? (
                      <span
                        title={severityLabel(row.critSeverity != null ? String(row.critSeverity) : null)}
                        style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: dot }}
                      />
                    ) : (
                      "—"
                    )}
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
