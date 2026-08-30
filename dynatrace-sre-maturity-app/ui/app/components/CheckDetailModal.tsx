import React from "react";
import ReactDOM from "react-dom";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { getEnvironmentUrl } from "@dynatrace-sdk/app-environment";
import { useAppFunction } from "@dynatrace-sdk/react-hooks";
import { useDqlWithCache } from "../hooks/useDqlWithCache";
import { CHECK_DETAIL_CONFIGS, LEVEL_META, CheckDetailConfig } from "./checkDetailConfigs";
import { HardcodedBadge } from "./HardcodedBadge";

interface Props {
  checkKey: string;
  currentValue: string;
  appCI: string;
  accentColor: string;
  onClose: () => void;
  /** All checks in the same level, in display order, including the currently-open one. */
  siblings: { key: string; value: string }[];
  onNavigate: (key: string, value: string) => void;
}

// Shared fixed height for the primary and secondary tables so a modal with
// both (e.g. Cloud's resource list + type breakdown) shows them matched in
// height, rather than the shorter one shrinking to fit its content.
const TABLE_HEIGHT = "42vh";

function getStatus(value: string): "pass" | "fail" | "warn" | "na" {
  const v = value.toLowerCase();
  if (v.startsWith("pass")) return "pass";
  if (v.startsWith("fail")) return "fail";
  if (v.startsWith("warn")) return "warn";
  if (v.startsWith("n/a")) return "na";
  return "na";
}

const STATUS_STYLES = {
  pass: { bg: "rgba(40,167,69,0.09)", border: "rgba(40,167,69,0.35)", text: "#1a7f37", label: "PASS" },
  fail: { bg: "rgba(220,53,69,0.09)", border: "rgba(220,53,69,0.35)", text: "#cf222e", label: "FAIL" },
  warn: { bg: "rgba(255,193,7,0.12)", border: "rgba(255,193,7,0.45)", text: "#9a6700", label: "WARN" },
  na: { bg: "rgba(128,128,128,0.06)", border: "rgba(128,128,128,0.22)", text: "#656d76", label: "N/A" },
};

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "number") {
    // epoch ms → date string
    if (val > 1_000_000_000_000) {
      return new Date(val).toLocaleString();
    }
    return val.toLocaleString();
  }
  if (typeof val === "boolean") return val ? "Yes" : "No";
  const s = String(val);
  // ISO date strings
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    try { return new Date(s).toLocaleString(); } catch { return s; }
  }
  return s;
}

function DataTable({
  records,
  maxHeight,
  onRowClick,
  hiddenCols = [],
}: {
  records: Record<string, unknown>[];
  maxHeight?: string;
  onRowClick?: (row: Record<string, unknown>) => void;
  hiddenCols?: string[];
}) {
  if (!records.length) return null;
  const allCols = Object.keys(records[0]);
  const cols = allCols.filter((c) => !hiddenCols.includes(c));
  const rowLimit = maxHeight ? records.length : 50;
  return (
    <div style={{ overflowX: "auto", overflowY: maxHeight ? "auto" : "visible", height: maxHeight, fontSize: 12 }}>
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, tableLayout: "auto" }}>
        <thead>
          <tr>
            {cols.map((col) => (
              <th
                key={col}
                style={{
                  padding: "6px 10px",
                  textAlign: "left",
                  fontWeight: 600,
                  color: "var(--sre-text-secondary, #6F747F)",
                  borderBottom: "2px solid var(--sre-border, rgba(0,0,0,0.1))",
                  whiteSpace: "nowrap",
                  background: "var(--sre-surface, #fff)",
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                  fontSize: 11,
                  letterSpacing: 0.3,
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.slice(0, rowLimit).map((row, i) => (
            <tr
              key={i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{
                background: i % 2 === 0 ? "transparent" : "var(--sre-surface-secondary, rgba(0,0,0,0.02))",
                cursor: onRowClick ? "pointer" : "default",
              }}
              onMouseEnter={onRowClick ? (e) => { (e.currentTarget as HTMLElement).style.background = "var(--sre-surface-hover, rgba(0,0,0,0.05))"; } : undefined}
              onMouseLeave={onRowClick ? (e) => { (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "transparent" : "var(--sre-surface-secondary, rgba(0,0,0,0.02))"; } : undefined}
            >
              {cols.map((col) => (
                <td
                  key={col}
                  style={{
                    padding: "5px 10px",
                    color: "var(--sre-text-primary, #1f2328)",
                    borderBottom: "1px solid var(--sre-border, rgba(0,0,0,0.06))",
                    wordBreak: "break-word",
                    maxWidth: 260,
                  }}
                >
                  {formatValue(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!maxHeight && records.length > 50 && (
        <div style={{ fontSize: 11, color: "var(--sre-text-secondary)", padding: "6px 10px", fontStyle: "italic" }}>
          Showing 50 of {records.length} rows
        </div>
      )}
    </div>
  );
}

function ChartTooltip({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return ReactDOM.createPortal(
    <div
      style={{
        position: "fixed",
        left: x,
        top: y - 10,
        transform: "translate(-50%, -100%)",
        background: "#1f2328",
        color: "#fff",
        padding: "7px 11px",
        borderRadius: 6,
        fontSize: 11,
        lineHeight: 1.5,
        pointerEvents: "none",
        zIndex: 20000,
        boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>,
    document.body
  );
}

function SimpleBarChart({ records, accentColor }: { records: Record<string, unknown>[]; accentColor: string }) {
  const [hover, setHover] = React.useState<{ i: number; x: number; y: number } | null>(null);
  if (!records.length) return null;

  const cols = Object.keys(records[0]);
  // Find timestamp column
  const tsCol = cols.find((c) => c === "timestamp" || c.toLowerCase().startsWith("bin(") || c === "bin(timestamp, 1d)" || c === "bin(timestamp, 1h)");
  // Find first numeric column that isn't the timestamp
  const numCols = cols.filter((c) => {
    if (c === tsCol) return false;
    const val = records.find((r) => r[c] !== null && r[c] !== undefined)?.[c];
    return typeof val === "number" || (typeof val === "string" && !isNaN(Number(val)));
  });

  if (!numCols.length) return <DataTable records={records} />;

  const primaryCol = numCols[0];
  const secondaryCol = numCols[1]; // optional second series

  const values = records.map((r) => Number(r[primaryCol]) || 0);
  const secValues = secondaryCol ? records.map((r) => Number(r[secondaryCol]) || 0) : null;
  const maxVal = Math.max(...values, 1);
  const chartH = 140;
  const maxBarW = secValues ? 16 : 32;

  const maxIdx = values.indexOf(Math.max(...values));
  const minIdx = values.indexOf(Math.min(...values));

  return (
    <div>
      {/* Each bar sits in an equal-width flex column so the row always spans
          the full chart width regardless of bar count. The value label for
          the max/min bar floats directly above that bar's own top edge
          (not a fixed row), so it always sits on the slice it describes. */}
      <div style={{ paddingTop: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-end", width: "100%" }}>
          {records.map((row, i) => {
            const h = Math.max(2, Math.round((values[i] / maxVal) * chartH));
            const secH = secValues ? Math.max(0, Math.round((secValues[i] / maxVal) * chartH)) : 0;
            const showValueLabel = i === maxIdx || i === minIdx;
            const align: "left" | "center" | "right" = i === 0 ? "left" : i === records.length - 1 ? "right" : "center";
            return (
              <div
                key={i}
                onMouseEnter={(e) => setHover({ i, x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => setHover({ i, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHover(null)}
                style={{ position: "relative", flex: "1 1 0%", minWidth: 0, height: chartH }}
              >
                {showValueLabel && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: h + 4,
                      left: align === "left" ? 0 : align === "right" ? "auto" : "50%",
                      right: align === "right" ? 0 : "auto",
                      transform: align === "center" ? "translateX(-50%)" : undefined,
                      fontSize: 9,
                      color: "var(--sre-text-secondary)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {values[i].toLocaleString()}
                  </div>
                )}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 1, height: chartH }}>
                  <div
                    style={{
                      width: secValues ? "45%" : "70%",
                      maxWidth: maxBarW,
                      height: h,
                      background: accentColor,
                      borderRadius: "3px 3px 0 0",
                      opacity: 0.85,
                    }}
                  />
                  {secValues && (
                    <div
                      style={{
                        width: "45%",
                        maxWidth: maxBarW,
                        height: secH,
                        background: `${accentColor}70`,
                        borderRadius: "3px 3px 0 0",
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11, color: "var(--sre-text-secondary)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, background: accentColor, borderRadius: 2, display: "inline-block" }} />
          {primaryCol}
        </span>
        {secValues && secondaryCol && (
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, background: `${accentColor}70`, borderRadius: 2, display: "inline-block" }} />
            {secondaryCol}
          </span>
        )}
      </div>
      {hover && (
        <ChartTooltip x={hover.x} y={hover.y}>
          {tsCol && <div style={{ fontWeight: 700, marginBottom: 4 }}>{formatFullTimestamp(records[hover.i][tsCol])}</div>}
          <div>{primaryCol}: {values[hover.i].toLocaleString()}</div>
          {secValues && secondaryCol && <div>{secondaryCol}: {secValues[hover.i].toLocaleString()}</div>}
        </ChartTooltip>
      )}
    </div>
  );
}

// Renders several differently-scaled series (e.g. golden signals: traffic,
// errors, latency, saturation) as independent small charts in a grid, each
// auto-scaled to its own range — avoids the readability problem of forcing
// wildly different units onto one shared scale. Series are detected from
// any column with a matching entry in `meta` (keyed by column name).
function MiniBarChart({
  records,
  tsCol,
  valueCol,
  label,
  unit,
  color,
}: {
  records: Record<string, unknown>[];
  tsCol: string;
  valueCol: string;
  label: string;
  unit?: string;
  color: string;
}) {
  const [hover, setHover] = React.useState<{ i: number; x: number; y: number } | null>(null);
  const values = records.map((r) => Number(r[valueCol]) || 0);
  const maxVal = Math.max(...values, 1);
  const chartH = 70;
  const maxIdx = values.indexOf(Math.max(...values));
  const minIdx = values.indexOf(Math.min(...values));

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--sre-text-secondary)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ paddingTop: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-end", width: "100%" }}>
          {records.map((row, i) => {
            const h = Math.max(1, Math.round((values[i] / maxVal) * chartH));
            const showValueLabel = i === maxIdx || i === minIdx;
            const align: "left" | "center" | "right" = i === 0 ? "left" : i === records.length - 1 ? "right" : "center";
            return (
              <div
                key={i}
                onMouseEnter={(e) => setHover({ i, x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => setHover({ i, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHover(null)}
                style={{ position: "relative", flex: "1 1 0%", minWidth: 0, height: chartH }}
              >
                {showValueLabel && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: h + 3,
                      left: align === "left" ? 0 : align === "right" ? "auto" : "50%",
                      right: align === "right" ? 0 : "auto",
                      transform: align === "center" ? "translateX(-50%)" : undefined,
                      fontSize: 8.5,
                      color: "var(--sre-text-secondary)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {values[i].toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                )}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "center", height: chartH }}>
                  <div
                    style={{
                      width: "60%", maxWidth: 14, height: h, alignSelf: "flex-end",
                      background: color, borderRadius: "2px 2px 0 0", opacity: 0.85,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {hover && (
        <ChartTooltip x={hover.x} y={hover.y}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>{formatFullTimestamp(records[hover.i][tsCol])}</div>
          <div>{label}: {values[hover.i].toLocaleString(undefined, { maximumFractionDigits: 4 })}{unit ?? ""}</div>
        </ChartTooltip>
      )}
    </div>
  );
}

function MultiPanelChart({
  records,
  meta,
}: {
  records: Record<string, unknown>[];
  meta: Record<string, { label: string; unit?: string }>;
}) {
  if (!records.length) return null;

  const cols = Object.keys(records[0]);
  const tsCol = cols.find((c) => c === "timestamp");
  const seriesCols = cols.filter((c) => c !== tsCol && meta[c]);
  if (!tsCol || !seriesCols.length) return <DataTable records={records} />;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 20px" }}>
      {seriesCols.map((col, i) => (
        <MiniBarChart
          key={col}
          records={records}
          tsCol={tsCol}
          valueCol={col}
          label={meta[col].label}
          unit={meta[col].unit}
          color={FALLBACK_PALETTE[i % FALLBACK_PALETTE.length]}
        />
      ))}
    </div>
  );
}

// Shared category colors/ordering for any stacked-bar breakdown (log
// severity, host monitoring mode, trace outcome, etc). Dominant/expected
// categories are ordered first (rendered at the bottom of the stack);
// rare/concerning categories are ordered last (rendered on top, so they
// stay visible even when tiny relative to the dominant category).
const CATEGORY_COLORS: Record<string, string> = {
  FULL_STACK: "#1966FF",
  SUCCESS: "#1966FF",
  TRACE: "#c7cad1",
  DEBUG: "#8a94a6",
  INFO: "#1966FF",
  INFRASTRUCTURE: "#8a94a6",
  CLOUD_INFRASTRUCTURE: "#8a94a6",
  NONE: "#c7cad1",
  UNKNOWN: "#c7cad1",
  WARN: "#9a6700",
  FAILED: "#cf222e",
  ERROR: "#cf222e",
};
const CATEGORY_STACK_ORDER = [
  "FULL_STACK",
  "SUCCESS",
  "TRACE",
  "DEBUG",
  "INFO",
  "INFRASTRUCTURE",
  "CLOUD_INFRASTRUCTURE",
  "NONE",
  "UNKNOWN",
  "WARN",
  "FAILED",
  "ERROR",
];

function statusRank(status: string): number {
  const idx = CATEGORY_STACK_ORDER.indexOf(status);
  return idx === -1 ? CATEGORY_STACK_ORDER.indexOf("UNKNOWN") : idx;
}

// Used when stacking by an open-ended category (e.g. K8s namespace) that
// isn't one of the known enums above — each distinct value gets its own
// color from this palette instead of all collapsing to the accent color.
const FALLBACK_PALETTE = ["#1966FF", "#8D1CDC", "#49C2B3", "#F5A623", "#E8618C", "#00A3BF", "#7C4DFF", "#FF7043"];

function colorForStatus(status: string, accentColor: string, fallbackIndex?: number): string {
  if (CATEGORY_COLORS[status]) return CATEGORY_COLORS[status];
  if (fallbackIndex !== undefined) return FALLBACK_PALETTE[fallbackIndex % FALLBACK_PALETTE.length];
  return accentColor;
}

interface StackedBucket {
  ms: number;
  tsRaw: unknown;
  total: number;
  byStatus: Record<string, number>;
}

function StackedBarChart({ records, accentColor }: { records: Record<string, unknown>[]; accentColor: string }) {
  const [hover, setHover] = React.useState<{ i: number; x: number; y: number } | null>(null);
  if (!records.length) return null;

  const cols = Object.keys(records[0]);
  const tsCol = cols.find((c) => c === "timestamp" || c.toLowerCase().startsWith("bin("));
  const statusCol = cols.find((c) => c !== tsCol && typeof records[0][c] === "string");
  const countCol = cols.find((c) => c !== tsCol && c !== statusCol);

  if (!tsCol || !statusCol || !countCol) return <DataTable records={records} />;

  const bucketMap = new Map<number, StackedBucket>();
  for (const r of records) {
    const ms = parseTimestamp(r[tsCol]);
    if (isNaN(ms)) continue;
    const status = String(r[statusCol] ?? "UNKNOWN").toUpperCase();
    const count = Number(r[countCol]) || 0;
    let bucket = bucketMap.get(ms);
    if (!bucket) {
      bucket = { ms, tsRaw: r[tsCol], total: 0, byStatus: {} };
      bucketMap.set(ms, bucket);
    }
    bucket.byStatus[status] = (bucket.byStatus[status] ?? 0) + count;
    bucket.total += count;
  }
  const buckets = Array.from(bucketMap.values()).sort((a, b) => a.ms - b.ms);
  if (!buckets.length) return <DataTable records={records} />;

  const allStatuses = Array.from(new Set(buckets.flatMap((b) => Object.keys(b.byStatus)))).sort(
    (a, b) => statusRank(a) - statusRank(b)
  );

  const totals = buckets.map((b) => b.total);
  const maxTotal = Math.max(...totals, 1);
  const maxIdx = totals.indexOf(Math.max(...totals));
  const minIdx = totals.indexOf(Math.min(...totals));
  const chartH = 140;
  const maxBarW = 32;

  return (
    <div>
      {/* Each bar sits in an equal-width flex column so the row always spans
          the full chart width regardless of bucket count. The total-value
          label for the max/min bar floats directly above that bar's own
          top edge (not a fixed row), so it always sits on the slice it
          describes. */}
      <div style={{ paddingTop: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-end", width: "100%" }}>
          {buckets.map((b, i) => {
            const totalH = Math.max(2, Math.round((b.total / maxTotal) * chartH));
            const showValueLabel = i === maxIdx || i === minIdx;
            const align: "left" | "center" | "right" = i === 0 ? "left" : i === buckets.length - 1 ? "right" : "center";
            return (
              <div
                key={i}
                onMouseEnter={(e) => setHover({ i, x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => setHover({ i, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHover(null)}
                style={{ position: "relative", flex: "1 1 0%", minWidth: 0, height: chartH }}
              >
                {showValueLabel && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: totalH + 4,
                      left: align === "left" ? 0 : align === "right" ? "auto" : "50%",
                      right: align === "right" ? 0 : "auto",
                      transform: align === "center" ? "translateX(-50%)" : undefined,
                      fontSize: 9,
                      color: "var(--sre-text-secondary)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {b.total.toLocaleString()}
                  </div>
                )}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "center", height: chartH }}>
                  <div style={{ display: "flex", flexDirection: "column-reverse", width: "70%", maxWidth: maxBarW, height: chartH, borderRadius: "3px 3px 0 0", overflow: "hidden" }}>
                    {allStatuses.map((status, statusIdx) => {
                      const count = b.byStatus[status] ?? 0;
                      if (!count) return null;
                      const segH = Math.max(0, Math.round((count / maxTotal) * chartH));
                      return <div key={status} style={{ width: "100%", height: segH, background: colorForStatus(status, accentColor, statusIdx), opacity: 0.9 }} />;
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11, color: "var(--sre-text-secondary)", flexWrap: "wrap" }}>
        {allStatuses.map((status, statusIdx) => (
          <span key={status} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, background: colorForStatus(status, accentColor, statusIdx), borderRadius: 2, display: "inline-block" }} />
            {status}
          </span>
        ))}
      </div>
      {hover && (
        <ChartTooltip x={hover.x} y={hover.y}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{formatFullTimestamp(buckets[hover.i].tsRaw)}</div>
          <div style={{ marginBottom: 3 }}>Total: {buckets[hover.i].total.toLocaleString()}</div>
          {allStatuses
            .filter((s) => (buckets[hover.i].byStatus[s] ?? 0) > 0)
            .map((s) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, background: colorForStatus(s, accentColor, allStatuses.indexOf(s)), borderRadius: 2, display: "inline-block", flexShrink: 0 }} />
                <span>{s}: {(buckets[hover.i].byStatus[s] ?? 0).toLocaleString()}</span>
              </div>
            ))}
        </ChartTooltip>
      )}
    </div>
  );
}

// Part-to-whole breakdown: one row per segment, first string column is the
// label and first numeric column is the value. Used where the story is
// composition rather than trend — problem classification, root-cause coverage,
// noise by category, notification channel. Segments reuse colorForStatus so a
// bucket named ERROR/SUCCESS/WARN keeps the same colour it has in the bar
// charts, and anything else falls back to the shared palette.
function DonutChart({
  records,
  accentColor,
  centerLabel,
}: {
  records: Record<string, unknown>[];
  accentColor: string;
  centerLabel?: string;
}) {
  const [hover, setHover] = React.useState<{ i: number; x: number; y: number } | null>(null);
  if (!records.length) return null;

  const cols = Object.keys(records[0]);
  const labelCol = cols.find((c) => typeof records[0][c] === "string");
  const valueCol = cols.find((c) => c !== labelCol && !isNaN(Number(records[0][c])));
  if (!labelCol || !valueCol) return <DataTable records={records} />;

  const segments = records
    .map((r, i) => ({
      label: String(r[labelCol] ?? "Unknown"),
      value: Number(r[valueCol]) || 0,
      color: colorForStatus(String(r[labelCol] ?? "").toUpperCase(), accentColor, i),
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = segments.reduce((s, x) => s + x.value, 0);
  if (!total) return <DataTable records={records} />;

  const size = 168;
  const sw = 26;
  const r = (size - sw) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const TAU = Math.PI * 2;
  const START = -Math.PI / 2; // 12 o'clock

  // Segments are drawn as explicit arc paths rather than dash-offset circles.
  // The dash approach produced a visible seam at 12 o'clock for two reasons:
  // strokeDasharray "<arc> <circ-arc>" has a pattern length of exactly one
  // circumference, so any float error makes the pattern wrap and repaint a
  // sliver of the first segment; and accumulating fractions drifts (6/12 +
  // 4/12 + 2/12 sums to 0.9999999999999999), leaving the final segment a hair
  // short so the grey track shows through. Accumulating the raw integer values
  // instead means the last angle is exactly START + TAU, with no drift.
  let acc = 0;
  const arcs = segments.map((s) => {
    const a0 = START + (acc / total) * TAU;
    acc += s.value;
    const a1 = START + (acc / total) * TAU;
    return { ...s, a0, a1, pct: (s.value / total) * 100 };
  });

  // Butt-capped arcs that meet at an exact shared angle can still show a
  // hairline of background between them from antialiasing. Extending each
  // segment's end by roughly one pixel of arc closes that: painting order
  // means the next segment covers the overrun, and the final segment's
  // overrun lands under the first segment's start point.
  const seam = Math.min(1 / r, TAU / 720);

  const describeArc = (a0: number, a1: number) => {
    const end = a1 + seam;
    const largeArc = end - a0 > Math.PI ? 1 : 0;
    return [
      "M", cx + r * Math.cos(a0), cy + r * Math.sin(a0),
      "A", r, r, 0, largeArc, 1, cx + r * Math.cos(end), cy + r * Math.sin(end),
    ].join(" ");
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap", paddingTop: 8 }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(128,128,128,0.10)" strokeWidth={sw} />
          {arcs.length === 1 ? (
            // A single 100% segment has identical start and end angles, which
            // would collapse an arc path to nothing — draw the full ring.
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={arcs[0].color}
              strokeWidth={hover?.i === 0 ? sw + 5 : sw}
              style={{ transition: "stroke-width 0.15s ease" }}
              onMouseEnter={(e) => setHover({ i: 0, x: e.clientX, y: e.clientY })}
              onMouseMove={(e) => setHover({ i: 0, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHover(null)}
            />
          ) : (
            arcs.map((a, i) => (
              <path
                key={i}
                d={describeArc(a.a0, a.a1)}
                fill="none"
                stroke={a.color}
                strokeWidth={hover?.i === i ? sw + 5 : sw}
                style={{ transition: "stroke-width 0.15s ease", cursor: "default" }}
                onMouseEnter={(e) => setHover({ i, x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => setHover({ i, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHover(null)}
              />
            ))
          )}
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <span style={{ fontSize: 26, fontWeight: 800, color: "var(--sre-text-primary, #1f2328)", lineHeight: 1.1 }}>
            {total.toLocaleString()}
          </span>
          {centerLabel && (
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--sre-text-secondary, #6F747F)", letterSpacing: 0.4 }}>
              {centerLabel}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 200, flex: 1 }}>
        {arcs.map((a, i) => (
          <div
            key={i}
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: hover === null || hover.i === i ? 1 : 0.5 }}
            onMouseEnter={(e) => setHover({ i, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setHover(null)}
          >
            <span style={{ width: 11, height: 11, borderRadius: 3, background: a.color, flexShrink: 0 }} />
            <span style={{ flex: 1, color: "var(--sre-text-primary, #1f2328)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {a.label}
            </span>
            <span style={{ fontWeight: 700, color: "var(--sre-text-primary, #1f2328)" }}>{a.value.toLocaleString()}</span>
            <span style={{ width: 42, textAlign: "right", color: "var(--sre-text-secondary, #6F747F)", fontWeight: 600 }}>
              {a.pct >= 1 ? Math.round(a.pct) : a.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      {hover && arcs[hover.i] && (
        <ChartTooltip x={hover.x} y={hover.y}>
          <div style={{ fontWeight: 700 }}>{arcs[hover.i].label}</div>
          <div>
            {arcs[hover.i].value.toLocaleString()} · {Math.round(arcs[hover.i].pct)}% of {total.toLocaleString()}
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}

function parseTimestamp(val: unknown): number {
  if (val === null || val === undefined) return NaN;
  if (typeof val === "number") return val > 1_000_000_000_000 ? val : NaN;
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const ms = new Date(s).getTime();
    return isNaN(ms) ? NaN : ms;
  }
  return NaN;
}

function formatFullTimestamp(val: unknown): string {
  const ms = parseTimestamp(val);
  if (isNaN(ms)) return val === null || val === undefined ? "" : String(val);
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DataPanel({
  config,
  appCI,
  accentColor,
  scrollable,
  facet,
}: {
  config: CheckDetailConfig | undefined;
  appCI: string;
  accentColor: string;
  scrollable?: boolean;
  facet?: string;
}) {
  // The facet is injected into the query rather than filtered client-side:
  // aggregated columns (success rate, average lead time) cannot be correctly
  // re-derived from an already-summarised result set.
  const query = config?.detailQuery ? config.detailQuery(appCI, facet) : `data record(none = true)`;
  const dqlResult = useDqlWithCache({ query });

  const appFn = config?.appFunction;
  const fnResult = useAppFunction<unknown>(
    { name: appFn?.name ?? "__unused__", data: { appCI } },
    { autoFetch: !!appFn, autoFetchOnUpdate: true }
  );

  const isLoading = appFn ? fnResult.isLoading : dqlResult.isLoading;
  const error = appFn ? fnResult.error : dqlResult.error;
  const data = appFn
    ? fnResult.data !== undefined
      ? { records: appFn.toRecords(fnResult.data) }
      : undefined
    : dqlResult.data;

  const onRowClick = config?.serviceRowClick
    ? (row: Record<string, unknown>) => {
        const entityId = String(row.entityId ?? "");
        if (!entityId) return;
        const envUrl = getEnvironmentUrl().replace(/\/$/, "");
        const payload = {
          "dt.filter": `dt.entity.service = ${entityId}`,
          "dt.timeframe": { from: "now()-2h", to: "now()" },
        };
        const url = `${envUrl}/ui/intent/dynatrace.distributedtracing/view-traces#${encodeURIComponent(JSON.stringify(payload))}`;
        window.open(url, "_blank");
      }
    : config?.logHostRowClick
      ? (row: Record<string, unknown>) => {
          const host = String(row.host ?? "");
          if (!host) return;
          const envUrl = getEnvironmentUrl().replace(/\/$/, "");
          const payload = {
            version: 2,
            "dt.timeframe": { from: "now()-1h", to: "now()" },
            tableConfig: {
              columns: ["timestamp", "status", "Log message"],
              columnAttributes: { columnWidths: { "Log message": 1159.98 } },
            },
            analysisMode: "logs",
            showDqlEditor: false,
            filterFieldQuery: `host.name = *"${host}"* `,
            facetsCollapse: true,
          };
          const url = `${envUrl}/ui/apps/dynatrace.logs/#${encodeURIComponent(JSON.stringify(payload))}`;
          window.open(url, "_blank");
        }
      : config?.hostEntityRowClick
        ? (row: Record<string, unknown>) => {
            const entityId = String(row.entityId ?? "");
            if (!entityId) return;
            const envUrl = getEnvironmentUrl().replace(/\/$/, "");
            const params = new URLSearchParams({
              perspective: "Health",
              sort: "healthIndicators:descending",
              sidebarOpen: "false",
              fullPageId: entityId,
            });
            const url = `${envUrl}/ui/apps/dynatrace.infraops/smartscape/Compute/Hosts?${params.toString()}`;
            window.open(url, "_blank");
          }
        : config?.serviceMapRowClick
          ? (row: Record<string, unknown>) => {
              const entityId = String(row.entityId ?? "");
              if (!entityId) return;
              const envUrl = getEnvironmentUrl().replace(/\/$/, "");
              const params = new URLSearchParams({
                perspective: "performance",
                sort: "healthIndicators:descending",
                detailsId: entityId,
                sidebarOpen: "false",
                detailsTab: "map",
              });
              const url = `${envUrl}/ui/apps/dynatrace.services/explorer-new/services?${params.toString()}`;
              window.open(url, "_blank");
            }
          : config?.k8sClusterRowClick
            ? (row: Record<string, unknown>) => {
                const clusterName = String(row.clusterName ?? "");
                if (!clusterName) return;
                const envUrl = getEnvironmentUrl().replace(/\/$/, "");
                const qs = new URLSearchParams({
                  tf: "now-2h;now",
                  perspective: "performance",
                  sort: "healthIndicators:descending",
                });
                const hash = new URLSearchParams({
                  filtering: `k8s.cluster.name = "${clusterName}"`,
                  segments: "[]",
                });
                const url = `${envUrl}/ui/apps/dynatrace.services/explorer/services?${qs.toString()}#${hash.toString()}`;
                window.open(url, "_blank");
              }
            : config?.cloudResourceRowClick
              ? (row: Record<string, unknown>) => {
                  const entityId = String(row.entityId ?? "");
                  if (!entityId) return;
                  const envUrl = getEnvironmentUrl().replace(/\/$/, "");
                  const qs = new URLSearchParams({
                    perspective: "health",
                    sidebarOpen: "true",
                    detailsId: entityId,
                    // Cloud inventory resources (EBS volumes, SSM parameters, etc.) are
                    // re-polled far less often than compute; a narrow default timeframe
                    // can make a correctly-filtered resource look like "no results" just
                    // because it wasn't rescanned within that window.
                    tf: "now-24h;now",
                  });
                  const hash = new URLSearchParams({
                    filtering: `tags = "ApplicationCI:${appCI.toLowerCase()}" `,
                  });
                  const url = `${envUrl}/ui/apps/dynatrace.clouds/smartscape/services?${qs.toString()}#${hash.toString()}`;
                  window.open(url, "_blank");
                }
              : config?.dashboardRowClick
                ? (row: Record<string, unknown>) => {
                    const dashboardId = String(row.dashboardId ?? "");
                    if (!dashboardId) return;
                    const envUrl = getEnvironmentUrl().replace(/\/$/, "");
                    const url = `${envUrl}/ui/apps/dynatrace.dashboards/dashboard/${dashboardId}`;
                    window.open(url, "_blank");
                  }
                : config?.guardianRowClick
                  ? (row: Record<string, unknown>) => {
                      const guardianId = String(row.guardianId ?? "");
                      if (!guardianId) return;
                      const envUrl = getEnvironmentUrl().replace(/\/$/, "");
                      const payload = { "guardian.id": guardianId };
                      const url = `${envUrl}/ui/intent/dynatrace.site.reliability.guardian/view_validation#${encodeURIComponent(JSON.stringify(payload))}`;
                      window.open(url, "_blank");
                    }
                  : config?.urlRowClick
                    ? (row: Record<string, unknown>) => {
                        // Generic external drilldown: the query supplies an absolute
                        // `url` column (a CI pipeline run, a repo, a notebook). One
                        // mechanism instead of a flag per destination. Only http(s)
                        // is followed, so a malformed field can't become a
                        // javascript: navigation.
                        const url = String(row.url ?? "");
                        if (!/^https?:\/\//i.test(url)) return;
                        window.open(url, "_blank", "noopener,noreferrer");
                      }
                    : config?.workflowRowClick
                    ? (row: Record<string, unknown>) => {
                        const workflowId = String(row.workflowId ?? "");
                        if (!workflowId) return;
                        const envUrl = getEnvironmentUrl().replace(/\/$/, "");
                        const url = `${envUrl}/ui/apps/dynatrace.automations/workflows/${encodeURIComponent(workflowId)}`;
                        window.open(url, "_blank");
                      }
                    : config?.problemRowClick
                    ? (row: Record<string, unknown>) => {
                        // Problems app takes the internal event.id UUID, NOT the
                        // display_id (P-XXXX) — display_id renders a blank page.
                        const problemId = String(row.problemId ?? "");
                        if (!problemId) return;
                        const envUrl = getEnvironmentUrl().replace(/\/$/, "");
                        const url = `${envUrl}/ui/apps/dynatrace.davis.problems/problem/${encodeURIComponent(problemId)}`;
                        window.open(url, "_blank");
                      }
                    : config?.sloRowClick
                      ? () => {
                          // The native SLO settings table has no deep-linkable per-row
                          // URL — row names are plain <span>s (verified via DOM
                          // inspection), and clicking fires an internal JS handler with
                          // no navigation. The schema list page is the only real,
                          // working destination.
                          const envUrl = getEnvironmentUrl().replace(/\/$/, "");
                          const payload = { "settings.schemaId": "dynatrace.service.level.objectives" };
                          const url = `${envUrl}/ui/intent/dynatrace.settings/open_settings_for_schema#${encodeURIComponent(JSON.stringify(payload))}`;
                          window.open(url, "_blank");
                        }
                      : undefined;

  if (config?.chartType === "none") {
    return (
      <div
        style={{
          padding: 16,
          borderRadius: 8,
          background: "rgba(128,128,128,0.06)",
          border: "1px solid rgba(128,128,128,0.2)",
          fontSize: 13,
          color: "var(--sre-text-secondary, #6F747F)",
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--sre-text-primary)" }}>
          Not yet configured
        </div>
        {config.guidance}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 20 }}>
        <ProgressCircle size="small" />
        <span style={{ fontSize: 12, color: "var(--sre-text-secondary)" }}>Loading data…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          fontSize: 12,
          color: "#cf222e",
          padding: 12,
          background: "rgba(220,53,69,0.06)",
          borderRadius: 6,
          border: "1px solid rgba(220,53,69,0.2)",
          lineHeight: 1.5,
        }}
      >
        {error.message}
      </div>
    );
  }

  const records = (data?.records ?? []) as Record<string, unknown>[];

  if (!records.length) {
    return (
      <div
        style={{
          fontSize: 13,
          color: "var(--sre-text-secondary)",
          padding: 16,
          fontStyle: "italic",
          borderRadius: 8,
          background: "rgba(128,128,128,0.04)",
          border: "1px solid rgba(128,128,128,0.12)",
        }}
      >
        No data found for <strong>{appCI}</strong>.
      </div>
    );
  }

  if (config?.chartType === "bar") {
    return <SimpleBarChart records={records} accentColor={accentColor} />;
  }

  return (
    <DataTable
      records={records}
      maxHeight={scrollable ? TABLE_HEIGHT : undefined}
      onRowClick={onRowClick}
      hiddenCols={
        config?.serviceRowClick || config?.hostEntityRowClick || config?.serviceMapRowClick || config?.cloudResourceRowClick
          ? ["entityId"]
          : config?.k8sClusterRowClick
            ? ["clusterName"]
            : config?.dashboardRowClick
              ? ["dashboardId"]
              : config?.guardianRowClick
                ? ["guardianId"]
                : config?.urlRowClick
                  ? ["url"]
                  : config?.workflowRowClick
                    ? ["workflowId"]
                    : config?.problemRowClick
                      ? ["problemId"]
                      : config?.sloRowClick
                        ? ["sloId"]
                        : []
      }
    />
  );
}

const WORD_CLOUD_PALETTE = [
  "#1966FF", "#8D1CDC", "#49C2B3", "#F5A623", "#E8618C",
  "#00A3BF", "#7C4DFF", "#FF7043", "#3BACF0", "#9C6ADE",
  "#2BB673", "#D6534A",
];

// Short, recognizable labels for the word cloud only — the actual tables
// keep the full AWS type string for precision. Falls back to a generic
// AWS_ prefix strip + title-case for any type not explicitly listed here.
const RESOURCE_TYPE_SHORT_NAMES: Record<string, string> = {
  AWS_EC2_INSTANCE: "EC2-Instance",
  AWS_EC2_SNAPSHOT: "EC2-Snapshot",
  AWS_EC2_VOLUME: "EC2-Volume",
  AWS_EC2_SECURITYGROUP: "Security Group",
  AWS_EC2_NETWORKINTERFACEATTACHMENT: "ENI Attachment",
  AWS_ELASTICLOADBALANCINGV2_TARGETGROUP: "ELB-V2 Target Group",
  AWS_ELASTICLOADBALANCINGV2_LISTENERRULE: "ELB-V2 Rule",
  AWS_ELASTICLOADBALANCINGV2_LISTENER: "ELB-V2 Listener",
  AWS_ELASTICLOADBALANCINGV2_LOADBALANCER: "ELB-V2",
  AWS_SSM_PARAMETER: "SSM Parameter",
  AWS_CERTIFICATEMANAGER_CERTIFICATE: "ACM Cert",
  AWS_ELASTICACHE_CACHECLUSTER: "ElastiCache",
  AWS_ELASTICACHE_USERGROUP: "ElastiCache UserGroup",
  AWS_CLOUDFORMATION_STACK: "CFN Stack",
  AWS_BACKUP_BACKUPPLAN: "Backup Plan",
  AWS_S3_BUCKET: "S3 Bucket",
  AWS_GLUE_JOB: "Glue Job",
  AWS_LAMBDA_FUNCTION: "Lambda",
  AWS_RDS_DBINSTANCE: "RDS Instance",
};

function shortenResourceType(type: string): string {
  if (RESOURCE_TYPE_SHORT_NAMES[type]) return RESOURCE_TYPE_SHORT_NAMES[type];
  const providerPrefix = /^(AWS|AZURE|GCP)_/.exec(type);
  if (!providerPrefix) return type;
  return type
    .slice(providerPrefix[0].length)
    .split("_")
    .map((w) => (w.length ? w[0] + w.slice(1).toLowerCase() : w))
    .join(" ");
}

// AWS services officially branded "Amazon X" rather than "AWS X" in AWS's own
// public naming convention, keyed by the CloudFormation namespace's service
// segment (e.g. "EC2" in "AWS::EC2::Instance"). This ONLY decides the display
// prefix word — everything else in the name is derived mechanically from the
// literal aws.resource.type string (see friendlyAwsResourceType below), not
// from a hand-picked marketing name. A hand-picked-name approach was tried
// first and proven wrong: Dynatrace's Clouds app `type =` facet uses the
// literal CloudFormation segment ("AWS SSM Parameter", not "AWS Systems
// Manager Parameter" — confirmed against a live Clouds-app filter that
// returned real results only once the literal segment was used).
const AMAZON_BRANDED_SERVICES = new Set([
  "EC2", "S3", "RDS", "DynamoDB", "ElastiCache", "Elasticache", "EKS", "ECS",
  "ECR", "EFS", "FSx", "SNS", "SQS", "KMS", "VPC", "Route53", "Kinesis",
  "KinesisFirehose", "KinesisAnalyticsV2", "MSK", "Redshift",
  "RedshiftServerless", "Cognito", "SageMaker", "OpenSearchService",
  "OpenSearchServerless", "MWAA", "Athena", "AmazonMQ", "Connect", "EMR",
  "DAX", "GuardDuty", "Bedrock", "QLDB", "WorkSpaces",
]);

// A few short brand abbreviations that naive CamelCase-boundary splitting
// mangles (e.g. "FSx" -> "F Sx") — kept literal instead.
const CAMEL_SPLIT_EXCEPTIONS: Record<string, string> = { FSx: "FSx" };

// Inserts spaces at CamelCase word boundaries in a literal CloudFormation
// segment (e.g. "TargetGroup" -> "Target Group", "DHCPOptions" -> "DHCP
// Options") without renaming or expanding the segment to a different word.
function splitCamel(segment: string): string {
  if (CAMEL_SPLIT_EXCEPTIONS[segment]) return CAMEL_SPLIT_EXCEPTIONS[segment];
  return segment
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

// Derives the Clouds app's `type =` facet value directly from the literal AWS
// CloudFormation resource type (e.g. "AWS::SSM::Parameter" -> "AWS SSM
// Parameter"), since that's what the facet is actually built from.
function friendlyAwsResourceType(resourceType: string): string {
  const parts = resourceType.split("::");
  if (parts.length < 2) return resourceType;
  const service = parts[1];
  const resource = parts.slice(2).map(splitCamel).join(" ");
  const splitService = splitCamel(service);
  // Some service segments already embed "Amazon" (e.g. "AmazonMQ" -> "Amazon
  // MQ") — don't also prepend a prefix, or it doubles up ("Amazon Amazon MQ").
  if (/^(Amazon|AWS)\b/.test(splitService)) {
    return [splitService, resource].filter(Boolean).join(" ");
  }
  const prefix = AMAZON_BRANDED_SERVICES.has(service) ? "Amazon" : "AWS";
  return [prefix, splitService, resource].filter(Boolean).join(" ");
}

// `resourceType` (aws.resource.type) is only populated for AWS rows today —
// Azure/GCP have no live data yet to confirm their equivalent facet
// vocabulary, so those fall back to the same shortened label used for display.
function friendlyResourceType(type: string, resourceType?: string): string {
  if (resourceType) return friendlyAwsResourceType(resourceType);
  return shortenResourceType(type);
}

function buildCloudTypeFilterUrl(appCI: string, rawType: string, resourceType?: string): string {
  const envUrl = getEnvironmentUrl().replace(/\/$/, "");
  // Wide-ish window so infrequently-repolled resource types (SSM parameters, EBS
  // volumes, etc.) aren't missing just because they fell outside whatever
  // timeframe the Clouds app last had active — see cloudResourceRowClick above.
  const qs = new URLSearchParams({ perspective: "health", tf: "now-24h;now" });
  const hash = new URLSearchParams({
    filtering: `tags = "ApplicationCI:${appCI.toLowerCase()}" type = "${friendlyResourceType(rawType, resourceType)}" `,
  });
  return `${envUrl}/ui/apps/dynatrace.clouds/smartscape/services?${qs.toString()}#${hash.toString()}`;
}

// Classic "tag cloud" spiral packing: biggest word first, placed at the
// center, then each subsequent word searches outward along an elliptical
// spiral until it finds a spot that doesn't overlap an already-placed word.
// This is what makes the cloud look organically nested (like a Wordle
// render) instead of the plain sorted grid a flex-wrap layout produces.
function packWordCloud<T extends { label: string; fontSize: number }>(
  items: T[],
  width: number,
  height: number
): (T & { x: number; y: number; w: number; h: number })[] {
  if (!items.length || width <= 0 || height <= 0) {
    return items.map((it) => ({ ...it, x: 0, y: 0, w: 0, h: 0 }));
  }
  const ctx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  const placedRects: { x: number; y: number; w: number; h: number }[] = [];
  const cx = width / 2;
  const cy = height / 2;
  const pad = 3;
  // Flatten the spiral vertically to roughly match the container's aspect
  // ratio, so the cloud fills a wide panel instead of drifting off the
  // top/bottom edge first.
  const squash = Math.max(0.4, Math.min(1, height / width));

  return items.map((it) => {
    let textWidth: number;
    if (ctx) {
      ctx.font = `700 ${it.fontSize}px "Segoe UI", Roboto, sans-serif`;
      textWidth = ctx.measureText(it.label).width;
    } else {
      textWidth = it.label.length * it.fontSize * 0.58;
    }
    const w = textWidth + pad * 2;
    const h = it.fontSize * 1.25 + pad * 2;

    let x = cx - w / 2;
    let y = cy - h / 2;
    let angle = 0;
    let radius = 0;
    let found = false;

    for (let attempt = 0; attempt < 3000; attempt++) {
      const testX = cx - w / 2 + radius * Math.cos(angle);
      const testY = cy - h / 2 + radius * Math.sin(angle) * squash;
      const overlaps = placedRects.some(
        (p) => testX < p.x + p.w && testX + w > p.x && testY < p.y + p.h && testY + h > p.y
      );
      if (!overlaps) {
        x = testX;
        y = testY;
        found = true;
        break;
      }
      angle += 0.32;
      radius += 2.2;
    }
    if (!found) {
      x = cx - w / 2;
      y = cy - h / 2;
    }

    placedRects.push({ x, y, w, h });
    return { ...it, x, y, w, h };
  });
}

function WordCloud({ records, appCI }: { records: Record<string, unknown>[]; appCI?: string }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(620);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cols = records.length ? Object.keys(records[0]) : [];
  const numCols = cols.filter((c) => {
    const val = records.find((r) => r[c] !== null && r[c] !== undefined)?.[c];
    return typeof val === "number" || (typeof val === "string" && !isNaN(Number(val)));
  });
  const countCol = numCols[0];
  const labelCol = cols.find((c) => c !== countCol && !numCols.includes(c)) ?? cols.find((c) => c !== countCol);

  const items = React.useMemo(() => {
    if (!countCol || !labelCol) return [];
    return records
      .map((r) => {
        const rawType = String(r[labelCol] ?? "");
        const resourceType = r.resourceType != null ? String(r.resourceType) : undefined;
        return { rawType, resourceType, label: shortenResourceType(rawType), count: Number(r[countCol]) || 0 };
      })
      .filter((it) => it.label && it.count > 0)
      .sort((a, b) => b.count - a.count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, countCol, labelCol]);

  const total = items.reduce((sum, it) => sum + it.count, 0);
  const maxCount = items[0]?.count ?? 1;
  const minFont = 4;
  const maxFont = 64;

  const sized = items.map((it, i) => {
    // Log scale (not sqrt) so rare types don't look nearly as big as
    // common ones, then raise to a power >1 to push the low end further
    // toward the 4px floor — plain log scale still put a count of 1 at
    // ~13px here, not the near-illegible size the user wanted for
    // singletons vs. the 20-30+ range.
    const logScale = Math.log(it.count + 1) / Math.log(maxCount + 1);
    const scale = Math.pow(logScale, 1.5);
    const fontSize = Math.round(minFont + scale * (maxFont - minFont));
    return { ...it, fontSize, color: WORD_CLOUD_PALETTE[i % WORD_CLOUD_PALETTE.length] };
  });

  const height = Math.min(420, Math.max(240, 200 + sized.length * 7));
  const packKey = sized.map((s) => `${s.rawType}:${s.fontSize}`).join(",");
  const placed = React.useMemo(
    () => packWordCloud(sized, width, height),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [packKey, width, height]
  );

  if (!items.length) return null;

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height, margin: "8px 0", overflow: "hidden" }}>
      {placed.map((it) => {
        const pct = ((it.count / total) * 100).toFixed(1);
        const clickable = !!appCI;
        return (
          <span
            key={it.rawType}
            title={`${it.label}: ${it.count.toLocaleString()} (${pct}%)${clickable ? " — click to open in Clouds app" : ""}`}
            onClick={clickable ? () => window.open(buildCloudTypeFilterUrl(appCI!, it.rawType, it.resourceType), "_blank") : undefined}
            onMouseEnter={clickable ? (e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.textDecoration = "underline";
              el.style.background = "rgba(0,0,0,0.06)";
            } : undefined}
            onMouseLeave={clickable ? (e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.textDecoration = "none";
              el.style.background = "transparent";
            } : undefined}
            style={{
              position: "absolute",
              left: it.x,
              top: it.y,
              fontSize: it.fontSize,
              fontWeight: 700,
              color: it.color,
              lineHeight: 1.25,
              whiteSpace: "nowrap",
              cursor: clickable ? "pointer" : "default",
              padding: clickable ? "2px 3px" : undefined,
              borderRadius: clickable ? 4 : undefined,
            }}
          >
            {it.label}
          </span>
        );
      })}
    </div>
  );
}

function WordCloudPanel({ query, appCI }: { query: string; appCI?: string }) {
  const { data, isLoading, error } = useDqlWithCache({ query });
  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
        <ProgressCircle size="small" />
        <span style={{ fontSize: 11, color: "var(--sre-text-secondary)" }}>Loading…</span>
      </div>
    );
  }
  if (error) return null;
  const records = (data?.records ?? []) as Record<string, unknown>[];
  if (!records.length) return null;
  return <WordCloud records={records} appCI={appCI} />;
}

function SecondaryDataPanel({
  query,
  appCI,
  appFunction,
  chartType,
  accentColor,
  tableHeight,
  onRowClick,
  hiddenCols,
  multiSeriesMeta,
  donutCenterLabel,
}: {
  query: string;
  appCI?: string;
  appFunction?: { name: string; toRecords: (result: unknown) => Record<string, unknown>[] };
  chartType: "table" | "bar" | "stackedBar" | "multiPanel" | "donut";
  accentColor: string;
  tableHeight?: string;
  onRowClick?: (row: Record<string, unknown>) => void;
  hiddenCols?: string[];
  multiSeriesMeta?: Record<string, { label: string; unit?: string }>;
  donutCenterLabel?: string;
}) {
  const dqlResult = useDqlWithCache({ query });
  const fnResult = useAppFunction<unknown>(
    { name: appFunction?.name ?? "__unused__", data: { appCI } },
    { autoFetch: !!appFunction, autoFetchOnUpdate: true }
  );
  const isLoading = appFunction ? fnResult.isLoading : dqlResult.isLoading;
  const error = appFunction ? fnResult.error : dqlResult.error;
  const data = appFunction
    ? fnResult.data !== undefined
      ? { records: appFunction.toRecords(fnResult.data) }
      : undefined
    : dqlResult.data;
  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
        <ProgressCircle size="small" />
        <span style={{ fontSize: 11, color: "var(--sre-text-secondary)" }}>Loading…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ fontSize: 11, color: "#cf222e", padding: 8, background: "rgba(220,53,69,0.06)", borderRadius: 6, border: "1px solid rgba(220,53,69,0.2)" }}>
        {error.message}
      </div>
    );
  }
  const records = (data?.records ?? []) as Record<string, unknown>[];
  if (!records.length) return <div style={{ fontSize: 11, color: "var(--sre-text-secondary)", fontStyle: "italic" }}>No data</div>;
  if (chartType === "bar") return <SimpleBarChart records={records} accentColor={accentColor} />;
  if (chartType === "stackedBar") return <StackedBarChart records={records} accentColor={accentColor} />;
  if (chartType === "multiPanel") return <MultiPanelChart records={records} meta={multiSeriesMeta ?? {}} />;
  if (chartType === "donut") return <DonutChart records={records} accentColor={accentColor} centerLabel={donutCenterLabel} />;
  return <DataTable records={records} maxHeight={tableHeight} onRowClick={onRowClick} hiddenCols={hiddenCols} />;
}

function useAppInfo(appCI: string) {
  const query = `load "/lookups/dynatrace/cmdb_appci_owner_mapping"
| filter lower(applicationci) == lower("${appCI}")
| fields appName = name, tier = business_criticality, owner = owned_by
| limit 1`;
  const { data } = useDqlWithCache({ query });
  const rec = (data?.records ?? [])[0] as Record<string, unknown> | undefined;
  return {
    appName: rec?.appName ? String(rec.appName) : undefined,
    tier: rec?.tier ? String(rec.tier) : undefined,
    owner: rec?.owner ? String(rec.owner) : undefined,
  };
}

// Resolves this app's tagged AWS resources back to their account name(s) +
// ID(s) — usually one account, but shown as "+N more" if a portfolio app's
// resources span multiple accounts.
function useCloudAccountInfo(appCI: string) {
  const query = `smartscapeNodes "AWS*"
| fieldsFlatten \`tags:aws\`, fields:{ApplicationCI}
| filter lower(ApplicationCI) == lower("${appCI}")
| summarize accountIds = collectDistinct(aws.account.id)
| expand accountIds
| lookup [
    smartscapeNodes "AWS_ACCOUNT"
    | fields accountId = aws.account.id, accountName = coalesce(aws.resource.name, name)
  ], sourceField:accountIds, lookupField:accountId, fields:{accountName}
| fields accountId = accountIds, accountName
| limit 5`;
  const { data } = useDqlWithCache({ query });
  const records = (data?.records ?? []) as Record<string, unknown>[];
  if (!records.length) return { label: undefined };
  const first = records[0];
  const accountId = first.accountId ? String(first.accountId) : undefined;
  const accountName = first.accountName ? String(first.accountName) : undefined;
  if (!accountId) return { label: undefined };
  const base = accountName ? `${accountName} (${accountId})` : accountId;
  const extra = records.length > 1 ? ` +${records.length - 1} more` : "";
  return { label: `${base}${extra}` };
}

export function CheckDetailModal({ checkKey, currentValue, appCI, accentColor, onClose, siblings, onNavigate }: Props) {
  const config = CHECK_DETAIL_CONFIGS[checkKey];
  // null = "All". Reset whenever the modal switches to a different check so a
  // filter chosen on one check doesn't silently carry over to the next.
  const [facet, setFacet] = React.useState<string | null>(null);
  React.useEffect(() => { setFacet(null); }, [checkKey]);
  const status = getStatus(currentValue);
  const displayValue = currentValue.replace(/^(pass|fail|warn|n\/a)\s*/i, "");
  const ss = STATUS_STYLES[status];
  const appInfo = useAppInfo(appCI);
  const cloudAccountInfo = useCloudAccountInfo(appCI);

  const levelInfo = config ? LEVEL_META[config.level] : null;
  const levelLabel = levelInfo ? `${config!.level} — ${levelInfo.title}` : "";

  const siblingIndex = siblings.findIndex((s) => s.key === checkKey);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (siblings.length < 2) return;
      if (e.key === "ArrowLeft") {
        const prev = siblings[(siblingIndex - 1 + siblings.length) % siblings.length];
        onNavigate(prev.key, prev.value);
      } else if (e.key === "ArrowRight") {
        const next = siblings[(siblingIndex + 1) % siblings.length];
        onNavigate(next.key, next.value);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onNavigate, siblings, siblingIndex]);

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.52)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--sre-surface, #fff)",
          borderRadius: 14,
          width: "100%",
          maxWidth: 1440,
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "row",
          boxShadow: "0 24px 80px rgba(0,0,0,0.38)",
          overflow: "hidden",
        }}
      >
        {/* ── Sibling sidebar (redesign) ── */}
        {siblings.length > 1 && (
          <div
            style={{
              width: 206,
              flexShrink: 0,
              background: "var(--panel, #F7F8FA)",
              borderRight: "1px solid var(--sre-border, rgba(0,0,0,0.08))",
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
              padding: 8,
            }}
          >
            {siblings.map((s) => {
              const isActive = s.key === checkKey;
              const sStatus = s.value.toLowerCase().startsWith("pass") ? "pass"
                : s.value.toLowerCase().startsWith("fail") ? "fail"
                : s.value.toLowerCase().startsWith("warn") ? "warn" : "na";
              const dotColor = { pass: "#1E9E5A", fail: "#DC3545", warn: "#E8A33D", na: "#8FA0BC" }[sStatus];
              return (
                <div
                  key={s.key}
                  onClick={() => onNavigate(s.key, s.value)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "9px 10px",
                    borderRadius: 7,
                    cursor: "pointer",
                    background: isActive ? "var(--sre-surface, #fff)" : "transparent",
                    fontWeight: isActive ? 700 : 500,
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: dotColor }} />
                  <span style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.key.replace(/^\d+\.\s*/, "")}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        {/* ── Header ── */}
        <div
          style={{
            background: `linear-gradient(135deg, ${accentColor}, ${accentColor}bb)`,
            padding: "16px 20px",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1 }}>
            {levelLabel && (
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.72)",
                  letterSpacing: 0.7,
                  marginBottom: 4,
                  textTransform: "uppercase",
                }}
              >
                {levelLabel}
              </div>
            )}
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", lineHeight: 1.3, marginBottom: 8 }}>
              {checkKey}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#fff",
                  background: "rgba(255,255,255,0.22)",
                  padding: "3px 10px",
                  borderRadius: 12,
                }}
              >
                ApplicationCI: {appCI}
              </span>
              {appInfo.appName && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#fff",
                    background: "rgba(255,255,255,0.14)",
                    padding: "3px 10px",
                    borderRadius: 12,
                  }}
                >
                  {appInfo.appName}
                </span>
              )}
              {appInfo.tier && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#fff",
                    background: "rgba(255,255,255,0.14)",
                    padding: "3px 10px",
                    borderRadius: 12,
                  }}
                >
                  Tier: {appInfo.tier}
                </span>
              )}
              {appInfo.owner && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#fff",
                    background: "rgba(255,255,255,0.14)",
                    padding: "3px 10px",
                    borderRadius: 12,
                  }}
                >
                  Owner: {appInfo.owner}
                </span>
              )}
              {cloudAccountInfo.label && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#fff",
                    background: "rgba(255,255,255,0.14)",
                    padding: "3px 10px",
                    borderRadius: 12,
                  }}
                >
                  Account: {cloudAccountInfo.label}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "rgba(255,255,255,0.18)",
              border: "none",
              color: "#fff",
              borderRadius: 6,
              width: 30,
              height: 30,
              cursor: "pointer",
              fontSize: 15,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* ── Status banner ── */}
        <div
          style={{
            padding: "9px 20px",
            background: ss.bg,
            borderBottom: `1px solid ${ss.border}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: ss.text,
              background: ss.border,
              padding: "3px 9px",
              borderRadius: 5,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              flexShrink: 0,
            }}
          >
            {ss.label}
          </span>
          <span style={{ fontSize: 13, color: ss.text, fontWeight: 500, lineHeight: 1.3 }}>
            {displayValue ||
              (status === "pass" ? "Active" : status === "na" ? "Not applicable" : "Not detected")}
          </span>
          {config?.hardcoded && (
            <span style={{ marginLeft: "auto" }}>
              <HardcodedBadge size="full" />
            </span>
          )}
        </div>

        {/* ── Body (two columns) ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            flex: 1,
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          {/* Left: description + pass logic + guidance */}
          <div
            style={{
              padding: 22,
              overflowY: "auto",
              borderRight: "1px solid var(--sre-border, rgba(0,0,0,0.08))",
            }}
          >
            {config ? (
              <>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--sre-text-secondary, #6F747F)",
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  About this check
                </div>
                <p
                  style={{
                    fontSize: 13,
                    lineHeight: 1.65,
                    color: "var(--sre-text-primary, #1f2328)",
                    margin: "0 0 16px",
                  }}
                >
                  {config.description}
                </p>

                <div
                  style={{
                    fontSize: 12,
                    background: `${accentColor}14`,
                    border: `1px solid ${accentColor}40`,
                    borderRadius: 7,
                    padding: "9px 13px",
                    marginBottom: 18,
                    color: "var(--sre-text-primary, #1f2328)",
                    lineHeight: 1.55,
                  }}
                >
                  <strong style={{ color: accentColor }}>Pass logic: </strong>
                  {config.passLogic}
                </div>

                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--sre-text-secondary, #6F747F)",
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    marginBottom: 6,
                  }}
                >
                  How to improve
                </div>
                <p
                  style={{
                    fontSize: 13,
                    lineHeight: 1.65,
                    color: "var(--sre-text-primary, #1f2328)",
                    margin: 0,
                  }}
                >
                  {config.guidance}
                </p>
                {config.showTypeWordCloud && config.secondaryQuery && (
                  <>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "var(--sre-text-secondary, #6F747F)",
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                        marginTop: 22,
                        marginBottom: 2,
                        paddingTop: 18,
                        borderTop: "1px solid var(--sre-border, rgba(0,0,0,0.08))",
                      }}
                    >
                      Resource Mix
                    </div>
                    <WordCloudPanel
                      query={config.secondaryQuery(appCI)}
                      appCI={config.cloudTypeRowClick ? appCI : undefined}
                    />
                  </>
                )}
              </>
            ) : (
              <p style={{ fontSize: 13, color: "var(--sre-text-secondary)" }}>
                No configuration found for this check.
              </p>
            )}
          </div>

          {/* Right: live supporting data */}
          <div style={{ padding: 22, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 12 }}>
            {config?.facetOptions && config.facetOptions.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--sre-text-secondary, #6F747F)",
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    marginRight: 2,
                  }}
                >
                  {config.facetLabel ?? "Filter"}
                </span>
                {[null, ...config.facetOptions].map((opt) => {
                  const active = facet === opt;
                  return (
                    <button
                      key={opt ?? "__all__"}
                      onClick={() => setFacet(opt)}
                      style={{
                        background: active ? accentColor : "transparent",
                        color: active ? "#fff" : "var(--sre-text-secondary, #6F747F)",
                        border: `1px solid ${active ? accentColor : "var(--sre-border, rgba(0,0,0,0.15))"}`,
                        borderRadius: 999,
                        padding: "3px 11px",
                        fontSize: 11,
                        fontWeight: active ? 700 : 600,
                        cursor: "pointer",
                        transition: "all 0.12s",
                        textTransform: opt ? "uppercase" : "none",
                        letterSpacing: opt ? 0.4 : 0,
                      }}
                    >
                      {opt ?? "All"}
                    </button>
                  );
                })}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--sre-text-secondary, #6F747F)",
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                }}
              >
                Supporting Data
              </div>
              {config?.serviceRowClick && (
                <div style={{ fontSize: 10, color: "var(--sre-text-secondary, #6F747F)", fontStyle: "italic" }}>
                  — click a row to open in Distributed Tracing
                </div>
              )}
              {config?.logHostRowClick && (
                <div style={{ fontSize: 10, color: "var(--sre-text-secondary, #6F747F)", fontStyle: "italic" }}>
                  — click a row to open in Logs
                </div>
              )}
              {config?.hostEntityRowClick && (
                <div style={{ fontSize: 10, color: "var(--sre-text-secondary, #6F747F)", fontStyle: "italic" }}>
                  — click a row to open in Infrastructure & Operations
                </div>
              )}
              {config?.serviceMapRowClick && (
                <div style={{ fontSize: 10, color: "var(--sre-text-secondary, #6F747F)", fontStyle: "italic" }}>
                  — click a row to open in Services Map
                </div>
              )}
              {config?.k8sClusterRowClick && (
                <div style={{ fontSize: 10, color: "var(--sre-text-secondary, #6F747F)", fontStyle: "italic" }}>
                  — click a row to open that workload's cluster in Services
                </div>
              )}
              {config?.cloudResourceRowClick && (
                <div style={{ fontSize: 10, color: "var(--sre-text-secondary, #6F747F)", fontStyle: "italic" }}>
                  — click a row to open that resource in the Clouds app
                </div>
              )}
              {config?.problemRowClick && (
                <div style={{ fontSize: 10, color: "var(--sre-text-secondary, #6F747F)", fontStyle: "italic" }}>
                  — click a row to open that problem in Problems
                </div>
              )}
              {config?.urlRowClick && (
                <div style={{ fontSize: 10, color: "var(--sre-text-secondary, #6F747F)", fontStyle: "italic" }}>
                  — {config.urlRowClickHint ?? "click a row to open it in a new tab"}
                </div>
              )}
              {config?.workflowRowClick && (
                <div style={{ fontSize: 10, color: "var(--sre-text-secondary, #6F747F)", fontStyle: "italic" }}>
                  — click a row to open that workflow in Workflows
                </div>
              )}
              {config?.guardianRowClick && (
                <div style={{ fontSize: 10, color: "var(--sre-text-secondary, #6F747F)", fontStyle: "italic" }}>
                  — click a row to open that guardian's validation results
                </div>
              )}
              {config?.samplingNote && (
                <div style={{ fontSize: 10, color: "var(--sre-text-secondary, #6F747F)", fontStyle: "italic" }}>
                  — {config.samplingNote}
                </div>
              )}
            </div>
            <DataPanel config={config} appCI={appCI} accentColor={accentColor} facet={facet ?? undefined} scrollable={!!config?.secondaryQuery || !!config?.secondaryAppFunction || !!config?.serviceMapRowClick || !!config?.cloudResourceRowClick} />
            {(config?.secondaryQuery || config?.secondaryAppFunction) && (
              <>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--sre-text-secondary, #6F747F)",
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    marginTop: 8,
                    paddingTop: 12,
                    borderTop: "1px solid var(--sre-border, rgba(0,0,0,0.08))",
                  }}
                >
                  {config.secondaryLabel ?? "Trend (7d)"}
                  {config.cloudTypeRowClick && (
                    <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0, fontStyle: "italic" }}>
                      {" "}— click a row to open that type in the Clouds app
                    </span>
                  )}
                </div>
                <SecondaryDataPanel
                  query={config.secondaryQuery ? config.secondaryQuery(appCI, facet ?? undefined) : `data record(none = true)`}
                  appCI={appCI}
                  appFunction={config.secondaryAppFunction}
                  chartType={config.secondaryChartType ?? "bar"}
                  accentColor={accentColor}
                  tableHeight={config.secondaryChartType === "table" ? TABLE_HEIGHT : undefined}
                  onRowClick={
                    config.cloudTypeRowClick
                      ? (row) => {
                          const rawType = String(row.type ?? "");
                          if (!rawType) return;
                          const resourceType = row.resourceType != null ? String(row.resourceType) : undefined;
                          window.open(buildCloudTypeFilterUrl(appCI, rawType, resourceType), "_blank");
                        }
                      : undefined
                  }
                  hiddenCols={config.cloudTypeRowClick ? ["resourceType"] : undefined}
                  multiSeriesMeta={config.multiSeriesMeta}
                  donutCenterLabel={config.donutCenterLabel}
                />
              </>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            padding: "7px 20px",
            borderTop: "1px solid var(--sre-border, rgba(0,0,0,0.08))",
            fontSize: 11,
            color: "var(--sre-text-secondary, #6F747F)",
            flexShrink: 0,
            background: "var(--sre-surface-secondary, rgba(0,0,0,0.02))",
            display: "flex",
            alignItems: "center",
            gap: 8,
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {config?.openIn?.length ? (
              <>
                <span style={{ fontWeight: 700, letterSpacing: 0.6, flexShrink: 0 }}>OPEN IN</span>
                {config.openIn.map((l) => (
                  <a
                    key={l.path}
                    href={`${getEnvironmentUrl().replace(/\/$/, "")}${l.path}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 9px",
                      border: "1px solid var(--sre-border, rgba(0,0,0,0.08))",
                      borderRadius: 6,
                      color: "var(--sre-text-primary, #1f2328)",
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {l.label} ↗
                  </a>
                ))}
              </>
            ) : null}
          </div>
          <span style={{ flexShrink: 0 }}>
            {siblings.length > 1 ? "← → checks · " : ""}Click backdrop or press Esc to close
          </span>
        </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
