// Single-row app identity bar for the redesigned Scorecards page. Same data
// source as AppContextBanner.tsx (PROFILE_LOOKUP/PROFILE_FALLBACK) — that
// component is left untouched because Home.tsx also renders it and this
// redesign doesn't touch Home.
import React, { useRef } from "react";
import { Paragraph } from "@dynatrace/strato-components/typography";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { RefreshOverlay } from "./RefreshOverlay";

interface Props {
  appCI: string;
}

function getCriticalityColor(criticality: string): string {
  const c = criticality.toLowerCase();
  if (c.includes("1") || c.includes("most critical")) return "var(--fail-ink, #B3261E)";
  if (c.includes("2") || c.includes("high")) return "#c2410c";
  if (c.includes("3") || c.includes("moderate")) return "var(--warn-ink, #8A6100)";
  if (c.includes("4") || c.includes("low")) return "var(--pass-ink, #17663C)";
  return "var(--ink-2, #6F747F)";
}

function getStatusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("production")) return "var(--pass-ink, #17663C)";
  if (s.includes("implementation")) return "var(--nav-active, #1414D3)";
  if (s.includes("retired")) return "var(--fail-ink, #B3261E)";
  return "var(--ink-2, #6F747F)";
}

function Chip({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 5, flexShrink: 0 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.5,
          color: "var(--ink-2, #6F747F)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: valueColor ?? "var(--ink, #1A2440)" }}>
        {value || "—"}
      </span>
    </div>
  );
}

const PROFILE_LOOKUP = (appCI: string) =>
  `load "/lookups/dynatrace/cmdb_appci_owner_mapping"
| filter lower(applicationci) == lower("${appCI}")
| fields
    name,
    applicationci,
    business_criticality,
    operational_status,
    \`managed_by.u_managing_director\`,
    owned_by,
    support_group`;

const PROFILE_FALLBACK = (appCI: string) =>
  `fetch bizevents, from:now()-48h
| filter event.type == "workflow.import.servicenow.appci"
| filter lower(applicationci) == lower("${appCI}")
| sort timestamp desc
| limit 1`;

export const AppIdentityBar = ({ appCI }: Props) => {
  const { data: lookupData, isLoading: lookupLoading, error: lookupError } = useDql({
    query: PROFILE_LOOKUP(appCI),
  });
  const { data: fallbackData, isLoading: fallbackLoading } = useDql({
    query: lookupError ? PROFILE_FALLBACK(appCI) : "data record(skip = true) | limit 0",
  });

  const data = lookupError ? fallbackData : lookupData;
  const isLoading = lookupError ? fallbackLoading : lookupLoading;

  const cacheRef = useRef<Record<string, unknown>>({});
  const currentRecord = (data?.records?.[0] || null) as Record<string, unknown> | null;
  if (currentRecord) cacheRef.current = currentRecord;

  const hasCache = Object.keys(cacheRef.current).length > 0;
  const isRefreshing = isLoading && hasCache;
  const isFirstLoad = isLoading && !hasCache;

  if (isFirstLoad) {
    return (
      <div
        style={{
          background: "var(--card, #fff)",
          borderRadius: 10,
          padding: "10px 14px",
          border: "1px solid var(--line, #E3E6EB)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <ProgressCircle size="small" />
        <Paragraph style={{ fontSize: 12 }}>Loading application profile...</Paragraph>
      </div>
    );
  }

  const r = (currentRecord || cacheRef.current) as Record<string, unknown>;
  const name = String(r.name || "");
  const appci = String(r.applicationci || appCI);
  const criticality = String(r.business_criticality || "—");
  const status = String(r.operational_status || "In Production");
  const director = String(r["managed_by.u_managing_director"] || "—");
  const owner = String(r.owned_by || "—");
  const supportGroup = String(r.support_group || "—");

  return (
    <RefreshOverlay isRefreshing={isRefreshing}>
      <div
        style={{
          background: "var(--card, #fff)",
          border: "1px solid var(--line, #E3E6EB)",
          borderRadius: 10,
          padding: "10px 16px",
          boxShadow: "var(--shadow, 0 1px 2px rgba(26,36,64,.05))",
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0 }}>
          <span style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, color: "var(--ink, #1A2440)" }}>
            {appci.toUpperCase()}
          </span>
          <span style={{ fontSize: 13, color: "var(--ink, #1A2440)" }}>{name}</span>
        </div>
        <div style={{ width: 1, height: 26, background: "var(--line, #E3E6EB)", flexShrink: 0 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <Chip label="Tier" value={criticality} valueColor={getCriticalityColor(criticality)} />
          <Chip label="Status" value={status} valueColor={getStatusColor(status)} />
          <Chip label="MD" value={director} />
          <Chip label="Owner" value={owner} />
          <Chip label="Support" value={supportGroup} />
        </div>
        {lookupError && !fallbackData?.records?.length && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink-2, #6F747F)" }}>
            CMDB lookup unavailable — showing data from ServiceNow import
          </span>
        )}
      </div>
    </RefreshOverlay>
  );
};
