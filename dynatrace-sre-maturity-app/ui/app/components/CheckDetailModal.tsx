import React from "react";
import ReactDOM from "react-dom";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { useDqlWithCache } from "../hooks/useDqlWithCache";
import { CHECK_DETAIL_CONFIGS, LEVEL_META, CheckDetailConfig } from "./checkDetailConfigs";

interface Props {
  checkKey: string;
  currentValue: string;
  appCI: string;
  accentColor: string;
  onClose: () => void;
}

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

function DataTable({ records }: { records: Record<string, unknown>[] }) {
  if (!records.length) return null;
  const cols = Object.keys(records[0]);
  return (
    <div style={{ overflowX: "auto", fontSize: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
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
                  background: "var(--sre-surface-secondary, rgba(0,0,0,0.02))",
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
          {records.slice(0, 50).map((row, i) => (
            <tr
              key={i}
              style={{ background: i % 2 === 0 ? "transparent" : "var(--sre-surface-secondary, rgba(0,0,0,0.02))" }}
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
      {records.length > 50 && (
        <div style={{ fontSize: 11, color: "var(--sre-text-secondary)", padding: "6px 10px", fontStyle: "italic" }}>
          Showing 50 of {records.length} rows
        </div>
      )}
    </div>
  );
}

function SimpleBarChart({ records, accentColor }: { records: Record<string, unknown>[]; accentColor: string }) {
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
  const barW = Math.max(8, Math.min(40, Math.floor(360 / records.length) - 3));
  const chartH = 140;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: chartH + 28, overflowX: "auto", paddingBottom: 4 }}>
        {records.map((row, i) => {
          const h = Math.max(2, Math.round((values[i] / maxVal) * chartH));
          const secH = secValues ? Math.max(0, Math.round((secValues[i] / maxVal) * chartH)) : 0;
          const label = tsCol ? formatBarLabel(row[tsCol]) : String(i + 1);
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0, width: barW }}>
              <div style={{ fontSize: 9, color: "var(--sre-text-secondary)", marginBottom: 2 }}>
                {values[i].toLocaleString()}
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: chartH }}>
                <div
                  title={`${primaryCol}: ${values[i]}`}
                  style={{
                    width: secValues ? barW * 0.55 : barW,
                    height: h,
                    background: accentColor,
                    borderRadius: "3px 3px 0 0",
                    opacity: 0.85,
                  }}
                />
                {secValues && (
                  <div
                    title={`${secondaryCol}: ${secValues[i]}`}
                    style={{
                      width: barW * 0.55,
                      height: secH,
                      background: `${accentColor}70`,
                      borderRadius: "3px 3px 0 0",
                    }}
                  />
                )}
              </div>
              <div style={{ fontSize: 9, color: "var(--sre-text-secondary)", textAlign: "center", lineHeight: 1.2, maxWidth: barW + 4 }}>
                {label}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 11, color: "var(--sre-text-secondary)" }}>
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
    </div>
  );
}

function formatBarLabel(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "number" && val > 1_000_000_000_000) {
    const d = new Date(val);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    try {
      const d = new Date(s);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    } catch { return s.slice(5, 10); }
  }
  return s.length > 8 ? s.slice(0, 8) : s;
}

function DataPanel({
  config,
  appCI,
  accentColor,
}: {
  config: CheckDetailConfig | undefined;
  appCI: string;
  accentColor: string;
}) {
  const query = config ? config.detailQuery(appCI) : `data record(none = true)`;
  const { data, isLoading, error } = useDqlWithCache({ query });

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

  return <DataTable records={records} />;
}

export function CheckDetailModal({ checkKey, currentValue, appCI, accentColor, onClose }: Props) {
  const config = CHECK_DETAIL_CONFIGS[checkKey];
  const status = getStatus(currentValue);
  const displayValue = currentValue.replace(/^(pass|fail|warn|n\/a)\s*/i, "");
  const ss = STATUS_STYLES[status];

  const levelInfo = config ? LEVEL_META[config.level] : null;
  const levelLabel = levelInfo ? `${config!.level} — ${levelInfo.title}` : "";

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
          maxWidth: 940,
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 80px rgba(0,0,0,0.38)",
          overflow: "hidden",
        }}
      >
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
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>
              {checkKey}
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
              </>
            ) : (
              <p style={{ fontSize: 13, color: "var(--sre-text-secondary)" }}>
                No configuration found for this check.
              </p>
            )}
          </div>

          {/* Right: live supporting data */}
          <div style={{ padding: 22, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "var(--sre-text-secondary, #6F747F)",
                letterSpacing: 0.6,
                textTransform: "uppercase",
                marginBottom: 2,
              }}
            >
              Supporting Data
            </div>
            <DataPanel config={config} appCI={appCI} accentColor={accentColor} />
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
            justifyContent: "space-between",
          }}
        >
          <span>
            ApplicationCI: <strong>{appCI}</strong>
          </span>
          <span>Click backdrop or press Esc to close</span>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
