// Replaces OverallScore.tsx. Two render modes (Engineer default, Executive)
// toggled by the `mode` prop, which ScorecardsPage.tsx owns so the card grid
// switches in lockstep. Does not fetch data itself — receives already-resolved
// level records from ScorecardsPage.tsx.
import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { Paragraph } from "@dynatrace/strato-components/typography";
import { LEVEL_META, CHECK_DETAIL_CONFIGS } from "./checkDetailConfigs";
import { LevelRecord, LevelId, getStatus, flattenChecks, splitByOwnership } from "./checkStatus";
import { CheckHoverPreview } from "./CheckHoverPreview";
import { HardcodedBadge } from "./HardcodedBadge";

interface Props {
  levelRecords: LevelRecord[];
  isLoading: boolean;
  isRefreshing: boolean;
  mode: "engineer" | "executive";
  onModeChange: (mode: "engineer" | "executive") => void;
  onCheckOpen: (level: LevelId, key: string, value: string) => void;
}

function parseScore(record: Record<string, unknown>): { current: number; total: number } {
  const scoreKey = Object.keys(record).find((k) => k.toLowerCase().includes("score"));
  if (!scoreKey) return { current: 0, total: 0 };
  const match = String(record[scoreKey]).match(/(\d+)\s*\/\s*(\d+)/);
  return match ? { current: parseInt(match[1], 10), total: parseInt(match[2], 10) } : { current: 0, total: 0 };
}

function getCurrentLevel(levelRecords: LevelRecord[]): { grade: LevelId; title: string; color: string } {
  const order: LevelId[] = ["L1", "L2", "L3", "L4", "L5"];
  const THRESHOLD = 0.8;
  let currentIdx = 0;
  for (let i = 0; i < order.length; i++) {
    const lr = levelRecords.find((l) => l.level === order[i]);
    const { current, total } = lr ? parseScore(lr.record) : { current: 0, total: 0 };
    const pct = total > 0 ? current / total : 0;
    if (pct >= THRESHOLD) currentIdx = Math.min(i + 1, order.length - 1);
    else { currentIdx = i; break; }
  }
  const grade = order[currentIdx];
  return { grade, title: LEVEL_META[grade].title, color: LEVEL_META[grade].color };
}

const STATUS_CELL_COLOR: Record<string, string> = {
  pass: "var(--pass-ink, #17663C)",
  fail: "var(--fail-ink, #B3261E)",
  warn: "var(--warn-ink, #8A6100)",
  na: "var(--na-ink, #4C5B73)",
};

function CheckCell({
  levelId,
  checkKey,
  value,
  onCheckOpen,
  height,
}: {
  levelId: LevelId;
  checkKey: string;
  value: string;
  onCheckOpen: Props["onCheckOpen"];
  height: number;
}) {
  const status = getStatus(value);
  const hardcoded = CHECK_DETAIL_CONFIGS[checkKey]?.hardcoded ?? false;
  return (
    <CheckHoverPreview checkKey={checkKey} value={value} accentColor={LEVEL_META[levelId].color}>
      <div
        onClick={() => onCheckOpen(levelId, checkKey, value)}
        title={checkKey}
        style={{
          flex: 1,
          height,
          borderRadius: 3,
          cursor: "pointer",
          background: STATUS_CELL_COLOR[status],
          opacity: status === "na" ? 0.35 : status === "pass" ? 0.55 : 1,
          backgroundImage: hardcoded
            ? "repeating-linear-gradient(135deg, rgba(255,255,255,0.35) 0, rgba(255,255,255,0.35) 3px, transparent 3px, transparent 6px)"
            : undefined,
        }}
      />
    </CheckHoverPreview>
  );
}

export const MaturitySpine = ({ levelRecords, isLoading, isRefreshing, mode, onModeChange, onCheckOpen }: Props) => {
  if (isLoading) {
    return (
      <div
        style={{
          background: "var(--spine, #1A2440)",
          borderRadius: 16,
          padding: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
        }}
      >
        <ProgressCircle size="small" />
        <Paragraph style={{ color: "rgba(255,255,255,0.7)" }}>Calculating overall maturity...</Paragraph>
      </div>
    );
  }

  const order: LevelId[] = ["L1", "L2", "L3", "L4", "L5"];
  const totals = order.map((level) => {
    const lr = levelRecords.find((l) => l.level === level);
    return lr ? parseScore(lr.record) : { current: 0, total: 0 };
  });
  const totalCurrent = totals.reduce((s, t) => s + t.current, 0);
  const totalPossible = totals.reduce((s, t) => s + t.total, 0);
  const { grade, title, color } = getCurrentLevel(levelRecords);
  const allChecks = flattenChecks(levelRecords);
  const { platformGaps, quickWins } = splitByOwnership(allChecks.filter((c) => c.status === "fail" || c.status === "warn"));

  return (
    <div
      style={{
        background: "var(--spine, #1A2440)",
        borderRadius: 16,
        padding: "20px 24px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
        opacity: isRefreshing ? 0.7 : 1,
        transition: "opacity 0.3s ease",
      }}
    >
      <Flex justifyContent="space-between" alignItems="flex-start" style={{ marginBottom: 16 }}>
        <Flex flexDirection="column" gap={2}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: "rgba(255,255,255,.42)" }}>
            CURRENT MATURITY
          </span>
          <Flex alignItems="baseline" gap={8}>
            <span style={{ fontSize: 40, fontWeight: 600, color: "#fff", letterSpacing: -1 }}>{grade}</span>
            <span style={{ fontSize: 15, fontWeight: 500, color, letterSpacing: 0.3 }}>{title}</span>
          </Flex>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>
            {totalCurrent}/{totalPossible} checks passing · {quickWins.length} quick wins · {platformGaps.length} platform gaps
          </span>
        </Flex>

        <div
          style={{
            display: "flex",
            border: "1px solid rgba(255,255,255,.18)",
            borderRadius: 8,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {(["engineer", "executive"] as const).map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              style={{
                border: "none",
                padding: "6px 12px",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.3,
                textTransform: "capitalize",
                cursor: "pointer",
                background: mode === m ? "rgba(255,255,255,.16)" : "transparent",
                color: mode === m ? "#fff" : "rgba(255,255,255,.5)",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </Flex>

      <div style={{ display: "flex", gap: mode === "executive" ? 24 : 18, alignItems: "flex-end" }}>
        {order.map((level) => {
          const lr = levelRecords.find((l) => l.level === level);
          const { current, total } = lr ? parseScore(lr.record) : { current: 0, total: 0 };
          const checkKeys = lr ? Object.keys(lr.record).filter((k) => !k.toLowerCase().includes("score")) : [];
          return (
            <div key={level} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <Flex alignItems="baseline" gap={6}>
                <span style={{ fontSize: 11.5, fontWeight: 900, color: LEVEL_META[level].color }}>{level}</span>
                {mode === "engineer" && (
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {LEVEL_META[level].title}
                  </span>
                )}
                <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.8)" }}>
                  {current}/{total}
                </span>
              </Flex>
              <div style={{ display: "flex", gap: 3 }}>
                {checkKeys.map((key) => (
                  <CheckCell
                    key={key}
                    levelId={level}
                    checkKey={key}
                    value={String(lr!.record[key])}
                    onCheckOpen={onCheckOpen}
                    height={mode === "executive" ? 44 : 22}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {platformGaps.some((c) => CHECK_DETAIL_CONFIGS[c.key]?.hardcoded) && (
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <HardcodedBadge size="chip" />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>
            Some platform gaps above are not yet wired to live data — see badge on hover.
          </span>
        </div>
      )}
    </div>
  );
};
