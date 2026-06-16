import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { useDqlWithCache } from "../hooks/useDqlWithCache";
import { RefreshOverlay } from "./RefreshOverlay";

interface Props {
  title: string;
  query: string;
  accentColor: string;
}

function getStatus(value: string): "pass" | "fail" | "warn" | "na" {
  const v = value.toLowerCase();
  if (v.startsWith("pass")) return "pass";
  if (v.startsWith("fail")) return "fail";
  if (v.startsWith("warn")) return "warn";
  if (v.startsWith("n/a")) return "na";
  return "na";
}

function getStatusDisplay(value: string): string {
  return value.replace(/^(pass|fail|warn|n\/a)\s*/i, "");
}

const statusStyles = {
  pass: { bg: "rgba(40, 167, 69, 0.08)", border: "rgba(40, 167, 69, 0.3)", text: "#1a7f37", icon: "\u2705" },
  fail: { bg: "rgba(220, 53, 69, 0.08)", border: "rgba(220, 53, 69, 0.3)", text: "#cf222e", icon: "\ud83d\udd34" },
  warn: { bg: "rgba(255, 193, 7, 0.1)", border: "rgba(255, 193, 7, 0.4)", text: "#9a6700", icon: "\u26a0\ufe0f" },
  na: { bg: "rgba(128, 128, 128, 0.06)", border: "rgba(128, 128, 128, 0.2)", text: "#656d76", icon: "\u2796" },
};

function parseScore(scoreStr: string): { current: number; total: number } {
  const match = String(scoreStr).match(/(\d+)\s*\/\s*(\d+)/);
  if (match) return { current: parseInt(match[1]), total: parseInt(match[2]) };
  return { current: 0, total: 1 };
}

function ScoreRing({ current, total, color, size = 70 }: { current: number; total: number; color: string; size?: number }) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  const radius = (size / 2) - 6;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(128,128,128,0.15)" strokeWidth="5" />
        <circle
          cx={size/2} cy={size/2} r={radius} fill="none"
          stroke={color} strokeWidth="5"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column",
      }}>
        <span style={{ fontSize: 16, fontWeight: 800, color }}>{current}/{total}</span>
      </div>
    </div>
  );
}

function CheckItem({ label, value }: { label: string; value: string }) {
  const status = getStatus(value);
  const display = getStatusDisplay(value);
  const s = statusStyles[status];

  return (
    <div style={{
      padding: "8px 10px",
      borderRadius: 6,
      background: s.bg,
      border: `1px solid ${s.border}`,
      display: "flex",
      alignItems: "flex-start",
      gap: 6,
    }}>
      <span style={{ fontSize: 13, lineHeight: "16px", flexShrink: 0 }}>{s.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: s.text, letterSpacing: 0.2, marginBottom: 1 }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: "var(--sre-text-primary, #1f2328)", wordBreak: "break-word", lineHeight: 1.3 }}>
          {display || (status === "na" ? "N/A" : status === "fail" ? "Not detected" : "Active")}
        </div>
      </div>
    </div>
  );
}

export const ScorecardCard = ({ title, query, accentColor }: Props) => {
  const { data, isLoading, isRefreshing, error } = useDqlWithCache({ query });

  if (isLoading) {
    return (
      <div style={{
        background: "var(--sre-surface, #fff)", borderRadius: 12,
        border: "1px solid var(--sre-border, rgba(0,0,0,0.08))", padding: 24, display: "flex",
        flexDirection: "column", alignItems: "center", gap: 12, minHeight: 300,
        justifyContent: "center",
      }}>
        <ProgressCircle size="small" />
        <Paragraph style={{ fontSize: 12 }}>Loading...</Paragraph>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: "var(--sre-surface, #fff)", borderRadius: 12,
        border: "1px solid rgba(220,53,69,0.2)", overflow: "hidden",
      }}>
        <div style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)`, padding: "14px 16px" }}>
          <Heading level={6} style={{ color: "#fff", margin: 0 }}>{title}</Heading>
        </div>
        <div style={{ padding: 16 }}>
          <Paragraph style={{ color: "var(--dt-colors-text-critical-default)", fontSize: 11 }}>{error.message}</Paragraph>
        </div>
      </div>
    );
  }

  if (!data?.records || data.records.length === 0) {
    return (
      <div style={{
        background: "var(--sre-surface, #fff)", borderRadius: 12,
        border: "1px solid var(--sre-border, rgba(0,0,0,0.08))", overflow: "hidden",
      }}>
        <div style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)`, padding: "14px 16px" }}>
          <Heading level={6} style={{ color: "#fff", margin: 0 }}>{title}</Heading>
        </div>
        <div style={{ padding: 16 }}>
          <Paragraph style={{ opacity: 0.5, fontSize: 12 }}>No data available</Paragraph>
        </div>
      </div>
    );
  }

  const record = data.records[0] as Record<string, unknown>;
  const keys = Object.keys(record);
  const scoreKey = keys.find((k) => k.toLowerCase().includes("score"));
  const scoreValue = scoreKey ? String(record[scoreKey]) : "0 / 0";
  const { current, total } = parseScore(scoreValue);
  const checkKeys = keys.filter((k) => !k.toLowerCase().includes("score"));

  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const ringColor = pct >= 80 ? "#49C2B3" : pct >= 50 ? "#C93FDB" : "#dc3545";

  return (
    <RefreshOverlay isRefreshing={isRefreshing}>
      <div style={{
        background: "var(--sre-surface, #fff)",
        borderRadius: 12,
        border: "1px solid var(--sre-border, rgba(0,0,0,0.08))",
        overflow: "hidden",
        boxShadow: "0 1px 3px var(--sre-card-shadow)",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          background: `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)`,
          padding: "14px 16px",
          textAlign: "center",
        }}>
          <Heading level={6} style={{ color: "#fff", margin: 0 }}>{title}</Heading>
        </div>

        {/* Score ring */}
        <Flex flexDirection="column" alignItems="center" gap={4} padding={16} style={{ borderBottom: "1px solid var(--sre-border)" }}>
          <ScoreRing current={current} total={total} color={ringColor} />
          <span style={{ fontSize: 10, fontWeight: 700, color: ringColor, letterSpacing: 0.5 }}>
            {pct}% COMPLETE
          </span>
        </Flex>

        {/* Checks stacked vertically */}
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          {checkKeys.map((key) => (
            <CheckItem key={key} label={key} value={String(record[key])} />
          ))}
        </div>
      </div>
    </RefreshOverlay>
  );
};
