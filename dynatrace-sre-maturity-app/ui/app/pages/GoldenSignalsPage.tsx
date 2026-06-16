import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { useDqlWithCache } from "../hooks/useDqlWithCache";
import { RefreshOverlay } from "../components/RefreshOverlay";
import { KpiCard } from "../components/KpiCard";
import { ChartCard } from "../components/ChartCard";
import { SparklineCard } from "../components/SparklineCard";

// Auto-format microsecond durations into μs/ms/sec/min/hr
const formatDurationUs = (us: number): string => {
  if (us >= 3600 * 1000000) return `${(us / (3600 * 1000000)).toFixed(1)} hr`;
  if (us >= 60 * 1000000) return `${(us / (60 * 1000000)).toFixed(1)} min`;
  if (us >= 1000000) return `${(us / 1000000).toFixed(2)} sec`;
  if (us >= 1000) return `${(us / 1000).toFixed(0)} ms`;
  return `${Math.round(us)} μs`;
};

// ── Service Performance Table with color coding ──

function ServicePerformanceTable({ query }: { query: string }) {
  const { data, isLoading, isRefreshing, error } = useDqlWithCache({ query });
  const records = (data?.records || []) as Record<string, unknown>[];
  const maxRequests = records.reduce((m, r) => Math.max(m, Number(r.Requests || 0)), 1);

  // Color thresholds
  const errorPctColor = (pct: number) => {
    if (pct >= 5) return "#dc3545";
    if (pct >= 1) return "#f0ad4e";
    return "var(--sre-text-primary)";
  };
  const errorPctBg = (pct: number) => {
    if (pct >= 5) return "rgba(220,53,69,0.12)";
    if (pct >= 1) return "rgba(240,173,78,0.12)";
    return "transparent";
  };
  const latencyColor = (ms: number) => {
    if (ms >= 1000) return "#dc3545";
    if (ms >= 500) return "#f0ad4e";
    return "var(--sre-text-primary)";
  };
  const latencyBg = (ms: number) => {
    if (ms >= 1000) return "rgba(220,53,69,0.12)";
    if (ms >= 500) return "rgba(240,173,78,0.12)";
    return "transparent";
  };

  return (
    <RefreshOverlay isRefreshing={isRefreshing}>
      <div style={{
        background: "var(--sre-surface, #fff)",
        borderRadius: 12,
        border: "1px solid var(--sre-border)",
        overflow: "hidden",
        boxShadow: "0 1px 3px var(--sre-card-shadow)",
      }}>
        <div style={{
          background: "linear-gradient(135deg, #1966FF, #1966FFdd)",
          padding: "10px 20px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <Heading level={5} style={{ color: "#fff", margin: 0 }}>Service Performance Summary</Heading>
          {records.length > 0 && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{records.length} services</span>}
        </div>
        <div style={{ padding: 16 }}>
          {isLoading ? (
            <Flex justifyContent="center" padding={16}><ProgressCircle /></Flex>
          ) : error ? (
            <Paragraph style={{ color: "var(--dt-colors-text-critical-default)", fontSize: 12 }}>{error.message}</Paragraph>
          ) : records.length > 0 ? (
            <div style={{ maxHeight: 450, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    {["Service", "Traffic", "Requests", "Errors", "Error %", "P90 (ms)"].map((h) => (
                      <th key={h} style={{
                        textAlign: h === "Service" || h === "Traffic" ? "left" : "right",
                        padding: "8px 12px",
                        borderBottom: "2px solid var(--sre-table-border)",
                        fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                        color: "var(--sre-text-secondary)",
                        textTransform: "uppercase",
                        position: "sticky" as const, top: 0,
                        background: "var(--sre-surface)", zIndex: 1,
                        whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((row, i) => {
                    const requests = Number(row.Requests || 0);
                    const errors = Number(row.Errors || 0);
                    const errPct = Number(row["Error %"] || 0);
                    const p90 = Number(row["P90 (ms)"] || 0);
                    const trafficPct = (requests / maxRequests) * 100;

                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "var(--sre-table-stripe)" }}>
                        <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--sre-table-border)", fontWeight: 600, color: "var(--sre-text-primary)" }}>
                          {String(row.Service || "—")}
                        </td>
                        <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--sre-table-border)", minWidth: 120 }}>
                          <div style={{ height: 8, borderRadius: 4, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                            <div style={{
                              height: "100%",
                              width: `${trafficPct}%`,
                              borderRadius: 4,
                              background: "linear-gradient(90deg, #3BACF0, #1966FF)",
                              transition: "width 0.6s",
                            }} />
                          </div>
                        </td>
                        <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--sre-table-border)", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--sre-text-primary)" }}>
                          {requests.toLocaleString()}
                        </td>
                        <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--sre-table-border)", textAlign: "right", fontVariantNumeric: "tabular-nums", color: errors > 0 ? errorPctColor(errPct) : "var(--sre-text-primary)" }}>
                          {errors.toLocaleString()}
                        </td>
                        <td style={{
                          padding: "8px 12px", borderBottom: "1px solid var(--sre-table-border)",
                          textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700,
                          color: errorPctColor(errPct),
                          background: errorPctBg(errPct),
                        }}>
                          {errPct}%
                        </td>
                        <td style={{
                          padding: "8px 12px", borderBottom: "1px solid var(--sre-table-border)",
                          textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700,
                          color: latencyColor(p90),
                          background: latencyBg(p90),
                        }}>
                          {p90.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Paragraph style={{ color: "var(--sre-text-secondary)", opacity: 0.5 }}>No data available</Paragraph>
          )}
        </div>
      </div>
    </RefreshOverlay>
  );
}

interface Props {
  appCI: string;
  timeframe: { from: string; to: string };
}

// ── Styled chart card with colored accent ──


export const GoldenSignalsPage = ({ appCI, timeframe }: Props) => {
  const tf = `from:${timeframe.from}, to:${timeframe.to}`;

  // ── Service filter subquery ──
  // Latency keeps native microsecond unit so the chart auto-formats to ms/sec/min/hr
  const svcLookup = (metric: string, valueAlias: string = "val") => `fetch dt.entity.service
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup id
| lookup [
    timeseries ${valueAlias} = ${metric}, ${tf}, interval:5m, by:{dt.entity.service}
  ], sourceField:id, lookupField:dt.entity.service, prefix:"m."
| filter isNotNull(\`m.${valueAlias}\`)
| fields serviceName = entity.name, timeframe = \`m.timeframe\`, interval = \`m.interval\`, ${valueAlias} = \`m.${valueAlias}\``;

  // ── Timeseries queries ──
  const requestRateQuery = svcLookup("sum(dt.service.request.count)", "Requests");
  const errorRateQuery = svcLookup("sum(dt.service.request.failure_count)", "Errors");
  // Response time stays as microseconds — the chart will auto-format units (μs/ms/sec/min)
  const p90Query = svcLookup("percentile(dt.service.request.response_time, 90)", "P90");
  const p99Query = svcLookup("percentile(dt.service.request.response_time, 99)", "P99");

  // ── KPI summary queries ──
  const totalRequestsQuery = `fetch dt.entity.service
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup id
| lookup [
    timeseries val = sum(dt.service.request.count), ${tf}, interval:5m, by:{dt.entity.service}
  ], sourceField:id, lookupField:dt.entity.service, prefix:"m."
| filter isNotNull(\`m.val\`)
| fieldsAdd total = arraySum(\`m.val\`)
| summarize \`Total Requests\` = sum(total)`;

  const totalErrorsQuery = `fetch dt.entity.service
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup id
| lookup [
    timeseries val = sum(dt.service.request.failure_count), ${tf}, interval:5m, by:{dt.entity.service}
  ], sourceField:id, lookupField:dt.entity.service, prefix:"m."
| filter isNotNull(\`m.val\`)
| fieldsAdd total = arraySum(\`m.val\`)
| summarize \`Total Errors\` = sum(total)`;

  const avgP90Query = `fetch dt.entity.service
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup id
| lookup [
    timeseries val = percentile(dt.service.request.response_time, 90), ${tf}, interval:5m, by:{dt.entity.service}
  ], sourceField:id, lookupField:dt.entity.service, prefix:"m."
| filter isNotNull(\`m.val\`)
| fieldsAdd avg = arrayAvg(\`m.val\`)
| summarize \`Avg P90\` = round(avg(avg) / 1000, decimals:1)`;

  const svcCountQuery = `fetch dt.entity.service
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup id
| summarize \`Services\` = count()`;


  // ── Service summary table ──
  const serviceSummaryQuery = `fetch dt.entity.service
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup id
| lookup [
    timeseries req = sum(dt.service.request.count), ${tf}, interval:5m, by:{dt.entity.service}
  ], sourceField:id, lookupField:dt.entity.service, prefix:"r."
| lookup [
    timeseries err = sum(dt.service.request.failure_count), ${tf}, interval:5m, by:{dt.entity.service}
  ], sourceField:id, lookupField:dt.entity.service, prefix:"e."
| lookup [
    timeseries p90 = percentile(dt.service.request.response_time, 90), ${tf}, interval:5m, by:{dt.entity.service}
  ], sourceField:id, lookupField:dt.entity.service, prefix:"p."
| fieldsAdd
    totalReq = arraySum(\`r.req\`),
    totalErr = arraySum(\`e.err\`),
    avgP90 = arrayAvg(\`p.p90\`)
| filter isNotNull(totalReq)
| fieldsAdd errorPct = if(totalReq > 0, round(toDouble(totalErr) * 100.0 / toDouble(totalReq), decimals:2), else: 0.0)
| fieldsAdd avgP90ms = round(avgP90 / 1000, decimals:1)
| fields
    Service = entity.name,
    Requests = totalReq,
    Errors = totalErr,
    \`Error %\` = errorPct,
    \`P90 (ms)\` = avgP90ms
| sort Requests desc
| limit 25`;

  return (
    <Flex flexDirection="column" gap={20} padding={16}>
      <Heading level={3}>L2 — Measured Reliability (Golden Signals)</Heading>

      {/* KPI summary row */}
      <div style={{
        background: "linear-gradient(135deg, #1A2440 0%, #1A2440 100%)",
        borderRadius: 16, padding: "18px 24px 20px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 2, marginBottom: 14 }}>
          GOLDEN SIGNALS SUMMARY
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <KpiCard icon="&#128202;" label="TOTAL REQUESTS" query={totalRequestsQuery} color="#3BACF0" />
          <KpiCard icon="&#9888;" label="TOTAL ERRORS" query={totalErrorsQuery} color="#dc3545" />
          <KpiCard icon="&#9201;" label="AVG RESPONSE P90" query={avgP90Query} color="#8D1CDC" unit="ms" />
          <KpiCard icon="&#128300;" label="SERVICES REPORTING" query={svcCountQuery} color="#49C2B3" />
        </div>
      </div>

      {/* Sparkline trend overview — high-level view of each chart below */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
        <SparklineCard
          title="Traffic Trend"
          icon="&#128200;"
          color="#3BACF0"
          query={requestRateQuery}
          aggregation="sum"
        />
        <SparklineCard
          title="Errors Trend"
          icon="&#9888;"
          color="#dc3545"
          query={errorRateQuery}
          aggregation="sum"
        />
        <SparklineCard
          title="P90 Trend"
          icon="&#9201;"
          color="#8D1CDC"
          query={p90Query}
          aggregation="avg"
          unitType="duration_us"
        />
        <SparklineCard
          title="P99 Trend"
          icon="&#128293;"
          color="#8D1CDC"
          query={p99Query}
          aggregation="avg"
          unitType="duration_us"
        />
      </div>

      {/* Traffic & Errors charts — full width, side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <ChartCard
          title="Traffic — Request Rate"
          subtitle="Requests per 5-minute interval by service"
          icon="&#128200;"
          color="#3BACF0"
          query={requestRateQuery}
        />
        <ChartCard
          title="Errors — Failure Rate"
          subtitle="Failed requests per 5-minute interval by service"
          icon="&#9888;"
          color="#dc3545"
          query={errorRateQuery}
        />
      </div>

      {/* Latency charts — full width, side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <ChartCard
          title="Latency — Response Time P90"
          subtitle="90th percentile response time by service"
          icon="&#9201;"
          color="#8D1CDC"
          query={p90Query}
          yAxisFormatter={formatDurationUs}
        />
        <ChartCard
          title="Latency — Response Time P99"
          subtitle="99th percentile response time by service"
          icon="&#128293;"
          color="#8D1CDC"
          query={p99Query}
          yAxisFormatter={formatDurationUs}
        />
      </div>

      {/* Service breakdown table */}
      <ServicePerformanceTable query={serviceSummaryQuery} />
    </Flex>
  );
};
