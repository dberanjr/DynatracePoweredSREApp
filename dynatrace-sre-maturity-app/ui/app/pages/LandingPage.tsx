import React, { useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";

// Dynatrace brand palette from POTX template
const brand = {
  dark: "#1A2440",      // dk2
  gray: "#6F747F",      // lt2
  bullet: "#171C2D",    // bullet color
  cardBg: "#EBEBEB",    // shape fill
  accent1: "#49C2B3",   // teal
  accent2: "#3BACF0",   // light blue
  accent3: "#1966FF",   // blue
  accent4: "#5E28E5",   // purple
  accent5: "#8D1CDC",   // dark purple
  accent6: "#C93FDB",   // magenta
};

const pillars = [
  {
    level: "L1",
    title: "Full Observability",
    color: brand.accent2,
    icon: "\ud83d\udd2d",
    goal: "Zero blind spots across the entire application stack",
    checks: [
      "OneAgent or OpenTelemetry deployed and metrics verified",
      "Distributed tracing (PurePath) validated",
      "Logs integrated and correlated",
      "Services auto-discovered in Smartscape",
      "Kubernetes / cloud integrations enabled",
      "Frontend apps configured and synthetic monitors created",
    ],
    dynatrace: "OneAgent, PurePath, Smartscape, Log Management, Cloud Automation",
  },
  {
    level: "L2",
    title: "Measured Reliability",
    color: brand.accent3,
    icon: "\ud83d\udcca",
    goal: "Reliability becomes measurable, not anecdotal",
    checks: [
      "Golden signal SLIs defined (latency, errors, traffic, saturation)",
      "Service-level SLOs created with targets",
      "Error budget and burn rate tracking enabled",
      "SLO dashboards published by AppCI / business capability",
      "SRE assessment scores available in ARD",
    ],
    dynatrace: "SLO Management, Error Budget Tracking, Dashboards, Service Metrics",
  },
  {
    level: "L3",
    title: "AI-Assisted Operations",
    color: brand.accent4,
    icon: "\ud83e\udde0",
    goal: "Fewer false alarms, faster MTTR, data-driven decisions",
    checks: [
      "Davis AI problem detection enabled",
      "Event correlation and causal graph validated",
      "ServiceNow / BigPanda integrated with Dynatrace",
      "Runbooks linked to problems",
      "Alert noise review completed",
    ],
    dynatrace: "Davis AI, Problem Detection, Causal Graph, Workflow Integration",
  },
  {
    level: "L4",
    title: "Proactive Reliability",
    color: brand.accent5,
    icon: "\ud83d\ude80",
    goal: "Capacity problems prevented before incidents occur",
    checks: [
      "Resource saturation alerts validated",
      "Dynamic scaling metrics leveraged",
      "Kubernetes autoscaling metrics visible",
      "Davis predictive forecasting enabled",
      "Cloud capacity thresholds reviewed",
      "Deployment events integrated (CI/CD)",
      "Release impact tracking enabled (risk score)",
      "Pre/post comparison dashboards built",
      "Error budget gating defined in risk score",
    ],
    dynatrace: "Davis Predictive AI, Release Events, Cloud Cost Metrics, HPA Monitoring",
  },
  {
    level: "L5",
    title: "Autonomous Reliability",
    color: brand.accent1,
    icon: "\u2699\ufe0f",
    goal: "Engineers spend less time firefighting through automation",
    checks: [
      "Repetitive tasks identified and automation candidates selected",
      "Workflow automations created and configured",
      "End-to-end detection, remediation and validation automated",
      "50%+ of incidents enriched automatically, triage time reduced",
      "AI-augmented postmortem process enabled, linked to reliability score",
    ],
    dynatrace: "Workflow Automation, Davis CoPilot, APIs, Auto-Remediation",
  },
];

const appTabs = [
  { name: "Overview", icon: "\ud83c\udfe0", desc: "Application context, ownership, and observability signal inventory" },
  { name: "Golden Signals", icon: "\ud83d\udcca", desc: "Traffic, errors, latency (P90/P99), and per-service performance breakdown" },
  { name: "AI Ops", icon: "\ud83e\udde0", desc: "Davis event intelligence — availability, errors, slowdowns, and alert noise" },
  { name: "Proactive", icon: "\ud83d\ude80", desc: "Deployment frequency, resource contention, Kubernetes and AWS resource tracking" },
  { name: "Scorecards", icon: "\ud83c\udfc6", desc: "L1\u2013L5 maturity scorecards with pass/fail checks and overall grade" },
  { name: "Portfolio", icon: "\ud83c\udf10", desc: "Enterprise-wide maturity view, tier breakdowns, and top 25 leaderboard" },
];

const outcomes = [
  { metric: "30\u201350%", label: "Faster Incident Resolution", color: brand.accent1 },
  { metric: "40\u201360%", label: "Less Alert Noise", color: brand.accent2 },
  { metric: "Increased", label: "Application Availability", color: brand.accent3 },
  { metric: "Reduced", label: "Operational Cost", color: brand.accent6 },
];

function PillarCard({ pillar }: { pillar: typeof pillars[0] }) {
  return (
    <div style={{
      background: "var(--sre-surface, #fff)",
      borderRadius: 12,
      border: "1px solid var(--sre-border)",
      overflow: "hidden",
      boxShadow: "0 1px 3px var(--sre-card-shadow)",
    }}>
      <div style={{
        background: `linear-gradient(135deg, ${pillar.color}, ${pillar.color}cc)`,
        padding: "20px 24px",
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <span style={{ fontSize: 32 }}>{pillar.icon}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.8)", letterSpacing: 2 }}>{pillar.level}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>{pillar.title}</div>
        </div>
      </div>
      <div style={{ padding: "18px 24px" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: pillar.color, marginBottom: 14, lineHeight: 1.4 }}>{pillar.goal}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {pillar.checks.map((check, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, lineHeight: 1.4, color: "var(--sre-text-primary, #1A2440)" }}>
              <span style={{ color: pillar.color, flexShrink: 0 }}>{"\u25cf"}</span>
              {check}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, background: `${pillar.color}10`, borderLeft: `3px solid ${pillar.color}`, fontSize: 12, color: pillar.color, fontWeight: 600, lineHeight: 1.5 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, opacity: 0.7, display: "block", marginBottom: 2 }}>DYNATRACE FEATURES</span>
          {pillar.dynatrace}
        </div>
      </div>
    </div>
  );
}

// Enterprise badge — renders a hidden MaturityLeaderboard to get the exact same score
import { MaturityLeaderboard, TierMaturityData } from "../components/MaturityLeaderboard";
import { useDqlWithCache } from "../hooks/useDqlWithCache";

// Average MTTR query for all closed problems in the last 7 days
const MTTR_QUERY = `fetch dt.davis.problems, from:now()-7d
| filter event.kind == "DAVIS_PROBLEM" and dt.davis.is_duplicate == false
| filter event.status == "CLOSED"
| filter isNotNull(resolved_problem_duration)
| makeTimeseries \`MTTR\` = avg(toDouble(resolved_problem_duration) / 60000000000.0), interval:6h`;

// MTTR for the previous week (7-14 days ago) for trend comparison
const MTTR_PREV_QUERY = `fetch dt.davis.problems, from:now()-14d, to:now()-7d
| filter event.kind == "DAVIS_PROBLEM" and dt.davis.is_duplicate == false
| filter event.status == "CLOSED"
| filter isNotNull(resolved_problem_duration)
| summarize \`PrevAvg\` = avg(toDouble(resolved_problem_duration) / 60000000000.0)`;

function MttrSparkline({ color }: { color: string }) {
  const { data } = useDqlWithCache({ query: MTTR_QUERY });
  const { data: prevData } = useDqlWithCache({ query: MTTR_PREV_QUERY });

  // Previous week avg
  const prevAvg = prevData?.records?.[0]
    ? Number((prevData.records[0] as Record<string, unknown>).PrevAvg || 0)
    : 0;

  // Extract values
  let values: number[] = [];
  let avgMttr = 0;
  if (data?.records?.[0]) {
    const r = data.records[0] as Record<string, unknown>;
    for (const key of Object.keys(r)) {
      if (key === "timeframe" || key === "interval") continue;
      const v = r[key];
      if (Array.isArray(v) && v.length > 0) {
        const nums = v.map((x) => Number(x)).filter((x) => !isNaN(x) && x > 0);
        if (nums.length > 0) {
          values = v.map((x) => Number(x) || 0);
          avgMttr = nums.reduce((s, n) => s + n, 0) / nums.length;
          break;
        }
      }
    }
  }

  // Build sparkline path
  const w = 220;
  const h = 36;
  let path = "";
  let areaPath = "";
  if (values.length >= 2) {
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    const points = values.map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    });
    path = `M ${points.join(" L ")}`;
    areaPath = `M 0,${h} L ${points.join(" L ")} L ${w},${h} Z`;
  }

  // Format MTTR
  const formatMttr = (min: number): string => {
    if (min >= 60) return `${(min / 60).toFixed(1)} hr`;
    return `${min.toFixed(1)} min`;
  };

  // Trend: compare this week to last week (lower MTTR is better)
  let trendPct = 0;
  let trendIcon = "";
  let trendColor = "rgba(255,255,255,0.4)";
  if (avgMttr > 0 && prevAvg > 0) {
    trendPct = Math.round(((avgMttr - prevAvg) / prevAvg) * 100);
    if (trendPct > 5) {
      // MTTR went up = bad
      trendIcon = "\u2197";
      trendColor = "#dc3545";
    } else if (trendPct < -5) {
      // MTTR went down = good
      trendIcon = "\u2198";
      trendColor = "#49C2B3";
    }
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${color}25`, textAlign: "center" }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1.5, marginBottom: 4 }}>
        AVG MTTR (LAST 7 DAYS)
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 8 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1, textShadow: `0 0 16px ${color}40` }}>
          {avgMttr > 0 ? formatMttr(avgMttr) : "—"}
        </div>
        {trendIcon && (
          <div style={{ fontSize: 12, fontWeight: 800, color: trendColor, display: "flex", alignItems: "center", gap: 2 }}>
            <span>{trendIcon}</span>
            <span>{Math.abs(trendPct)}%</span>
          </div>
        )}
      </div>
      {prevAvg > 0 && (
        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>
          vs {formatMttr(prevAvg)} prev week
        </div>
      )}
      {values.length >= 2 && (
        <div style={{ marginTop: 6 }}>
          <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block", width: "100%", maxWidth: w, margin: "0 auto" }}>
            <defs>
              <linearGradient id={`mttr-grad-${color.replace("#", "")}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={color} stopOpacity="0.4" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#mttr-grad-${color.replace("#", "")})`} />
            <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </div>
  );
}

function EnterpriseBadge() {
  const [enterprisePct, setEnterprisePct] = React.useState<number | null>(null);

  const handleTierData = React.useCallback((_data: TierMaturityData[], pct: number) => {
    setEnterprisePct(pct);
  }, []);

  const pct = enterprisePct ?? 0;
  const level = pct >= 80 ? "L5" : pct >= 65 ? "L4" : pct >= 50 ? "L3" : pct >= 30 ? "L2" : "L1";
  const label = pct >= 80 ? "Autonomous" : pct >= 65 ? "Proactive" : pct >= 50 ? "AI-Assisted" : pct >= 30 ? "Measured" : "Observability";
  const color = pct >= 80 ? brand.accent1 : pct >= 65 ? "#8D1CDC" : pct >= 50 ? brand.accent4 : pct >= 30 ? brand.accent3 : brand.accent2;

  return (
    <>
      {/* Hidden leaderboard to compute the real enterprise score */}
      <div style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", opacity: 0, pointerEvents: "none" }}>
        <MaturityLeaderboard onTierData={handleTierData} />
      </div>
      <div style={{
        position: "absolute",
        top: "50%",
        right: "8%",
        transform: "translateY(-50%)",
        zIndex: 2,
        textAlign: "center",
        pointerEvents: "none",
      }}>
        {enterprisePct === null ? (
          <>
            <style>{`
              @keyframes shimmer {
                0% { opacity: 0.2; }
                50% { opacity: 0.6; }
                100% { opacity: 0.2; }
              }
              @keyframes dotPulse1 { 0%, 80%, 100% { opacity: 0.15; } 40% { opacity: 0.8; } }
              @keyframes dotPulse2 { 0%, 80%, 100% { opacity: 0.15; } 50% { opacity: 0.8; } }
              @keyframes dotPulse3 { 0%, 80%, 100% { opacity: 0.15; } 60% { opacity: 0.8; } }
            `}</style>
            <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 1, marginBottom: 12, lineHeight: 1.5, animation: "shimmer 2s ease-in-out infinite" }}>
              Computing United Airlines<br />SRE Maturity Score...
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
              {[1, 2, 3].map((n) => (
                <div key={n} style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: brand.accent2,
                  animation: `dotPulse${n} 1.4s ease-in-out infinite`,
                  animationDelay: `${(n - 1) * 0.2}s`,
                }} />
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1.5, marginBottom: 6 }}>
              UNITED AIRLINES ENTERPRISE MATURITY
            </div>
            <div style={{
              fontSize: 72, fontWeight: 900, color, lineHeight: 1,
              textShadow: `0 0 40px ${color}35, 0 0 80px ${color}15`,
            }}>
              {level}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color, opacity: 0.8, marginTop: 4, letterSpacing: 0.5 }}>
              {label}
            </div>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>
              (Tier 1-2 only)
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>
              {pct}%
            </div>
            <MttrSparkline color={color} />
          </>
        )}
      </div>
    </>
  );
}

export const LandingPage = () => {
  return (
    <Flex flexDirection="column" gap={0}>
      {/* Hero — Dynatrace branded dark */}
      <div style={{
        background: `linear-gradient(135deg, ${brand.dark} 0%, #0f1a30 50%, ${brand.bullet} 100%)`,
        padding: "56px 48px 48px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Decorative gradient orbs using brand accents */}
        <div style={{ position: "absolute", top: -100, right: -100, width: 400, height: 400, borderRadius: "50%", background: `radial-gradient(circle, ${brand.accent4}20, transparent 70%)` }} />
        <div style={{ position: "absolute", bottom: -80, left: -80, width: 350, height: 350, borderRadius: "50%", background: `radial-gradient(circle, ${brand.accent2}15, transparent 70%)` }} />
        <div style={{ position: "absolute", top: "50%", left: "60%", width: 250, height: 250, borderRadius: "50%", background: `radial-gradient(circle, ${brand.accent6}10, transparent 70%)` }} />

        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 48 }}>
          {/* Left: Text content */}
          <div style={{ flex: 1, maxWidth: 700 }}>
            {/* Accent bar */}
            <div style={{
              width: 60, height: 4, borderRadius: 2, marginBottom: 16,
              background: `linear-gradient(90deg, ${brand.accent1}, ${brand.accent2}, ${brand.accent3}, ${brand.accent4}, ${brand.accent5}, ${brand.accent6})`,
            }} />
            <div style={{ fontSize: 22, fontWeight: 900, color: brand.accent2, letterSpacing: 4, marginBottom: 18, textShadow: `0 0 20px ${brand.accent2}40` }}>
              DYNATRACE-POWERED SRE
            </div>
            <h1 style={{ fontSize: 48, fontWeight: 900, color: "#fff", lineHeight: 1.1, margin: "0 0 20px" }}>
              SRE Maturity Assessment
            </h1>
            <p style={{ fontSize: 17, color: "var(--sre-text-secondary, #6F747F)", lineHeight: 1.7, margin: "0 0 36px" }}>
              Enable predictable digital reliability at enterprise scale. This application measures, tracks, and
              visualizes SRE maturity across five levels — from foundational observability to autonomous
              reliability — powered by Dynatrace intelligence.
            </p>

            {/* Outcome KPIs */}
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
              {outcomes.map((o) => (
                <div key={o.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 32, fontWeight: 900, color: o.color }}>{o.metric}</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontWeight: 600, letterSpacing: 0.5 }}>{o.label}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* United globe — blended directly into the dark background */}
        <img
          src="./assets/united-globe-white.png"
          alt=""
          style={{
            position: "absolute",
            top: "50%",
            right: "-2%",
            transform: "translateY(-50%)",
            height: "120%",
            width: "auto",
            objectFit: "contain",
            opacity: 0.08,
            pointerEvents: "none",
            maskImage: "linear-gradient(to right, transparent 0%, transparent 10%, black 50%, black 100%)",
            WebkitMaskImage: "linear-gradient(to right, transparent 0%, transparent 10%, black 50%, black 100%)",
          }}
        />

        {/* Enterprise maturity badge overlaid on the right */}
        <EnterpriseBadge />
      </div>

      {/* Strategic vision */}
      <div style={{ padding: "40px 48px", background: "var(--sre-bg-secondary, #EBEBEB)" }}>
        <div style={{ fontSize: 24, fontWeight: 900, color: "var(--sre-text-primary, #1A2440)", marginBottom: 24 }}>Strategic Vision</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
          <div style={{ background: "var(--sre-surface, #fff)", borderRadius: 12, padding: "28px 28px", border: "1px solid var(--sre-border)", boxShadow: "0 1px 4px var(--sre-card-shadow)" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{"\ud83c\udfaf"}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--sre-text-primary, #1A2440)", marginBottom: 8 }}>Objective</div>
            <Paragraph style={{ fontSize: 14, lineHeight: 1.65, color: "var(--sre-text-secondary, #6F747F)" }}>
              Establish Dynatrace as the enterprise reliability intelligence platform and SRE as the
              operating model that ensures mission-critical services meet defined availability,
              performance, and recovery commitments — at scale.
            </Paragraph>
          </div>
          <div style={{ background: "var(--sre-surface, #fff)", borderRadius: 12, padding: "28px 28px", border: "1px solid var(--sre-border)", boxShadow: "0 1px 4px var(--sre-card-shadow)" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{"\ud83d\uddfa\ufe0f"}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--sre-text-primary, #1A2440)", marginBottom: 12 }}>Roadmap</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { phase: "Today", label: "Reactive Monitoring", color: "#dc3545" },
                { phase: "12 Months", label: "AI-Assisted Operations", color: brand.accent4 },
                { phase: "18 Months", label: "Predictive & Automated", color: brand.accent1 },
              ].map((r) => (
                <div key={r.phase} style={{
                  flex: 1, textAlign: "center", padding: "12px 8px",
                  background: `${r.color}10`, borderRadius: 8,
                  borderLeft: `3px solid ${r.color}`,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: r.color, letterSpacing: 0.5, marginBottom: 4 }}>{r.phase}</div>
                  <div style={{ fontSize: 13, color: "var(--sre-text-primary, #1A2440)" }}>{r.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "var(--sre-surface, #fff)", borderRadius: 12, padding: "28px 28px", border: "1px solid var(--sre-border)", boxShadow: "0 1px 4px var(--sre-card-shadow)" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{"\u2705"}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--sre-text-primary, #1A2440)", marginBottom: 12 }}>Key Decisions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                "Adopt SRE operating model",
                "Endorse Dynatrace platform",
                "Mandate SLOs for Tier 1 & 2 apps",
                "Fund automation roadmap",
              ].map((d, i) => (
                <div key={i} style={{
                  fontSize: 14, display: "flex", gap: 10, alignItems: "center", color: "var(--sre-text-primary, #1A2440)",
                }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                    background: `linear-gradient(135deg, ${brand.accent1}, ${brand.accent3})`,
                    color: "#fff", fontSize: 13, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{i + 1}</span>
                  {d}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* What This App Reports */}
      <div style={{ padding: "40px 48px", background: "var(--sre-bg-primary, #fff)" }}>
        <div style={{ fontSize: 24, fontWeight: 900, color: "var(--sre-text-primary, #1A2440)", marginBottom: 24 }}>What This App Reports</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {appTabs.map((tab) => (
            <div key={tab.name} style={{
              background: "var(--sre-surface, #fff)", borderRadius: 12, padding: "20px 24px",
              border: "1px solid var(--sre-border)", display: "flex", gap: 16, alignItems: "flex-start",
              boxShadow: "0 1px 3px var(--sre-card-shadow)",
            }}>
              <span style={{ fontSize: 32, flexShrink: 0 }}>{tab.icon}</span>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "var(--sre-text-primary, #1A2440)", marginBottom: 6 }}>{tab.name}</div>
                <div style={{ fontSize: 13, color: "var(--sre-text-secondary, #6F747F)", lineHeight: 1.55 }}>{tab.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Maturity levels */}
      <div style={{ padding: "40px 48px", background: "var(--sre-bg-secondary, #EBEBEB)" }}>
        <div style={{ fontSize: 24, fontWeight: 900, color: "var(--sre-text-primary, #1A2440)", marginBottom: 8 }}>The Five Levels of SRE Maturity</div>
        <div style={{ fontSize: 14, color: "var(--sre-text-secondary, #6F747F)", marginBottom: 28, lineHeight: 1.6 }}>
          Each application is assessed against these five maturity levels. Passing checks are computed
          automatically from Dynatrace telemetry and CMDB data.
        </div>

        {/* Maturity level flow — gradient bar */}
        <div style={{
          display: "flex", gap: 3, marginBottom: 28, padding: "0",
          borderRadius: 12, overflow: "hidden",
          boxShadow: "0 2px 12px var(--sre-card-shadow)",
        }}>
          {pillars.map((p, i) => (
            <div key={p.level} style={{
              flex: 1, textAlign: "center", padding: "20px 8px",
              background: `linear-gradient(180deg, ${p.color}, ${p.color}dd)`,
              color: "#fff",
            }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{p.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 1 }}>{p.level}</div>
              <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.9, marginTop: 4 }}>{p.title}</div>
            </div>
          ))}
        </div>

        {/* Detailed pillar cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {pillars.map((p) => (
            <PillarCard key={p.level} pillar={p} />
          ))}
        </div>
      </div>

      {/* SRE Pillars alignment */}
      <div style={{ padding: "40px 48px", background: "var(--sre-bg-primary, #fff)" }}>
        <div style={{ fontSize: 24, fontWeight: 900, color: "var(--sre-text-primary, #1A2440)", marginBottom: 24 }}>Alignment with Core SRE Pillars</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { title: "Monitoring & Alerting", icon: "\ud83d\udcdf", desc: "Full-stack metrics, distributed tracing, log analytics, topology and dependencies", color: brand.accent2 },
            { title: "SLI/SLO & Error Budgets", icon: "\ud83c\udfaf", desc: "SRE assessment, golden signal SLIs, SLO tracking, dashboards and threshold alerts", color: brand.accent3 },
            { title: "Incident Response", icon: "\ud83d\udea8", desc: "Intelligent alerting, event correlation, ITSM integration, runbook linking, noise suppression", color: brand.accent4 },
            { title: "Capacity & Performance", icon: "\ud83d\udcca", desc: "Resource saturation, auto-scaling metrics, capacity forecasting, cloud cost optimization", color: brand.accent5 },
            { title: "Release & Change Safety", icon: "\ud83d\udce6", desc: "Release validation, canary analysis, error budget gating, pre/post comparison dashboards", color: brand.accent6 },
            { title: "Automation & AI", icon: "\u2699\ufe0f", desc: "Auto-remediation, event-driven ops, Davis CoPilot, self-service dashboards, agentic AI", color: brand.accent1 },
          ].map((pillar) => (
            <div key={pillar.title} style={{
              background: "var(--sre-surface, #fff)", borderRadius: 10, padding: "20px 24px",
              border: "1px solid var(--sre-border)",
              borderLeft: `4px solid ${pillar.color}`,
              boxShadow: "0 1px 3px var(--sre-card-shadow)",
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{pillar.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--sre-text-primary, #1A2440)", marginBottom: 6 }}>{pillar.title}</div>
              <div style={{ fontSize: 13, color: "var(--sre-text-secondary, #6F747F)", lineHeight: 1.6 }}>{pillar.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        background: `linear-gradient(135deg, ${brand.dark}, ${brand.bullet})`,
        padding: "20px 48px",
        textAlign: "center",
      }}>
        {/* Accent gradient line */}
        <div style={{
          width: 200, height: 2, borderRadius: 1, margin: "0 auto 12px",
          background: `linear-gradient(90deg, ${brand.accent1}, ${brand.accent2}, ${brand.accent3}, ${brand.accent4}, ${brand.accent5}, ${brand.accent6})`,
        }} />
        <Paragraph style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
          DynatracePoweredSRE — Built by David Beran with Dynatrace App Toolkit (version 2.5.0)
        </Paragraph>
      </div>
    </Flex>
  );
};
