import React from "react";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { useDqlWithCache } from "../hooks/useDqlWithCache";
import { RefreshOverlay } from "./RefreshOverlay";

export function KpiCard({
  label,
  query,
  color,
  unit,
  href,
}: {
  icon?: string;
  label: string;
  query: string;
  color: string;
  unit?: string;
  href?: string;
}) {
  const { data, isLoading, isRefreshing, error } = useDqlWithCache({ query });
  const rawValue = data?.records?.[0] ? Object.values(data.records[0])[0] : null;
  const value = rawValue !== null ? Number(rawValue) : null;
  const hasData = !isLoading && !error && value !== null && value > 0;
  const displayValue = value !== null
    ? value > 1000000 ? `${(value / 1000000).toFixed(1)}M`
    : value > 1000 ? `${(value / 1000).toFixed(1)}K`
    : String(Math.round(value * 10) / 10)
    : "\u2014";

  const isClickable = !!href && hasData;

  const cardContent = (
    <div style={{
      borderRadius: 14,
      padding: "14px 16px 12px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 2,
      position: "relative",
      overflow: "hidden",
      background: `radial-gradient(ellipse at 50% 0%, ${color}20, transparent 70%), rgba(255,255,255,0.03)`,
      border: `1px solid ${hasData ? color + "35" : "rgba(255,255,255,0.06)"}`,
      transition: "all 0.3s",
      cursor: isClickable ? "pointer" : "default",
    }}
      onMouseEnter={isClickable ? (e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = `0 4px 20px ${color}30`;
      } : undefined}
      onMouseLeave={isClickable ? (e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      } : undefined}
    >
      {/* Big number */}
      {isLoading ? (
        <div style={{ padding: 8 }}><ProgressCircle size="small" /></div>
      ) : error ? (
        <span style={{ fontSize: 16, color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>N/A</span>
      ) : (
        <span style={{
          fontSize: 38, fontWeight: 900, lineHeight: 1, letterSpacing: -1,
          color: hasData ? "#fff" : "rgba(255,255,255,0.1)",
          textShadow: hasData ? `0 2px 24px ${color}50, 0 0 60px ${color}20` : "none",
          transition: "color 0.3s, text-shadow 0.3s",
        }}>
          {displayValue}
          {unit && <span style={{ fontSize: 16, fontWeight: 700, opacity: 0.5, marginLeft: 2 }}>{unit}</span>}
        </span>
      )}

      {/* Label */}
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textAlign: "center",
        color: hasData ? color : "rgba(255,255,255,0.2)",
        marginTop: 2,
        transition: "color 0.3s",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
      }}>
        {label}
        {isClickable && (
          <span style={{
            fontSize: 11,
            fontWeight: 800,
            opacity: 0.8,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 14,
            height: 14,
            borderRadius: 3,
            background: `${color}25`,
            color: color,
          }}>
            {"\u2197"}
          </span>
        )}
      </div>

      {/* Click hint for clickable cards */}
      {isClickable && (
        <div style={{
          fontSize: 8,
          fontWeight: 600,
          color: color,
          opacity: 0.5,
          letterSpacing: 0.5,
          marginTop: 3,
          textTransform: "uppercase",
        }}>
          Click to view
        </div>
      )}

      {/* Bottom accent bar */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 3,
        background: hasData
          ? `linear-gradient(90deg, transparent, ${color}, transparent)`
          : "transparent",
        transition: "all 0.5s",
      }} />
    </div>
  );

  return (
    <RefreshOverlay isRefreshing={isRefreshing}>
      {isClickable ? (
        <a href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
          {cardContent}
        </a>
      ) : (
        cardContent
      )}
    </RefreshOverlay>
  );
}
