import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { useDqlWithCache } from "../hooks/useDqlWithCache";
import { RefreshOverlay } from "./RefreshOverlay";

interface LevelResult {
  label: string;
  current: number;
  total: number;
  color: string;
}

function parseScore(records: Record<string, unknown>[] | undefined): { current: number; total: number } {
  if (!records || records.length === 0) return { current: 0, total: 0 };
  const record = records[0];
  const scoreKey = Object.keys(record).find((k) => k.toLowerCase().includes("score"));
  if (!scoreKey) return { current: 0, total: 0 };
  const match = String(record[scoreKey]).match(/(\d+)\s*\/\s*(\d+)/);
  if (match) return { current: parseInt(match[1]), total: parseInt(match[2]) };
  return { current: 0, total: 0 };
}

function ScoreRing({ current, total, color, size }: { current: number; total: number; color: string; size: number }) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  const radius = (size / 2) - 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(128,128,128,0.12)" strokeWidth="10" />
        <circle
          cx={size/2} cy={size/2} r={radius} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column",
      }}>
        <span style={{ fontSize: 36, fontWeight: 800, color }}>{Math.round(pct)}%</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--dt-colors-text-secondary-default, #656d76)", letterSpacing: 1 }}>OVERALL</span>
      </div>
    </div>
  );
}

function MiniBar({ label, current, total, color }: { label: string; current: number; total: number; color: string }) {
  const pct = total > 0 ? (current / total) * 100 : 0;

  return (
    <div style={{ flex: 1, minWidth: 120 }}>
      <Flex justifyContent="space-between" style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700 }}>{current}/{total}</span>
      </Flex>
      <div style={{
        height: 8,
        borderRadius: 4,
        background: "rgba(128,128,128,0.12)",
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          borderRadius: 4,
          background: `linear-gradient(90deg, ${color}, ${color}cc)`,
          transition: "width 0.8s ease",
        }} />
      </div>
    </div>
  );
}

function getGrade(pct: number): { grade: string; color: string; label: string } {
  if (pct >= 80) return { grade: "L5", color: "#49C2B3", label: "Autonomous" };
  if (pct >= 65) return { grade: "L4", color: "#8D1CDC", label: "Proactive" };
  if (pct >= 50) return { grade: "L3", color: "#5E28E5", label: "AI-Assisted" };
  if (pct >= 30) return { grade: "L2", color: "#1966FF", label: "Measured" };
  return { grade: "L1", color: "#3BACF0", label: "Observability" };
}

/**
 * Derive the current SRE maturity level based on per-level completion.
 * An app must complete ~80% of each level's checks before "graduating" to the next.
 * levels[0] = L1, levels[1] = L2, etc.
 */
function getCurrentLevel(levels: LevelResult[]): { grade: string; color: string; label: string } {
  const labels = [
    { grade: "L1", label: "Observability", color: "#3BACF0" },
    { grade: "L2", label: "Measured", color: "#1966FF" },
    { grade: "L3", label: "AI-Assisted", color: "#5E28E5" },
    { grade: "L4", label: "Proactive", color: "#8D1CDC" },
    { grade: "L5", label: "Autonomous", color: "#49C2B3" },
  ];
  const THRESHOLD = 0.8;

  // Start at L1. Advance to next level only if the previous level is ≥ 80% complete.
  let currentLevelIdx = 0;
  for (let i = 0; i < Math.min(levels.length, 5); i++) {
    const pct = levels[i].total > 0 ? levels[i].current / levels[i].total : 0;
    if (pct >= THRESHOLD) {
      // Completed this level — can potentially move to the next
      currentLevelIdx = Math.min(i + 1, 4);
    } else {
      // Not complete — stop here, this is the current level being worked on
      currentLevelIdx = i;
      break;
    }
  }
  return labels[currentLevelIdx];
}

interface OverallScoreProps {
  queries: { label: string; query: string; color: string }[];
}

export const OverallScore = ({ queries }: OverallScoreProps) => {
  const results = queries.map((q) => {
    const { data, isLoading, isRefreshing, error } = useDqlWithCache({ query: q.query });
    return { ...q, data, isLoading, isRefreshing, error };
  });

  const anyFirstLoad = results.some((r) => r.isLoading);
  const anyRefreshing = results.some((r) => r.isRefreshing);

  if (anyFirstLoad) {
    return (
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
        <Paragraph style={{ color: "rgba(255,255,255,0.7)" }}>Calculating overall maturity...</Paragraph>
      </div>
    );
  }

  const levels: LevelResult[] = results.map((r) => {
    const { current, total } = parseScore(r.data?.records as Record<string, unknown>[] | undefined);
    return { label: r.label, current, total, color: r.color };
  });

  const totalCurrent = levels.reduce((s, l) => s + l.current, 0);
  const totalPossible = levels.reduce((s, l) => s + l.total, 0);
  const overallPct = totalPossible > 0 ? Math.round((totalCurrent / totalPossible) * 100) : 0;
  const ringColor = overallPct >= 80 ? "#49C2B3" : overallPct >= 50 ? "#C93FDB" : "#dc3545";
  const { grade, color: gradeColor, label: gradeLabel } = getCurrentLevel(levels);

  return (
    <RefreshOverlay isRefreshing={anyRefreshing}>
    <div style={{
      background: "linear-gradient(135deg, #1A2440 0%, #1A2440 100%)",
      borderRadius: 16,
      padding: "28px 32px",
      boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
    }}>
      <Flex gap={32} alignItems="center" style={{ flexWrap: "wrap" }}>
        {/* Score ring */}
        <ScoreRing current={totalCurrent} total={totalPossible} color={ringColor} size={140} />

        {/* Grade + summary */}
        <Flex flexDirection="column" gap={8} style={{ minWidth: 160 }}>
          <div style={{
            fontSize: 56,
            fontWeight: 900,
            color: gradeColor,
            lineHeight: 1,
            letterSpacing: -2,
          }}>
            {grade}
          </div>
          <div style={{
            fontSize: 14,
            fontWeight: 600,
            color: gradeColor,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}>
            {gradeLabel}
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
            {totalCurrent} of {totalPossible} checks passing
          </div>
        </Flex>

        {/* Per-level mini bars */}
        <Flex flexDirection="column" gap={8} style={{ flex: 1, minWidth: 250 }}>
          {levels.map((l) => (
            <MiniBar key={l.label} label={l.label} current={l.current} total={l.total} color={l.color} />
          ))}
        </Flex>
      </Flex>
    </div>
    </RefreshOverlay>
  );
};
