// Maturity-over-time trend chart for the Scorecards page's Executive-mode
// hero — replaces the old generated headline ("Where this app stands...").
// Reads daily snapshot bizevents ingested by
// workflows/sre-maturity-daily-snapshot.yaml (event.type:
// "workflow.summary.sre_maturity") via ScorecardsPage.tsx's trendQuery.
// No charting library in this repo — modeled on SparklineCard.tsx's
// hand-rolled SVG line+gradient-area technique, extended with a fixed
// 0-100% domain (not auto min/max) and level-up markers.
import React, { useState } from "react";
import { LEVEL_META } from "./checkDetailConfigs";
import { LevelId } from "./checkStatus";
import { SkeletonBar } from "./SkeletonBar";

// Keep in sync with checkDetailConfigs.ts's LEVEL_CHECK_COUNT and the
// workflow's own totalMax (7+6+7+5+5 = 30).
const LEVEL_MAX: Record<LevelId, number> = { L1: 7, L2: 6, L3: 7, L4: 5, L5: 5 };
const LEVEL_ORDER: LevelId[] = ["L1", "L2", "L3", "L4", "L5"];

export interface MaturityTrendPoint {
  date: string; // snapshotDate, YYYY-MM-DD
  l1: number; l2: number; l3: number; l4: number; l5: number;
  total: number;
  pct: number;
  grade: LevelId;
}

export function parseTrendRecord(r: Record<string, unknown>): MaturityTrendPoint {
  return {
    date: String(r.snapshotDate ?? ""),
    l1: Number(r.l1Score ?? 0),
    l2: Number(r.l2Score ?? 0),
    l3: Number(r.l3Score ?? 0),
    l4: Number(r.l4Score ?? 0),
    l5: Number(r.l5Score ?? 0),
    total: Number(r.total ?? 0),
    pct: Number(r.pct ?? 0),
    grade: (String(r.grade ?? "L1") as LevelId),
  };
}

interface Props {
  records: Record<string, unknown>[];
  isLoading: boolean;
}

export const MaturityTrendChart = ({ records, isLoading }: Props) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <SkeletonBar dark height={10} width={150} />
        <SkeletonBar dark height={64} width="100%" />
        <SkeletonBar dark height={19} width={120} />
      </div>
    );
  }

  const points = records.map(parseTrendRecord).filter((p) => p.date);

  if (points.length < 2) {
    return (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,.4)", textTransform: "uppercase" }}>
          Maturity trend
        </span>
        <span style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,.6)", lineHeight: 1.4 }}>
          {points.length === 1
            ? `Today: ${points[0].pct}% — trend begins tomorrow.`
            : "Not enough history yet — check back tomorrow."}
        </span>
      </div>
    );
  }

  const latest = points[points.length - 1];
  const prev = points[points.length - 2];
  const delta = latest.pct - prev.pct;
  const deltaColor = delta > 0 ? "#49C2B3" : delta < 0 ? "#dc3545" : "rgba(255,255,255,.5)";
  const deltaIcon = delta > 0 ? "↗" : delta < 0 ? "↘" : "→";

  // Fixed 0-100 domain (not auto min/max like SparklineCard's Sparkline) — a
  // bounded %-met metric should read against its true scale, so a 40%→45%
  // move looks like the small change it is, not a dramatic half-height jump.
  const w = 400;
  const h = 64;
  const coords = points.map((p, i) => ({
    x: (i / (points.length - 1)) * w,
    y: h - (p.pct / 100) * h,
  }));
  const linePath = `M ${coords.map((c) => `${c.x},${c.y}`).join(" L ")}`;
  const areaPath = `M 0,${h} L ${coords.map((c) => `${c.x},${c.y}`).join(" L ")} L ${w},${h} Z`;
  const gradId = "trend-grad";

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4, position: "relative" }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,.4)", textTransform: "uppercase" }}>
        Maturity trend
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: "#fff" }}>{latest.pct}%</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: deltaColor }}>
          {deltaIcon} {Math.abs(delta)}pt vs. prior snapshot
        </span>
      </div>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={LEVEL_META[latest.grade].color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={LEVEL_META[latest.grade].color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={linePath} fill="none" stroke={LEVEL_META[latest.grade].color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((c, i) => {
          const leveledUp = i > 0 && points[i].grade !== points[i - 1].grade;
          const r = leveledUp ? 4 : hoverIdx === i ? 3.5 : 0;
          if (r === 0) return null;
          return (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r={r}
              fill={leveledUp ? LEVEL_META[points[i].grade].color : "#fff"}
              stroke={leveledUp ? "#fff" : "none"}
              strokeWidth={leveledUp ? 1 : 0}
            />
          );
        })}
        {coords.map((c, i) => (
          <rect
            key={`hit-${i}`}
            x={c.x - w / points.length / 2}
            y={0}
            width={w / points.length}
            height={h}
            fill="transparent"
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            style={{ cursor: "pointer" }}
          />
        ))}
      </svg>
      {hoverIdx !== null && (
        <div
          style={{
            position: "absolute",
            top: -8,
            left: `${(coords[hoverIdx].x / w) * 100}%`,
            transform: "translate(-50%, -100%)",
            background: "#1A2440",
            border: "1px solid rgba(255,255,255,.18)",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 10.5,
            color: "rgba(255,255,255,.85)",
            whiteSpace: "nowrap",
            zIndex: 10,
            pointerEvents: "none",
            boxShadow: "0 4px 16px rgba(0,0,0,.4)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            {points[hoverIdx].date} — {points[hoverIdx].pct}%
          </div>
          {LEVEL_ORDER.map((lv) => {
            const key = lv.toLowerCase() as "l1" | "l2" | "l3" | "l4" | "l5";
            return (
              <div key={lv} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ color: LEVEL_META[lv].color, fontWeight: 700 }}>{lv}</span>
                <span>
                  {points[hoverIdx][key]}/{LEVEL_MAX[lv]}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
