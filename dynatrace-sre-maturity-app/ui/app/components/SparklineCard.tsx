import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { useDqlWithCache } from "../hooks/useDqlWithCache";
import { RefreshOverlay } from "./RefreshOverlay";

interface Props {
  title: string;
  icon?: string;
  color: string;
  query: string;
  /** "sum" totals all series points; "avg" averages them; "last" uses the most recent value */
  aggregation?: "sum" | "avg" | "last";
  unit?: string;
  /** "duration_us" auto-formats microsecond values to μs/ms/sec/min */
  unitType?: "duration_us";
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const w = 200;
  const h = 50;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });

  // Smooth path
  const linePath = `M ${points.join(" L ")}`;
  // Filled area below the line
  const areaPath = `M 0,${h} L ${points.join(" L ")} L ${w},${h} Z`;

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id={`grad-${color.replace("#", "")}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${color.replace("#", "")})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Last point dot */}
      {points.length > 0 && (() => {
        const last = points[points.length - 1].split(",");
        return <circle cx={last[0]} cy={last[1]} r="3" fill={color} />;
      })()}
    </svg>
  );
}

/** Returns { series: values for sparkline (nulls → 0), rawValues: only non-null values for stats } */
function extractTimeseriesValues(records: Record<string, unknown>[]): { series: number[]; rawValues: number[] } {
  if (records.length === 0) return { series: [], rawValues: [] };

  // Skip these "infrastructure" fields when looking for the metric array
  const skipFields = new Set(["timeframe", "interval"]);

  // Find any array field that's not a metadata field
  const firstRow = records[0];
  let metricKey: string | null = null;
  for (const key of Object.keys(firstRow)) {
    if (skipFields.has(key)) continue;
    const val = firstRow[key];
    if (Array.isArray(val) && val.length > 0) {
      metricKey = key;
      break;
    }
  }

  if (!metricKey) return { series: [], rawValues: [] };

  // Determine length from first non-empty array
  let len = 0;
  for (const r of records) {
    const arr = r[metricKey];
    if (Array.isArray(arr) && arr.length > len) len = arr.length;
  }
  if (len === 0) return { series: [], rawValues: [] };

  // Track values per bucket; null if no data, otherwise sum across records
  const bucketSums: (number | null)[] = new Array(len).fill(null);
  records.forEach((r) => {
    const arr = r[metricKey!];
    if (Array.isArray(arr)) {
      arr.forEach((v, i) => {
        if (v === null || v === undefined) return;
        const num = Number(v);
        if (!isNaN(num)) {
          bucketSums[i] = (bucketSums[i] ?? 0) + num;
        }
      });
    }
  });

  // series: for sparkline rendering, fill nulls with 0
  const series = bucketSums.map((v) => v ?? 0);
  // rawValues: only buckets that had real data — used for avg calc
  const rawValues = bucketSums.filter((v) => v !== null) as number[];
  return { series, rawValues };
}

export function SparklineCard({
  title,
  icon,
  color,
  query,
  aggregation = "sum",
  unit,
  unitType,
}: Props) {
  const { data, isLoading, isRefreshing, error } = useDqlWithCache({ query });
  const records = (data?.records || []) as Record<string, unknown>[];

  const { series, rawValues } = extractTimeseriesValues(records);
  let bigNumber = 0;
  if (rawValues.length > 0) {
    if (aggregation === "sum") bigNumber = rawValues.reduce((s, v) => s + v, 0);
    else if (aggregation === "avg") bigNumber = rawValues.reduce((s, v) => s + v, 0) / rawValues.length;
    else if (aggregation === "last") bigNumber = rawValues[rawValues.length - 1];
  }

  // Trend: compare first half avg to second half avg (using raw values only)
  let trend: "up" | "down" | "flat" = "flat";
  let trendPct = 0;
  if (rawValues.length >= 4) {
    const mid = Math.floor(rawValues.length / 2);
    const firstHalf = rawValues.slice(0, mid);
    const secondHalf = rawValues.slice(mid);
    const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
    if (firstAvg > 0) {
      trendPct = Math.round(((secondAvg - firstAvg) / firstAvg) * 100);
    }
    if (secondAvg > firstAvg * 1.05) trend = "up";
    else if (secondAvg < firstAvg * 0.95) trend = "down";
  }

  const formatNumber = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(Math.round(n * 10) / 10);
  };

  // Auto-format duration in microseconds → μs/ms/sec/min/hr
  const formatDurationUs = (us: number): { value: string; unit: string } => {
    if (us >= 3600 * 1000000) return { value: (us / (3600 * 1000000)).toFixed(1), unit: "hr" };
    if (us >= 60 * 1000000) return { value: (us / (60 * 1000000)).toFixed(1), unit: "min" };
    if (us >= 1000000) return { value: (us / 1000000).toFixed(2), unit: "sec" };
    if (us >= 1000) return { value: (us / 1000).toFixed(1), unit: "ms" };
    return { value: Math.round(us).toString(), unit: "μs" };
  };

  // Compute display value + unit
  let displayValue: string;
  let displayUnit: string | undefined;
  if (unitType === "duration_us") {
    const f = formatDurationUs(bigNumber);
    displayValue = f.value;
    displayUnit = f.unit;
  } else {
    displayValue = formatNumber(bigNumber);
    displayUnit = unit;
  }

  const trendColor = trend === "up" ? "#dc3545" : trend === "down" ? "#49C2B3" : "var(--sre-text-secondary)";
  const trendIcon = trend === "up" ? "\u2197" : trend === "down" ? "\u2198" : "\u2192";

  return (
    <RefreshOverlay isRefreshing={isRefreshing}>
      <div style={{
        background: "var(--sre-surface, #fff)",
        borderRadius: 14,
        border: "1px solid var(--sre-border)",
        overflow: "hidden",
        boxShadow: "0 2px 8px var(--sre-card-shadow)",
        position: "relative",
      }}>
        {/* Top accent bar */}
        <div style={{
          height: 3,
          background: `linear-gradient(90deg, ${color}, ${color}66)`,
        }} />

        <div style={{ padding: "14px 18px 10px" }}>
          {/* Header row */}
          <Flex alignItems="center" gap={8} style={{ marginBottom: 6 }}>
            {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--sre-text-secondary)", letterSpacing: 1, textTransform: "uppercase" }}>
              {title}
            </span>
          </Flex>

          {/* Big number + trend */}
          {isLoading ? (
            <Flex justifyContent="center" padding={8}><ProgressCircle size="small" /></Flex>
          ) : error ? (
            <span style={{ fontSize: 12, color: "var(--dt-colors-text-critical-default)" }}>{error.message?.substring(0, 60)}</span>
          ) : (
            <>
              <Flex alignItems="baseline" gap={8} style={{ marginBottom: 4 }}>
                <span style={{
                  fontSize: 32, fontWeight: 900, color,
                  textShadow: `0 0 16px ${color}25`,
                  lineHeight: 1,
                }}>
                  {displayValue}
                </span>
                {displayUnit && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--sre-text-secondary)" }}>{displayUnit}</span>}
                {trend !== "flat" && (
                  <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: trendColor, display: "flex", alignItems: "center", gap: 3 }}>
                    {trendIcon} {Math.abs(trendPct)}%
                  </span>
                )}
              </Flex>

              {/* Sparkline */}
              {series.length > 1 && (
                <div style={{ marginTop: 6 }}>
                  <Sparkline values={series} color={color} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </RefreshOverlay>
  );
}
