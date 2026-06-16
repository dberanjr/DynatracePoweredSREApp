import React, { useRef } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Paragraph } from "@dynatrace/strato-components/typography";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { RefreshOverlay } from "./RefreshOverlay";

interface Props {
  appCI: string;
}

function getCriticalityColor(criticality: string): string {
  const c = criticality.toLowerCase();
  if (c.includes("1") || c.includes("most critical")) return "#b91c1c";
  if (c.includes("2") || c.includes("high")) return "#c2410c";
  if (c.includes("3") || c.includes("moderate")) return "#a16207";
  if (c.includes("4") || c.includes("low")) return "#15803d";
  return "#6b7280";
}

function getStatusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("production")) return "#166534";
  if (s.includes("implementation")) return "#1d4ed8";
  if (s.includes("retired")) return "#991b1b";
  return "#6b7280";
}

function Chip({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  const bg = valueColor || "#374151";
  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      padding: "10px 14px",
      background: `linear-gradient(135deg, ${bg}, ${bg}dd)`,
      borderRadius: 8,
      display: "flex",
      flexDirection: "column",
      gap: 3,
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        color: "rgba(255,255,255,0.65)",
        letterSpacing: 0.5,
        textTransform: "uppercase",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 15,
        fontWeight: 700,
        color: "#fff",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {value || "\u2014"}
      </div>
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

export const AppContextBanner = ({ appCI }: Props) => {
  const { data: lookupData, isLoading: lookupLoading, error: lookupError } = useDql({
    query: PROFILE_LOOKUP(appCI),
  });

  const { data: fallbackData, isLoading: fallbackLoading } = useDql({
    query: lookupError ? PROFILE_FALLBACK(appCI) : "data record(skip = true) | limit 0",
  });

  const data = lookupError ? fallbackData : lookupData;
  const isLoading = lookupError ? fallbackLoading : lookupLoading;
  const error = lookupError && !fallbackData?.records?.length ? lookupError : null;

  // Cache previous profile for smooth transitions
  const cacheRef = useRef<Record<string, unknown>>({});
  const currentRecord = (data?.records?.[0] || null) as Record<string, unknown> | null;
  if (currentRecord) cacheRef.current = currentRecord;

  const hasCache = Object.keys(cacheRef.current).length > 0;
  const isRefreshing = isLoading && hasCache;
  const isFirstLoad = isLoading && !hasCache;

  if (isFirstLoad) {
    return (
      <div style={{
        background: "var(--sre-surface, #fff)",
        borderRadius: 10, padding: "12px 20px",
        border: "1px solid var(--sre-border, rgba(0,0,0,0.06))",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <ProgressCircle size="small" />
        <Paragraph style={{ fontSize: 12 }}>Loading application profile...</Paragraph>
      </div>
    );
  }

  const r = (currentRecord || cacheRef.current) as Record<string, unknown>;
  const name = String(r.name || r.ciname || "");
  const appci = String(r.applicationci || appCI);
  const criticality = String(r.business_criticality || r.tier || "\u2014");
  const status = String(r.operational_status || r.install_status || r.u_operational_status || "In Production");
  const director = String(r["managed_by.u_managing_director"] || r.app_owner_name || "\u2014");
  const owner = String(r.owned_by || r.app_owner_name || "\u2014");
  const supportGroup = String(r.support_group || r.assignment_group || r.u_support_group || "\u2014");

  return (
    <RefreshOverlay isRefreshing={isRefreshing}>
    <div style={{
      background: "var(--sre-surface, #fff)",
      borderRadius: 10,
      padding: "10px 14px",
      border: "1px solid var(--sre-border, rgba(0,0,0,0.06))",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      {/* Top row: App identity */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginBottom: 8 }}>
        <div style={{
          padding: "12px 16px",
          background: "linear-gradient(135deg, #1414D3, #1414D3dd)",
          borderRadius: 8,
          border: "3px solid #1A2440",
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.6)", letterSpacing: 0.5, textTransform: "uppercase" }}>Application</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", lineHeight: 1.3, marginTop: 3 }}>
            {name || appci.toUpperCase()}
          </div>
        </div>
        <div style={{
          padding: "12px 16px",
          background: "linear-gradient(135deg, #1414D3, #1414D3dd)",
          borderRadius: 8,
          border: "3px solid #1A2440",
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.6)", letterSpacing: 0.5, textTransform: "uppercase" }}>AppCI</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", lineHeight: 1.3, marginTop: 3 }}>
            {appci.toUpperCase()}
          </div>
        </div>
      </div>
      {/* Bottom row: Details */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
        <Chip label="Criticality" value={criticality} valueColor={getCriticalityColor(criticality)} />
        <Chip label="Status" value={status} valueColor={getStatusColor(status)} />
        <Chip label="Managing Director" value={director} />
        <Chip label="Owner" value={owner} />
        <Chip label="Support Group" value={supportGroup} />
      </div>
      {error && (
        <div style={{ fontSize: 10, color: "rgba(0,0,0,0.3)", marginTop: 6, paddingLeft: 14 }}>
          CMDB lookup unavailable — showing data from ServiceNow import
        </div>
      )}
    </div>
    </RefreshOverlay>
  );
};
