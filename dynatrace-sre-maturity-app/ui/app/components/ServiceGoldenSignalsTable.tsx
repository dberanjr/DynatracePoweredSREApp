import React from "react";
import { Paragraph } from "@dynatrace/strato-components/typography";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { useDqlWithCache } from "../hooks/useDqlWithCache";
import { RefreshOverlay } from "./RefreshOverlay";
import { severityColor, severityLabel } from "./dependencyUtils";

interface Props {
  appCI: string;
  selectedServiceId: string | null;
  onSelect: (serviceId: string, serviceName: string) => void;
}

// Adapts the existing L2 "Golden Signal SLIs" query (checkDetailConfigs.ts)
// with a critical-service severity join, scoped to this AppCI. The join key
// is the entity id (not entity_name — service names collide across apps),
// and entity_ids is exploded first since a single critical_services row can
// pack multiple space-separated ids.
const buildQuery = (appCI: string) => `fetch dt.entity.service
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup id
| fields id, entity.name
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
| fields service = entity.name, entityId = id, requests, errorRate, p95Ms, critSeverity
| sort errorRate desc, requests desc
| limit 200`;

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
              {["Service", "Requests (1h)", "Error %", "P95 (ms)", "Critical"].map((h) => (
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
              const dot = severityColor(row.critSeverity != null ? String(row.critSeverity) : null);
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
                  </td>
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--sre-table-border)", textAlign: "right" }}>
                    {Number(row.requests || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--sre-table-border)", textAlign: "right" }}>
                    {Number(row.errorRate || 0)}%
                  </td>
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--sre-table-border)", textAlign: "right" }}>
                    {row.p95Ms != null ? Number(row.p95Ms).toLocaleString() : "—"}
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
