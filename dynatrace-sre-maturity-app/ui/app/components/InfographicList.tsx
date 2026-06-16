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
  labelField: string;
  valueField: string;
  unit?: string;
  maxItems?: number;
}

export function InfographicList({
  title,
  icon,
  color,
  query,
  labelField,
  valueField,
  unit,
  maxItems = 10,
}: Props) {
  const { data, isLoading, isRefreshing, error } = useDqlWithCache({ query });
  const records = ((data?.records || []) as Record<string, unknown>[]).slice(0, maxItems);
  const maxValue = records.reduce((m, r) => Math.max(m, Number(r[valueField] || 0)), 1);

  return (
    <RefreshOverlay isRefreshing={isRefreshing}>
      <div style={{
        background: "var(--sre-surface, #fff)",
        borderRadius: 14,
        border: "1px solid var(--sre-border)",
        overflow: "hidden",
        boxShadow: "0 2px 8px var(--sre-card-shadow)",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          background: `linear-gradient(135deg, ${color}, ${color}cc)`,
          padding: "14px 18px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          {icon && <span style={{ fontSize: 20 }}>{icon}</span>}
          <Heading level={5} style={{ color: "#fff", margin: 0 }}>{title}</Heading>
          {records.length > 0 && (
            <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>
              {records.length}
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: "12px 16px", flex: 1 }}>
          {isLoading ? (
            <Flex justifyContent="center" padding={16}><ProgressCircle /></Flex>
          ) : error ? (
            <Paragraph style={{ color: "var(--dt-colors-text-critical-default)", fontSize: 12 }}>{error.message}</Paragraph>
          ) : records.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {records.map((row, i) => {
                const label = String(row[labelField] || "—");
                const value = Number(row[valueField] || 0);
                const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
                const isTop3 = i < 3;
                const rankBg = i === 0 ? "linear-gradient(135deg, #FFD700, #FFA500)"
                  : i === 1 ? "linear-gradient(135deg, #C0C0C0, #A0A0A0)"
                  : i === 2 ? "linear-gradient(135deg, #CD7F32, #8B4513)"
                  : `${color}15`;
                const rankColor = isTop3 ? "#fff" : color;

                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {/* Rank badge */}
                    <div style={{
                      width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                      background: rankBg,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 800, color: rankColor,
                    }}>
                      {i + 1}
                    </div>

                    {/* Label + bar */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12, fontWeight: 600,
                        color: "var(--sre-text-primary)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        marginBottom: 3,
                      }}>
                        {label}
                      </div>
                      <div style={{
                        height: 5, borderRadius: 3,
                        background: "var(--sre-card-bg, rgba(0,0,0,0.05))",
                        overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%",
                          width: `${pct}%`,
                          borderRadius: 3,
                          background: `linear-gradient(90deg, ${color}, ${color}aa)`,
                          transition: "width 0.6s ease",
                        }} />
                      </div>
                    </div>

                    {/* Value */}
                    <div style={{ flexShrink: 0, textAlign: "right", minWidth: 50 }}>
                      <span style={{
                        fontSize: 16, fontWeight: 800, color,
                        fontVariantNumeric: "tabular-nums",
                      }}>
                        {value.toLocaleString()}
                      </span>
                      {unit && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--sre-text-secondary)", marginLeft: 2 }}>
                          {unit}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Paragraph style={{ color: "var(--sre-text-secondary)", opacity: 0.5, fontSize: 12 }}>No data available</Paragraph>
          )}
        </div>
      </div>
    </RefreshOverlay>
  );
}
