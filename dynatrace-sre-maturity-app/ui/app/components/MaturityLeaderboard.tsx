import React, { useMemo, useEffect } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { useDqlWithCache } from "../hooks/useDqlWithCache";

// ── Bulk L1 query: per-app observability signals (matches scorecard L1 logic) ──
// Checks: hosts, services, logs, smartscape(=services), k8s, rum/synthetics → 6 max
const BULK_L1_QUERY = `fetch dt.entity.service
| fieldsAdd applicationci = arrayDistinct(
    iCollectArray(
      splitString(
        arrayRemoveNulls(
          iCollectArray(
            if(matchesPhrase(tags[], "*applicationci*"), lower(tags[]))
          )
        )[], ":"
      )[1]
    )
  )
| fieldsAdd applicationci = arrayDistinct(
    iCollectArray(splitString(applicationci[], ",")[0])
  )
| expand applicationci
| filter stringLength(applicationci) <= 3
| summarize serviceCount = count(), by:{applicationci}
| lookup [
    fetch dt.entity.host
    | limit 100000
    | filter lifetime[end] > asTimestamp(now()-2h)
    | fieldsAdd applicationci = arrayDistinct(
        iCollectArray(
          splitString(
            arrayRemoveNulls(
              iCollectArray(
                if(matchesPhrase(tags[], "*applicationci*"), lower(tags[]))
              )
            )[], ":"
          )[1]
        )
      )
    | fieldsAdd applicationci = arrayDistinct(
        iCollectArray(splitString(applicationci[], ",")[0])
      )
    | expand applicationci
    | summarize
        hostCount = count(),
        fullStackCount = countIf(monitoringMode == "FULL_STACK"),
        by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{hostCount, fullStackCount}
| lookup [
    fetch dt.entity.cloud_application
    | fieldsAdd applicationci = arrayDistinct(
        iCollectArray(
          splitString(
            arrayRemoveNulls(
              iCollectArray(
                if(matchesPhrase(tags[], "*applicationci*"), lower(tags[]))
              )
            )[], ":"
          )[1]
        )
      )
    | fieldsAdd applicationci = arrayDistinct(
        iCollectArray(splitString(applicationci[], ",")[0])
      )
    | expand applicationci
    | summarize k8sCount = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{k8sCount}
| lookup [
    fetch logs, samplingRatio:1000
    | filter isNotNull(applicationci)
    | summarize logCount = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{logCount}
| fieldsAdd
    hostCount = if(isNull(hostCount), 0, else: hostCount),
    serviceCount = if(isNull(serviceCount), 0, else: serviceCount),
    k8sCount = if(isNull(k8sCount), 0, else: k8sCount),
    logCount = if(isNull(logCount), 0, else: logCount)
| fieldsAdd l1Score =
    if(hostCount > 0, 1, else: 0)
    + if(serviceCount > 0, 1, else: 0)
    + if(logCount > 0, 1, else: 0)
    + if(serviceCount > 0, 1, else: 0)
    + if(k8sCount > 0, 1, else: 0)
    + 0
| fields applicationci, l1Score, serviceCount, hostCount, k8sCount, logCount`;

// ── Bulk L2: per-app measured reliability signals ──
// Checks: golden signals(=services>0), SLOs(0), error budget(0), dashboards, SRE assessment → 5 max
const BULK_L2_QUERY = `fetch dt.entity.service
| fieldsAdd applicationci = arrayDistinct(
    iCollectArray(
      splitString(
        arrayRemoveNulls(
          iCollectArray(
            if(matchesPhrase(tags[], "*applicationci*"), lower(tags[]))
          )
        )[], ":"
      )[1]
    )
  )
| fieldsAdd applicationci = arrayDistinct(
    iCollectArray(splitString(applicationci[], ",")[0])
  )
| expand applicationci
| filter stringLength(applicationci) <= 3
| summarize serviceCount = count(), by:{applicationci}
| lookup [
    fetch bizevents, from:now()-24h
    | filter event.type == "workflow.summary.dashboard"
    | fieldsAdd dashAppci = lower(splitString(name, " :")[0])
    | filter isNotNull(dashAppci)
    | filter stringLength(dashAppci) <= 3
    | summarize dashboardCount = count(), by:{dashAppci}
    | fieldsRename applicationci = dashAppci
  ], sourceField:applicationci, lookupField:applicationci, fields:{dashboardCount}
| lookup [
    fetch bizevents, from:now()-24h
    | filter event.type == "workflow.import.servicenow.appci"
    | fieldsAdd applicationci = lower(applicationci)
    | filter isNotNull(tier)
    | summarize hasTier = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{hasTier}
| fieldsAdd
    dashboardCount = if(isNull(dashboardCount), 0, else: dashboardCount),
    hasTier = if(isNull(hasTier), 0, else: hasTier)
| fieldsAdd l2Score =
    if(serviceCount > 0, 1, else: 0)
    + 0 + 0
    + if(dashboardCount > 0, 1, else: 0)
    + if(hasTier > 0, 1, else: 0)
| fields applicationci, l2Score`;

// ── Bulk L3: per-app AI ops signals (simplified — needs davis auth for full) ──
// Max 5 checks; without davis we check what we can
const BULK_L3_QUERY = `fetch bizevents, from:now()-24h
| filter event.type == "workflow.import.servicenow.appci"
| fieldsAdd applicationci = lower(applicationci)
| filter isNotNull(applicationci)
| filter stringLength(applicationci) <= 3
| dedup applicationci
| fieldsAdd l3Score = 0
| fields applicationci, l3Score`;

// ── Bulk L4: per-app proactive signals ──
// Checks: resource alerts(1), scaling metrics, k8s, predictive(0), cloud capacity, deploys, release(0), dashboards(0), budget(0) → 9 max
const BULK_L4_QUERY = `fetch dt.entity.service
| fieldsAdd applicationci = arrayDistinct(
    iCollectArray(
      splitString(
        arrayRemoveNulls(
          iCollectArray(
            if(matchesPhrase(tags[], "*applicationci*"), lower(tags[]))
          )
        )[], ":"
      )[1]
    )
  )
| fieldsAdd applicationci = arrayDistinct(
    iCollectArray(splitString(applicationci[], ",")[0])
  )
| expand applicationci
| filter stringLength(applicationci) <= 3
| summarize svcCount = count(), by:{applicationci}
| lookup [
    fetch dt.entity.cloud_application
    | fieldsAdd applicationci = arrayDistinct(
        iCollectArray(
          splitString(
            arrayRemoveNulls(
              iCollectArray(
                if(matchesPhrase(tags[], "*applicationci*"), lower(tags[]))
              )
            )[], ":"
          )[1]
        )
      )
    | fieldsAdd applicationci = arrayDistinct(
        iCollectArray(splitString(applicationci[], ",")[0])
      )
    | expand applicationci
    | summarize k8sCount = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{k8sCount}
| lookup [
    fetch events, from:now()-7d
    | filter event.kind == "DAVIS_EVENT"
    | filter event.type == "CUSTOM_DEPLOYMENT"
    | expand affected_entity_tags
    | parse affected_entity_tags, "'applicationci:' LD:appci"
    | filter isNotNull(appci)
    | fieldsAdd applicationci = lower(appci)
    | summarize deployCount = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{deployCount}
| lookup [
    fetch bizevents, from:now()-24h
    | filter event.type == "workflow.summary.cloud.aws"
    | summarize awsTotal = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{awsTotal}
| fieldsAdd
    k8sCount = if(isNull(k8sCount), 0, else: k8sCount),
    deployCount = if(isNull(deployCount), 0, else: deployCount),
    awsTotal = if(isNull(awsTotal), 0, else: awsTotal)
| fieldsAdd l4Score =
    1
    + if(awsTotal > 0, 1, else: 0)
    + if(k8sCount > 0, 1, else: 0)
    + 0
    + if(awsTotal > 0, 1, else: 0)
    + if(deployCount > 0, 1, else: 0)
    + 0 + 0 + 0
| fields applicationci, l4Score`;

// ── Bulk L5: per-app autonomous signals ──
// Max 5 checks
const BULK_L5_QUERY = `fetch bizevents, from:now()-7d
| filter contains(event.type, "workflow")
| filter isNotNull(applicationci)
| fieldsAdd applicationci = lower(applicationci)
| filter stringLength(applicationci) <= 3
| summarize workflowCount = count(), by:{applicationci}
| fieldsAdd l5Score =
    if(workflowCount > 0, 1, else: 0)
    + if(workflowCount > 0, 1, else: 0)
    + 0 + 0 + 0
| fields applicationci, l5Score`;

// ── CMDB info ──
// Primary: CMDB lookup table
const CMDB_LOOKUP_QUERY = `load "/lookups/dynatrace/cmdb_appci_owner_mapping"
| fieldsAdd appci = lower(applicationci)
| fields appci, ciname = name, tier = business_criticality, app_owner_name = owned_by`;

// Fallback: bizevents ServiceNow import
const CMDB_FALLBACK_QUERY = `fetch bizevents, from:now()-48h
| filter event.type == "workflow.import.servicenow.appci"
| fieldsAdd appci = lower(applicationci)
| filter isNotNull(appci)
| filter stringLength(appci) <= 3
| sort timestamp desc
| dedup appci
| fields appci, ciname, tier, app_owner_name`;

// ── Pillar config (must match scorecard max values) ──
const pillarDefs = [
  { key: "l1", label: "Observe", color: "#3BACF0", max: 6 },
  { key: "l2", label: "Measure", color: "#1966FF", max: 5 },
  { key: "l3", label: "AI Ops", color: "#5E28E5", max: 5 },
  { key: "l4", label: "Proactive", color: "#8D1CDC", max: 9 },
  { key: "l5", label: "Auto", color: "#49C2B3", max: 5 },
];
const TOTAL_MAX = pillarDefs.reduce((s, p) => s + p.max, 0); // 30

interface AppScore {
  appci: string;
  name: string;
  tier: string;
  owner: string;
  l1: number; l2: number; l3: number; l4: number; l5: number;
  total: number;
  pct: number;
}

// ── Visual components ──

function MiniRing({ score, max, color }: { score: number; max: number; color: string }) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  const size = 52;
  const sw = 5;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <Flex flexDirection="column" alignItems="center" className="sre-mini-ring" style={{ width: 64 }}>
      <div className="sre-mini-ring-donut" style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={sw} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset 0.6s ease" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 800, color }}>{score}/{max}</span>
        </div>
      </div>
      {/* Compact text fallback — shown when donut is hidden */}
      <span className="sre-mini-ring-compact" style={{ display: "none", fontSize: 13, fontWeight: 800, color, textAlign: "center" }}>{score}/{max}</span>
      <span className="sre-mini-ring-pct" style={{ fontSize: 9, fontWeight: 700, color, marginTop: 2 }}>{Math.round(pct)}%</span>
    </Flex>
  );
}

function OverallBar({ pct, color }: { pct: number; color: string }) {
  return (
    <Flex alignItems="center" gap={6} style={{ minWidth: 90 }}>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 4,
          background: `linear-gradient(90deg, ${color}, ${color}cc)`, transition: "width 0.8s ease" }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 800, color, minWidth: 34, textAlign: "right" }}>{pct}%</span>
    </Flex>
  );
}

function getGradeColor(pct: number): string {
  if (pct >= 80) return "#49C2B3";
  if (pct >= 60) return "#49C2B3";
  if (pct >= 40) return "#C93FDB";
  if (pct >= 20) return "#8D1CDC";
  return "#dc3545";
}

function getMaturityLevel(pct: number): { level: string; label: string; color: string } {
  if (pct >= 80) return { level: "L5", label: "Autonomous", color: "#49C2B3" };
  if (pct >= 65) return { level: "L4", label: "Proactive", color: "#8D1CDC" };
  if (pct >= 50) return { level: "L3", label: "AI-Assisted", color: "#5E28E5" };
  if (pct >= 30) return { level: "L2", label: "Measured", color: "#1966FF" };
  return { level: "L1", label: "Observe", color: "#3BACF0" };
}

function getRankDisplay(i: number): string {
  if (i === 0) return "\ud83e\udd47";
  if (i === 1) return "\ud83e\udd48";
  if (i === 2) return "\ud83e\udd49";
  return String(i + 1);
}

function TierMaturityBar({ tier, pct, count, color }: { tier: string; pct: number; count: number; color: string }) {
  return (
    <div style={{ flex: 1, minWidth: 140 }}>
      <Flex justifyContent="space-between" alignItems="baseline" style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{tier}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{count} apps</span>
      </Flex>
      <div style={{ height: 10, borderRadius: 5, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 5,
          background: `linear-gradient(90deg, ${color}, ${color}cc)`, transition: "width 0.8s ease" }} />
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color, marginTop: 4, textAlign: "center" }}>{pct}%</div>
    </div>
  );
}

// ── Main component ──

export interface TierMaturityData {
  tier: string;
  count: number;
  pct: number;
  color: string;
}

export const MaturityLeaderboard = ({ onTierData }: { onTierData?: (data: TierMaturityData[], enterprisePct: number) => void }) => {
  const { data: l1Data, isLoading: l1L } = useDqlWithCache({ query: BULK_L1_QUERY });
  const { data: l2Data, isLoading: l2L } = useDqlWithCache({ query: BULK_L2_QUERY });
  const { data: l3Data, isLoading: l3L } = useDqlWithCache({ query: BULK_L3_QUERY });
  const { data: l4Data, isLoading: l4L } = useDqlWithCache({ query: BULK_L4_QUERY });
  const { data: l5Data, isLoading: l5L } = useDqlWithCache({ query: BULK_L5_QUERY });
  const { data: cmdbLookupData, isLoading: cmdbLookupL, error: cmdbLookupErr } = useDql({ query: CMDB_LOOKUP_QUERY });
  const { data: cmdbFallbackData, isLoading: cmdbFallbackL } = useDql({
    query: cmdbLookupErr ? CMDB_FALLBACK_QUERY : "data record(skip = true) | limit 0",
  });

  const cmdbData = cmdbLookupErr ? cmdbFallbackData : cmdbLookupData;
  const cmdbL = cmdbLookupErr ? cmdbFallbackL : cmdbLookupL;

  const loading = l1L || l2L || l3L || l4L || l5L || cmdbL;

  const { scores, tierMaturity, enterprisePct } = useMemo(() => {
    if (!l1Data?.records) return { scores: [], tierMaturity: [], enterprisePct: 0 };

    // Build lookup maps
    const makeMap = (records: Record<string, unknown>[] | undefined, scoreKey: string) => {
      const m = new Map<string, number>();
      (records || []).forEach((r) => m.set(String(r.applicationci), Number(r[scoreKey] || 0)));
      return m;
    };
    const l1Map = makeMap(l1Data.records as Record<string, unknown>[], "l1Score");
    const l2Map = makeMap(l2Data?.records as Record<string, unknown>[] | undefined, "l2Score");
    const l3Map = makeMap(l3Data?.records as Record<string, unknown>[] | undefined, "l3Score");
    const l4Map = makeMap(l4Data?.records as Record<string, unknown>[] | undefined, "l4Score");
    const l5Map = makeMap(l5Data?.records as Record<string, unknown>[] | undefined, "l5Score");

    const cmdbMap = new Map<string, Record<string, unknown>>();
    ((cmdbData?.records || []) as Record<string, unknown>[]).forEach((r) => {
      cmdbMap.set(String(r.appci), r);
    });

    // All unique appCIs from L1
    const allApps: AppScore[] = Array.from(l1Map.entries()).map(([appci, l1]) => {
      const l2 = l2Map.get(appci) || 0;
      const l3 = l3Map.get(appci) || 0;
      const l4 = l4Map.get(appci) || 0;
      const l5 = l5Map.get(appci) || 0;
      const total = l1 + l2 + l3 + l4 + l5;
      const pct = Math.round((total / TOTAL_MAX) * 100);
      const cmdb = cmdbMap.get(appci);
      return {
        appci,
        name: String(cmdb?.ciname || ""),
        tier: String(cmdb?.tier || ""),
        owner: String(cmdb?.app_owner_name || ""),
        l1, l2, l3, l4, l5, total, pct,
      };
    });

    // Enterprise maturity by tier
    const tierAgg: Record<string, { sum: number; count: number }> = {};
    allApps.forEach((a) => {
      const t = a.tier || "Unknown";
      if (!tierAgg[t]) tierAgg[t] = { sum: 0, count: 0 };
      tierAgg[t].sum += a.pct;
      tierAgg[t].count += 1;
    });
    const tierColors: Record<string, string> = {
      "1 - most critical": "#C93FDB", "2 - somewhat critical": "#8D1CDC",
      "3 - less critical": "#5E28E5", "4 - not critical": "#49C2B3",
    };
    const tierMaturity = Object.entries(tierAgg)
      .filter(([t]) => t !== "Unknown" && t !== "")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tier, d]) => ({ tier, count: d.count, pct: Math.round(d.sum / d.count), color: tierColors[tier.toLowerCase()] || "#6F747F" }));

    // Enterprise maturity level based on Tier 1 & 2 apps only
    const tier12Apps = allApps.filter((a) => {
      const t = a.tier.toLowerCase();
      return t.includes("1") || t.includes("2") || t.includes("most critical") || t.includes("somewhat critical");
    });
    const enterprisePct = tier12Apps.length > 0 ? Math.round(tier12Apps.reduce((s, a) => s + a.pct, 0) / tier12Apps.length) : 0;

    const top25 = allApps.sort((a, b) => b.pct - a.pct || b.total - a.total).slice(0, 25);
    return { scores: top25, tierMaturity, enterprisePct };
  }, [l1Data, l2Data, l3Data, l4Data, l5Data, cmdbData]);

  useEffect(() => {
    if (onTierData && tierMaturity.length > 0) {
      onTierData(tierMaturity, enterprisePct);
    }
  }, [tierMaturity, enterprisePct, onTierData]);

  if (loading) {
    return (
      <div style={{ background: "linear-gradient(135deg, #1A2440, #1A2440)", borderRadius: 16, padding: 32,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <ProgressCircle size="small" />
        <Paragraph style={{ color: "rgba(255,255,255,0.7)" }}>Computing maturity scores across all applications...</Paragraph>
      </div>
    );
  }

  const eColor = getGradeColor(enterprisePct);

  return (
    <Flex flexDirection="column" gap={20}>
      {/* Enterprise Summary */}
      <div style={{ background: "linear-gradient(135deg, #1A2440 0%, #1A2440 100%)", borderRadius: 16,
        padding: "28px 32px", boxShadow: "0 4px 24px rgba(0,0,0,0.12)" }}>
        <div className="sre-enterprise-summary">
          <div className="sre-enterprise-left">
            {/* Maturity Level */}
            <Flex flexDirection="column" alignItems="center" gap={4}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.35)", letterSpacing: 1 }}>MATURITY LEVEL</span>
              <span className="sre-level-value" style={{
                fontSize: 64, fontWeight: 900, lineHeight: 1,
                color: eColor,
                textShadow: `0 0 30px ${eColor}40`,
              }}>
                {enterprisePct >= 80 ? "L5" : enterprisePct >= 65 ? "L4" : enterprisePct >= 50 ? "L3" : enterprisePct >= 30 ? "L2" : "L1"}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                color: eColor, opacity: 0.8,
              }}>
                {enterprisePct >= 80 ? "Autonomous" : enterprisePct >= 65 ? "Proactive" : enterprisePct >= 50 ? "AI-Assisted" : enterprisePct >= 30 ? "Measured" : "Observability"}
              </span>
              <span style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>(Tier 1-2 apps only)</span>
            </Flex>

            {/* Divider */}
            <div style={{ width: 1, height: 80, background: "rgba(255,255,255,0.1)" }} />

            {/* Percentage */}
            <Flex flexDirection="column" alignItems="center" gap={4}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.35)", letterSpacing: 1 }}>ENTERPRISE SCORE</span>
              <span className="sre-score-value" style={{ fontSize: 52, fontWeight: 900, color: eColor, lineHeight: 1 }}>{enterprisePct}%</span>
              <div style={{ width: 120, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 4 }}>
                <div style={{ height: "100%", width: `${enterprisePct}%`, borderRadius: 3, background: eColor, transition: "width 0.8s ease" }} />
              </div>
            </Flex>
          </div>
          <div className="sre-enterprise-tiers">
            <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.35)", letterSpacing: 1, marginBottom: 12 }}>MATURITY BY BUSINESS CRITICALITY</div>
            <div className="sre-tier-grid">
              {tierMaturity.map((t) => <TierMaturityBar key={t.tier} {...t} />)}
            </div>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div style={{ background: "var(--sre-surface, #fff)", borderRadius: 16,
        border: "1px solid var(--sre-border)", overflow: "hidden", boxShadow: "0 2px 12px var(--sre-card-shadow)" }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, #49C2B3, #1966FF, #5E28E5, #8D1CDC)",
          padding: "16px 28px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#fff" }}>SRE Maturity Leaders</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>Top 25 Applications at United Airlines</div>
          </div>
          <div style={{ fontSize: 28 }}>{"\ud83c\udfc6"}</div>
        </div>

        {/* Column headers */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "32px 2fr 1fr 1fr 1fr 1fr 1fr 1fr 1.2fr",
          padding: "8px 20px",
          borderBottom: "2px solid var(--sre-border)",
          gap: 6,
          alignItems: "center",
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--sre-text-secondary)" }}>#</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--sre-text-secondary)" }}>APPLICATION</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--sre-text-secondary)", textAlign: "center" }}>LEVEL</span>
          {pillarDefs.map((p) => (
            <span key={p.key} style={{ fontSize: 9, fontWeight: 800, color: p.color, textAlign: "center" }}>{p.label}</span>
          ))}
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--sre-text-secondary)", textAlign: "right" }}>OVERALL</span>
        </div>

        {/* Rows */}
        <div style={{ maxHeight: 750, overflowY: "auto" }}>
          {scores.map((app, i) => {
            const gc = getGradeColor(app.pct);
            const ml = getMaturityLevel(app.pct);
            const isTop3 = i < 3;

            return (
              <div key={app.appci} style={{
                display: "grid",
                gridTemplateColumns: "32px 2fr 1fr 1fr 1fr 1fr 1fr 1fr 1.2fr",
                padding: "10px 20px",
                gap: 6,
                alignItems: "center",
                borderBottom: "1px solid var(--sre-border)",
                background: isTop3 ? `${gc}08` : i % 2 === 0 ? "transparent" : "var(--sre-table-stripe)",
              }}>
                {/* Rank */}
                <span style={{ fontSize: isTop3 ? 18 : 13, fontWeight: 800, color: isTop3 ? gc : "var(--sre-text-secondary)" }}>
                  {getRankDisplay(i)}
                </span>

                {/* App info — 4 lines: name, appci, tier, owner */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#1414D3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {app.name || app.appci.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--sre-text-secondary)", lineHeight: 1.4, marginTop: 1 }}>
                    <span style={{ fontWeight: 700 }}>{app.appci.toUpperCase()}</span>
                    {app.tier ? <span> &middot; {app.tier}</span> : ""}
                    {app.owner ? <span> &middot; {app.owner}</span> : ""}
                  </div>
                </div>

                {/* Level badge */}
                <div style={{ textAlign: "center" }}>
                  <div style={{
                    display: "inline-flex", flexDirection: "column", alignItems: "center",
                    padding: "4px 8px", borderRadius: 8,
                    background: `${ml.color}10`, border: `1px solid ${ml.color}25`,
                  }}>
                    <span style={{ fontSize: 16, fontWeight: 900, color: ml.color, lineHeight: 1 }}>{ml.level}</span>
                    <span style={{ fontSize: 7, fontWeight: 700, color: ml.color, opacity: 0.7, letterSpacing: 0.3, marginTop: 1 }}>{ml.label.toUpperCase()}</span>
                  </div>
                </div>

                {/* Pillar mini rings */}
                {pillarDefs.map((p) => (
                  <MiniRing key={p.key} score={(app as any)[p.key]} max={p.max} color={p.color} />
                ))}

                {/* Overall */}
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 20, fontWeight: 900, color: gc }}>{app.pct}%</span>
                  <div className="sre-overall-bar" style={{ width: "100%", height: 4, borderRadius: 2, background: "var(--sre-card-bg, rgba(0,0,0,0.06))", marginTop: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${app.pct}%`, borderRadius: 2, background: gc, transition: "width 0.8s" }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Flex>
  );
};
