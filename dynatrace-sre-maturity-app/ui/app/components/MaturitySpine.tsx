import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { LEVEL_META, LEVEL_CHECK_COUNT, CHECK_DETAIL_CONFIGS } from "./checkDetailConfigs";
import { LevelRecord, LevelId, getStatus, flattenChecks, splitByOwnership } from "./checkStatus";
import { CheckHoverPreview } from "./CheckHoverPreview";
import { HardcodedBadge } from "./HardcodedBadge";
import { SkeletonBar } from "./SkeletonBar";
import { MaturityTrendChart } from "./MaturityTrendChart";

interface Props {
  levelRecords: LevelRecord[];
  isLoading: boolean;
  isRefreshing: boolean;
  mode: "engineer" | "executive";
  onModeChange: (mode: "engineer" | "executive") => void;
  onCheckOpen: (level: LevelId, key: string, value: string) => void;
  trendRecords: Record<string, unknown>[];
}

// Ambient glow echoing the level spectrum (L1 blue → L5 magenta) behind the
// otherwise-flat navy card — the "polish" the flat var(--spine) color lacked.
// Exported so ScorecardsPage can paint the same background on the shared
// wrapper it merges this component's content with AppIdentityBar's into.
export const SPINE_BACKGROUND = `
  radial-gradient(ellipse 640px 360px at 8% 15%, rgba(87,192,244,0.20), transparent 60%),
  radial-gradient(ellipse 520px 420px at 88% 100%, rgba(228,54,255,0.16), transparent 62%),
  radial-gradient(ellipse 900px 300px at 60% -10%, rgba(97,28,217,0.18), transparent 65%),
  linear-gradient(135deg, #1A2440 0%, #171E38 55%, #1B1836 100%)
`;

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

function RingsChart({ order, levelPcts }: { order: LevelId[]; levelPcts: number[] }) {
  const size = 156;
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = 8;
  const gap = 3;
  const baseRadius = 19;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {order.map((level, i) => {
          const radius = baseRadius + i * (strokeWidth + gap);
          const circumference = 2 * Math.PI * radius;
          const pct = Math.max(0, Math.min(1, levelPcts[i]));
          const offset = circumference - pct * circumference;
          return (
            <g key={level}>
              <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
              {pct > 0 && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="none"
                  stroke={LEVEL_META[level].color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${cx} ${cy})`}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function RingsLegend({ order, levelPcts }: { order: LevelId[]; levelPcts: number[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,.4)", textTransform: "uppercase" }}>
        Rings · Inside out
      </span>
      {order.map((level, i) => (
        <div key={level} style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: LEVEL_META[level].color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.85)", flexShrink: 0 }}>{level}</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {LEVEL_META[level].title}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.85)", flexShrink: 0, paddingLeft: 8 }}>
            {Math.round(levelPcts[i] * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}

function ModeToggle({ mode, onModeChange }: { mode: "engineer" | "executive"; onModeChange: (m: "engineer" | "executive") => void }) {
  return (
    <div style={{ display: "flex", border: "1px solid rgba(255,255,255,.18)", borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
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
  );
}

const LEVEL_ORDER: LevelId[] = ["L1", "L2", "L3", "L4", "L5"];

export const MaturitySpine = ({ levelRecords, isLoading, isRefreshing, mode, onModeChange, onCheckOpen, trendRecords }: Props) => {
  // Sized from LEVEL_CHECK_COUNT (fixed regardless of app data) so the
  // skeleton occupies the exact same footprint as the real bars row below —
  // otherwise the page visibly reflows once the (often slow) L1 query and
  // its four siblings all resolve and the real content pops in.
  const skeletonBarsRow = (
    <div style={{ display: "flex", gap: mode === "executive" ? 24 : 18, alignItems: "flex-end" }}>
      {LEVEL_ORDER.map((level) => (
        <div key={level} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <SkeletonBar dark height={12} width="70%" />
          <div style={{ display: "flex", gap: 3 }}>
            {Array.from({ length: LEVEL_CHECK_COUNT[level] ?? 6 }).map((_, i) => (
              <SkeletonBar key={i} dark height={mode === "executive" ? 44 : 22} style={{ flex: 1 }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  if (isLoading) {
    return (
      <div>
        {mode === "engineer" ? (
          <>
            <Flex justifyContent="space-between" alignItems="flex-start" style={{ marginBottom: 16 }}>
              <Flex flexDirection="column" gap={6}>
                <SkeletonBar dark height={10} width={110} />
                <SkeletonBar dark height={34} width={170} />
                <SkeletonBar dark height={11} width={230} />
              </Flex>
              <ModeToggle mode={mode} onModeChange={onModeChange} />
            </Flex>
            {skeletonBarsRow}
          </>
        ) : (
          <>
            <Flex justifyContent="flex-end" style={{ marginBottom: 4 }}>
              <ModeToggle mode={mode} onModeChange={onModeChange} />
            </Flex>
            <div style={{ display: "flex", gap: 28, alignItems: "flex-start", marginBottom: 18 }}>
              <div style={{ display: "flex", gap: 18, alignItems: "center", flexShrink: 0 }}>
                <SkeletonBar dark height={156} width={156} borderRadius={78} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {LEVEL_ORDER.map((lv) => (
                    <SkeletonBar key={lv} dark height={11} width={140} />
                  ))}
                </div>
              </div>
              <MaturityTrendChart records={[]} isLoading={true} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, minWidth: 130 }}>
                <SkeletonBar dark height={10} width={90} />
                <SkeletonBar dark height={32} width={80} />
                <SkeletonBar dark height={22} width={130} />
              </div>
            </div>
            {skeletonBarsRow}
          </>
        )}
      </div>
    );
  }

  const order: LevelId[] = LEVEL_ORDER;
  const totals = order.map((level) => {
    const lr = levelRecords.find((l) => l.level === level);
    return lr ? parseScore(lr.record) : { current: 0, total: 0 };
  });
  const levelPcts = totals.map((t) => (t.total > 0 ? t.current / t.total : 0));
  const totalCurrent = totals.reduce((s, t) => s + t.current, 0);
  const totalPossible = totals.reduce((s, t) => s + t.total, 0);
  const gradePct = totalPossible > 0 ? Math.round((totalCurrent / totalPossible) * 100) : 0;
  const { grade, title, color } = getCurrentLevel(levelRecords);
  const allChecks = flattenChecks(levelRecords);
  const failingChecks = allChecks.filter((c) => c.status === "fail" || c.status === "warn");
  const { platformGaps, quickWins } = splitByOwnership(failingChecks);
  const failCount = allChecks.filter((c) => c.status === "fail").length;
  const warnCount = allChecks.filter((c) => c.status === "warn").length;
  const naCount = allChecks.filter((c) => c.status === "na").length;

  const barsRow = (
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
  );

  return (
    <div style={{ opacity: isRefreshing ? 0.7 : 1, transition: "opacity 0.3s ease" }}>
      {mode === "engineer" ? (
        <>
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
            <ModeToggle mode={mode} onModeChange={onModeChange} />
          </Flex>
          {barsRow}
        </>
      ) : (
        <>
          <Flex justifyContent="flex-end" style={{ marginBottom: 4 }}>
            <ModeToggle mode={mode} onModeChange={onModeChange} />
          </Flex>
          <div style={{ display: "flex", gap: 28, alignItems: "flex-start", marginBottom: 18 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,.4)", textTransform: "uppercase" }}>
                  Current maturity
                </span>
                <Flex alignItems="baseline" gap={8}>
                  <span style={{ fontSize: 26, fontWeight: 700, color: "#fff", letterSpacing: -0.5 }}>{grade}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.6)" }}>{gradePct}%</span>
                </Flex>
              </div>
              <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
                <RingsChart order={order} levelPcts={levelPcts} />
                <RingsLegend order={order} levelPcts={levelPcts} />
              </div>
            </div>
            <MaturityTrendChart records={trendRecords} isLoading={false} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0, minWidth: 130 }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,.4)", textTransform: "uppercase" }}>
                Checks met
              </span>
              <span style={{ fontSize: 32, fontWeight: 700, color: "#fff", letterSpacing: -0.5 }}>
                {totalCurrent} <span style={{ fontSize: 18, fontWeight: 500, color: "rgba(255,255,255,.4)" }}>/ {totalPossible}</span>
              </span>
              <span style={{ fontSize: 10.5, color: "rgba(255,255,255,.5)", lineHeight: 1.4 }}>
                {failCount} failing · {warnCount} warning · {naCount} not applicable, counted as met
              </span>
              <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{quickWins.length}</span>
                  <span style={{ fontSize: 9.5, color: "rgba(255,255,255,.5)" }}>quick wins</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{platformGaps.length}</span>
                  <span style={{ fontSize: 9.5, color: "rgba(255,255,255,.5)" }}>platform gaps</span>
                </div>
              </div>
            </div>
          </div>
          {barsRow}
        </>
      )}

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
