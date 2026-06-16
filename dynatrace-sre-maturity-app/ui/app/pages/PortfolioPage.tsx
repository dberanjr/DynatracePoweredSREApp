import React, { useState, useCallback } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { useDqlWithCache } from "../hooks/useDqlWithCache";
import { MaturityLeaderboard, TierMaturityData } from "../components/MaturityLeaderboard";

// --- Styled components ---

function TierBadge({ tier }: { tier: string }) {
  const t = String(tier).toLowerCase();
  let color = "#6b7280";
  let bg = "rgba(107,114,128,0.1)";
  if (t.includes("1") || t.includes("critical")) { color = "#b91c1c"; bg = "rgba(185,28,28,0.08)"; }
  else if (t.includes("2") || t.includes("high")) { color = "#c2410c"; bg = "rgba(194,65,12,0.08)"; }
  else if (t.includes("3") || t.includes("moderate")) { color = "#a16207"; bg = "rgba(161,98,7,0.08)"; }
  else if (t.includes("4") || t.includes("low")) { color = "#15803d"; bg = "rgba(21,128,61,0.08)"; }

  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      color,
      background: bg,
      whiteSpace: "nowrap",
    }}>
      {tier || "—"}
    </span>
  );
}

function ServiceBar({ count, max }: { count: number; max: number }) {
  const pct = max > 0 ? Math.min((count / max) * 100, 100) : 0;
  return (
    <Flex alignItems="center" gap={8} style={{ minWidth: 120 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          borderRadius: 3,
          background: "linear-gradient(90deg, #3BACF0, #1966FF)",
          transition: "width 0.6s ease",
        }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: "#3BACF0", minWidth: 32, textAlign: "right" }}>
        {count}
      </span>
    </Flex>
  );
}

// --- Summary banner ---

function getMaturityLevel(pct: number): { level: string; label: string; color: string } {
  if (pct >= 80) return { level: "L5", label: "Autonomous", color: "#49C2B3" };
  if (pct >= 65) return { level: "L4", label: "Proactive", color: "#8D1CDC" };
  if (pct >= 50) return { level: "L3", label: "AI-Assisted", color: "#5E28E5" };
  if (pct >= 30) return { level: "L2", label: "Measured", color: "#1966FF" };
  return { level: "L1", label: "Observe", color: "#3BACF0" };
}

interface TierInfo {
  tier: string;
  count: number;
  avgServices: number;
  maturityPct: number;
}

function PortfolioSummary({
  totalApps,
  tierInfo,
}: {
  totalApps: number;
  tierInfo: TierInfo[];
}) {
  return (
    <div style={{
      background: "linear-gradient(135deg, #1A2440 0%, #1A2440 100%)",
      borderRadius: 16,
      padding: "24px 32px",
      boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
    }}>
      <div className="sre-enterprise-summary">
        {/* Total apps */}
        <div className="sre-enterprise-left">
          <Flex flexDirection="column" alignItems="center" gap={4}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.35)", letterSpacing: 1 }}>TOTAL</span>
            <span className="sre-level-value" style={{ fontSize: 48, fontWeight: 900, color: "#3BACF0", lineHeight: 1 }}>
              {totalApps}
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.35)", letterSpacing: 1 }}>
              APPLICATIONS
            </span>
          </Flex>
        </div>

        {/* Tier cards */}
        <div className="sre-enterprise-tiers">
          <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.35)", letterSpacing: 1, marginBottom: 10 }}>APPS BY BUSINESS CRITICALITY</div>
          <div className="sre-tier-grid">
          {tierInfo.map((t) => {
            const ml = getMaturityLevel(t.maturityPct);
            const tierColors: Record<string, string> = {
              "1 - most critical": "#C93FDB",
              "2 - somewhat critical": "#8D1CDC",
              "3 - less critical": "#5E28E5",
              "4 - not critical": "#49C2B3",
            };
            const tierColor = tierColors[t.tier.toLowerCase()] || "#6F747F";

            return (
              <div key={t.tier} style={{
                background: "rgba(255,255,255,0.04)",
                borderRadius: 10,
                padding: "12px 14px",
                border: `1px solid ${tierColor}25`,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}>
                {/* Maturity level */}
                <div style={{ flexShrink: 0, textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: ml.color, lineHeight: 1, textShadow: `0 0 10px ${ml.color}30` }}>
                    {ml.level}
                  </div>
                  <div style={{ fontSize: 7, fontWeight: 700, color: ml.color, opacity: 0.7, letterSpacing: 0.3, marginTop: 2 }}>
                    {ml.label.toUpperCase()}
                  </div>
                </div>

                {/* Tier info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: tierColor, lineHeight: 1 }}>
                    {t.count}
                  </div>
                  <div style={{
                    fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.45)",
                    lineHeight: 1.2, marginTop: 3,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {t.tier}
                  </div>
                  {/* Mini maturity bar */}
                  <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", marginTop: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${t.maturityPct}%`, borderRadius: 2, background: ml.color, transition: "width 0.8s" }} />
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Main page ---

export const PortfolioPage = () => {
  const appInventoryQuery = `fetch dt.entity.service
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter isNotNull(appci)
| fieldsAdd appci = upper(appci)
| filter stringLength(appci) <= 3
| dedup appci, id
| summarize serviceCount = count(),
    by:{appci}
| lookup [
    fetch bizevents, from:now()-48h
    | filter event.type == "workflow.import.servicenow.appci"
    | fieldsAdd applicationci = upper(applicationci)
    | sort timestamp desc
    | dedup applicationci
    | fields applicationci, ciname, tier, app_owner_name
  ], sourceField:appci, lookupField:applicationci, prefix:"cmdb."
| fields
    AppCI = appci,
    Name = \`cmdb.ciname\`,
    Tier = \`cmdb.tier\`,
    Owner = \`cmdb.app_owner_name\`,
    Services = serviceCount
| sort AppCI asc`;


  const { data: inventoryData, isLoading: invLoading } = useDqlWithCache({ query: appInventoryQuery });

  const invRecords = (inventoryData?.records || []) as Record<string, unknown>[];

  // Derive tier breakdown with maturity estimate from inventory data
  const tierAgg: Record<string, { count: number; totalServices: number }> = {};
  invRecords.forEach((r) => {
    const tier = String(r.Tier || "Unknown");
    if (!tierAgg[tier]) tierAgg[tier] = { count: 0, totalServices: 0 };
    tierAgg[tier].count += 1;
    tierAgg[tier].totalServices += Number(r.Services || 0);
  });

  // Estimate maturity % per tier based on avg service coverage (proxy)
  // Apps with more services tend to be better instrumented
  const maxAvgSvc = Math.max(...Object.values(tierAgg).map((t) => t.count > 0 ? t.totalServices / t.count : 0), 1);
  const tierInfo: TierInfo[] = Object.entries(tierAgg)
    .filter(([t]) => t !== "Unknown" && t !== "" && t !== "null")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tier, data]) => ({
      tier,
      count: data.count,
      avgServices: data.count > 0 ? Math.round(data.totalServices / data.count) : 0,
          maturityPct: 0, // Will be updated from leaderboard real data
    }));

  const totalApps = invRecords.length;
  const maxServices = invRecords.reduce((m, r) => Math.max(m, Number(r.Services || 0)), 1);

  // Real maturity data from leaderboard
  const [realTierMaturity, setRealTierMaturity] = useState<TierMaturityData[]>([]);
  const handleTierData = useCallback((data: TierMaturityData[]) => {
    setRealTierMaturity(data);
  }, []);

  // Merge real maturity pct into tierInfo
  const enrichedTierInfo = tierInfo.map((t) => {
    const real = realTierMaturity.find((r) => r.tier.toLowerCase() === t.tier.toLowerCase());
    return { ...t, maturityPct: real ? real.pct : t.maturityPct };
  });

  const anyLoading = invLoading;

  return (
    <Flex flexDirection="column" gap={20} padding={16}>
      <Heading level={3}>Portfolio View — All Applications</Heading>

      {/* Summary banner */}
      {anyLoading ? (
        <div style={{
          background: "linear-gradient(135deg, #1A2440 0%, #1A2440 100%)",
          borderRadius: 16,
          padding: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
        }}>
          <ProgressCircle size="small" />
          <Paragraph style={{ color: "rgba(255,255,255,0.7)" }}>Loading portfolio data...</Paragraph>
        </div>
      ) : (
        <PortfolioSummary totalApps={totalApps} tierInfo={enrichedTierInfo} />
      )}

      {/* SRE Maturity Leaderboard */}
      <MaturityLeaderboard onTierData={handleTierData} />

      {/* Full inventory table */}
      <div style={{
        background: "var(--sre-surface, #fff)",
        borderRadius: 12,
        border: "1px solid var(--sre-border, rgba(0,0,0,0.08))",
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <div style={{
          background: "linear-gradient(135deg, #5E28E5, #3BACF0)",
          padding: "14px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <Heading level={5} style={{ color: "#fff", margin: 0 }}>Application Inventory</Heading>
          {!invLoading && (
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>
              {totalApps} applications
            </span>
          )}
        </div>
        <div style={{ maxHeight: 500, overflowY: "auto" }}>
          {invLoading ? (
            <div style={{ padding: 24 }}><ProgressCircle /></div>
          ) : invRecords.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["AppCI", "Name", "Tier", "Owner", "Services"].map((col) => (
                    <th key={col} style={{
                      textAlign: "left",
                      padding: "10px 14px",
                      borderBottom: "2px solid var(--sre-table-border)",
                      fontWeight: 600,
                      fontSize: 11,
                      letterSpacing: 0.5,
                      color: "var(--sre-text-secondary, rgba(0,0,0,0.5))",
                      textTransform: "uppercase",
                      position: "sticky" as const,
                      top: 0,
                      background: "var(--sre-surface, #fff)",
                      zIndex: 1,
                    }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invRecords.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "var(--sre-table-stripe)" }}>
                    <td style={{ padding: "8px 14px", borderBottom: "1px solid var(--sre-table-border)", fontWeight: 700, color: "#1414D3" }}>
                      {String(row.AppCI || "—")}
                    </td>
                    <td style={{ padding: "8px 14px", borderBottom: "1px solid var(--sre-table-border)", fontWeight: 600, color: "#1414D3" }}>
                      {String(row.Name || "—")}
                    </td>
                    <td style={{ padding: "8px 14px", borderBottom: "1px solid var(--sre-table-border)" }}>
                      <TierBadge tier={String(row.Tier || "")} />
                    </td>
                    <td style={{ padding: "8px 14px", borderBottom: "1px solid var(--sre-table-border)" }}>
                      {String(row.Owner || "—")}
                    </td>
                    <td style={{ padding: "8px 14px", borderBottom: "1px solid var(--sre-table-border)" }}>
                      <ServiceBar count={Number(row.Services || 0)} max={maxServices || 1} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 24 }}><Paragraph>No data available</Paragraph></div>
          )}
        </div>
      </div>
    </Flex>
  );
};
