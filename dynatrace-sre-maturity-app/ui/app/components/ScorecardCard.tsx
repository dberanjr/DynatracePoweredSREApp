// Per-level card in the Scorecards redesign. No longer fetches its own data
// or owns modal state — ScorecardsPage fetches once and passes the resolved
// record down, and a single shared CheckDetailModal lives at the
// ScorecardsPage level so hero-banner cells and card-grid rows open the same
// modal.
import React from "react";
import { Link } from "react-router-dom";
import { Paragraph } from "@dynatrace/strato-components/typography";
import { RefreshOverlay } from "./RefreshOverlay";
import { LEVEL_META, LEVEL_CHECK_COUNT, CHECK_DETAIL_CONFIGS } from "./checkDetailConfigs";
import { LevelId, Status, getStatus, getFailingChecks, splitByOwnership, CheckResult } from "./checkStatus";
import { CheckHoverPreview } from "./CheckHoverPreview";
import { HardcodedBadge } from "./HardcodedBadge";
import { SkeletonBar } from "./SkeletonBar";

interface Props {
  level: LevelId;
  title: string;
  accentColor: string;
  record: Record<string, unknown> | undefined;
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null | undefined;
  mode: "engineer" | "executive";
  onCheckOpen: (level: LevelId, key: string, value: string) => void;
}

// Matches the redesign handoff's ST table (see
// dynatrace-sre-scorecards-redesign/project/SRE Scorecards - Redesign.dc.html):
// rows sit on a persistent status tint at rest (pass is the one exception —
// it stays flat so only the checks that need attention draw the eye) and
// deepen slightly on hover.
const STATUS_STYLES: Record<Status, { restBg: string; hoverBg: string; rail: string; text: string }> = {
  pass: { restBg: "transparent", hoverBg: "rgba(30,158,90,.10)", rail: "#1E9E5A", text: "var(--pass-ink, #17663C)" },
  fail: { restBg: "rgba(220,53,69,.11)", hoverBg: "rgba(220,53,69,.19)", rail: "#DC3545", text: "var(--fail-ink, #B3261E)" },
  warn: { restBg: "rgba(232,163,61,.14)", hoverBg: "rgba(232,163,61,.22)", rail: "#E8A33D", text: "var(--warn-ink, #8A6100)" },
  na: { restBg: "rgba(143,160,188,.10)", hoverBg: "rgba(143,160,188,.17)", rail: "#8FA0BC", text: "var(--na-ink, #4C5B73)" },
};

function parseScore(record: Record<string, unknown>): { current: number; total: number } {
  const scoreKey = Object.keys(record).find((k) => k.toLowerCase().includes("score"));
  if (!scoreKey) return { current: 0, total: 0 };
  const match = String(record[scoreKey]).match(/(\d+)\s*\/\s*(\d+)/);
  return match ? { current: parseInt(match[1], 10), total: parseInt(match[2], 10) } : { current: 0, total: 0 };
}

// Our DQL checks return one free-text string (e.g. "3/5 Full-Stack", "24
// services", "Active"), not separate metric/caption fields, so the headline
// number shown on the right of each row is recovered heuristically: a
// leading count/fraction/percent becomes the bold metric and the rest becomes
// its caption; a short qualitative result (e.g. "Active") is shown as-is;
// anything longer (an explanatory sentence, usually on a fail/n-a check with
// no real count to report) collapses to a dash with the sentence as caption.
function parseMetric(display: string): { metric: string; unit: string } {
  const trimmed = display.trim();
  if (!trimmed || /^n\/a$/i.test(trimmed)) return { metric: "—", unit: "" };
  const numMatch = trimmed.match(/^([\d,]+(?:\.\d+)?(?:\s*\/\s*[\d,]+)?%?)(?:\s+(.*))?$/);
  if (numMatch) return { metric: numMatch[1], unit: (numMatch[2] ?? "").trim() };
  if (trimmed.length <= 14) return { metric: trimmed, unit: "" };
  return { metric: "—", unit: trimmed };
}

function CardShell({ accentColor, children }: { accentColor: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--card, #fff)",
        border: "1px solid var(--line, #E3E6EB)",
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "var(--shadow, 0 1px 2px rgba(26,36,64,.05))",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ height: 3, background: accentColor, flexShrink: 0 }} />
      {children}
    </div>
  );
}

function CardHeader({ level, title, accentColor, current, total }: { level: LevelId; title: string; accentColor: string; current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div style={{ padding: "11px 13px 10px", borderBottom: "1px solid var(--line, #E3E6EB)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 17, fontWeight: 900, color: accentColor, fontVariantNumeric: "tabular-nums" }}>{level}</span>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</span>
        <Link to={`/definitions?level=${level}`} style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink-2, #6F747F)" }}>
          def ↗
        </Link>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 8 }}>
        <div style={{ flex: 1, height: 5, borderRadius: 3, background: "var(--panel, #F7F8FA)", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: accentColor }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{current}/{total}</span>
        <span style={{ fontSize: 11, color: "var(--ink-2, #6F747F)" }}>{pct}%</span>
      </div>
    </div>
  );
}

function EngineerRow({ level, checkKey, value, onCheckOpen }: { level: LevelId; checkKey: string; value: string; onCheckOpen: Props["onCheckOpen"] }) {
  const status = getStatus(value);
  const s = STATUS_STYLES[status];
  const display = value.replace(/^(pass|fail|warn|n\/a)\s*/i, "");
  const hardcoded = CHECK_DETAIL_CONFIGS[checkKey]?.hardcoded ?? false;
  const [hovered, setHovered] = React.useState(false);
  const indexMatch = checkKey.match(/^(\d+)\./);
  const idx = `${level}-${indexMatch ? indexMatch[1] : "?"}`;
  const title = checkKey.replace(/^\d+\.\s*/, "");
  const { metric, unit } = parseMetric(display);

  return (
    <CheckHoverPreview checkKey={checkKey} value={value} accentColor={LEVEL_META[level].color}>
      <div
        onClick={() => onCheckOpen(level, checkKey, value)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onCheckOpen(level, checkKey, value); }}
        style={{
          minHeight: 44,
          padding: "0 10px 0 0",
          display: "flex",
          gap: 8,
          cursor: "pointer",
          borderBottom: "1px solid var(--line-soft, #F2F4F7)",
          background: hovered ? s.hoverBg : s.restBg,
          transition: "background 0.12s",
        }}
      >
        <div style={{ width: 4, flexShrink: 0, background: s.rail }} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
          <span style={{ fontSize: 12, fontWeight: 900, color: LEVEL_META[level].color, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
            {idx}
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: status === "na" ? s.text : "var(--ink, #1A2440)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {title}
          </span>
          {hardcoded && <HardcodedBadge size="chip" />}
        </div>
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: 1,
            minWidth: 0,
            maxWidth: "42%",
            padding: "6px 0",
          }}
        >
          <span
            style={{
              fontSize: metric.length <= 6 ? 19 : 15,
              fontWeight: 700,
              lineHeight: 1,
              color: status === "fail" || status === "na" ? s.text : "var(--ink, #1A2440)",
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            {metric}
          </span>
          {unit && (
            <span
              style={{
                fontSize: 10,
                color: "var(--ink-2, #6F747F)",
                textAlign: "right",
                lineHeight: 1.25,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {unit}
            </span>
          )}
        </div>
      </div>
    </CheckHoverPreview>
  );
}

function ExecutiveOpenItem({ level, check, onCheckOpen }: { level: LevelId; check: CheckResult; onCheckOpen: Props["onCheckOpen"] }) {
  const hardcoded = CHECK_DETAIL_CONFIGS[check.key]?.hardcoded ?? false;
  return (
    <div
      onClick={() => onCheckOpen(level, check.key, check.value)}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, cursor: "pointer" }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: check.status === "fail" ? "var(--fail-ink, #B3261E)" : "var(--warn-ink, #8A6100)" }} />
      <span style={{ fontSize: 11, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
        {check.key.replace(/^\d+\.\s*/, "")}
      </span>
      {hardcoded && <HardcodedBadge size="chip" />}
    </div>
  );
}

export const ScorecardCard = ({ level, title, accentColor, record, isLoading, isRefreshing, error, mode, onCheckOpen }: Props) => {
  if (isLoading) {
    // Sized from LEVEL_CHECK_COUNT (fixed regardless of app data) so the
    // skeleton occupies the same footprint as the real card — otherwise the
    // page reflows when this level's query (L1 in particular) finally lands.
    const rowCount = LEVEL_CHECK_COUNT[level] ?? 6;
    return (
      <CardShell accentColor={accentColor}>
        <div style={{ padding: "11px 13px 10px", borderBottom: "1px solid var(--line, #E3E6EB)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 900, color: accentColor }}>{level}</span>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</span>
          </div>
          <SkeletonBar height={5} style={{ marginTop: 8 }} />
        </div>
        {mode === "executive" ? (
          <div style={{ padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
              <SkeletonBar height={64} width={64} borderRadius={32} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                <SkeletonBar height={20} width="35%" />
                <SkeletonBar height={13} width="55%" />
                <SkeletonBar height={11} width="40%" />
              </div>
            </div>
            <SkeletonBar height={11} width="90%" />
            <SkeletonBar height={11} width="70%" />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 11, borderTop: "1px solid var(--line-soft, #F2F4F7)" }}>
              {Array.from({ length: Math.min(rowCount, 4) }).map((_, i) => (
                <SkeletonBar key={i} height={11} width={`${70 - i * 8}%`} />
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {Array.from({ length: rowCount }).map((_, i) => (
              <div key={i} style={{ padding: "8px 10px", display: "flex", gap: 8, borderBottom: "1px solid var(--line-soft, #F2F4F7)" }}>
                <SkeletonBar width={4} height={30} borderRadius={2} />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                  <SkeletonBar height={12} width="55%" />
                  <SkeletonBar height={11} width="80%" />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardShell>
    );
  }

  if (error || !record) {
    return (
      <CardShell accentColor={accentColor}>
        <div style={{ padding: 16 }}>
          <Paragraph style={{ color: "var(--fail-ink, #B3261E)", fontSize: 11 }}>
            {error?.message ?? "No data available"}
          </Paragraph>
        </div>
      </CardShell>
    );
  }

  const { current, total } = parseScore(record);
  const checkKeys = Object.keys(record).filter((k) => !k.toLowerCase().includes("score"));

  if (mode === "engineer") {
    return (
      <RefreshOverlay isRefreshing={isRefreshing}>
        <CardShell accentColor={accentColor}>
          <CardHeader level={level} title={title} accentColor={accentColor} current={current} total={total} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            {checkKeys.map((key) => (
              <EngineerRow key={key} level={level} checkKey={key} value={String(record[key])} onCheckOpen={onCheckOpen} />
            ))}
          </div>
        </CardShell>
      </RefreshOverlay>
    );
  }

  // Executive mode
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  // Reuse checkStatus.ts's flattening/filtering instead of re-deriving
  // CheckResult by hand here — flattenChecks/getFailingChecks already parse
  // the leading "N." index and status the same way.
  const failing = getFailingChecks([{ level, record }]);
  const { quickWins, platformGaps } = splitByOwnership(failing);

  return (
    <RefreshOverlay isRefreshing={isRefreshing}>
      <CardShell accentColor={accentColor}>
        <div style={{ padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
              <svg width={64} height={64} viewBox="0 0 64 64">
                <circle cx={32} cy={32} r={radius} fill="none" stroke="var(--line, #E3E6EB)" strokeWidth={7} />
                <circle
                  cx={32} cy={32} r={radius} fill="none" stroke={accentColor} strokeWidth={7}
                  strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
                  transform="rotate(-90 32 32)"
                />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: accentColor }}>{pct}%</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: accentColor }}>{level}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
              <span style={{ fontSize: 11, color: "var(--ink-2, #6F747F)" }}>{current}/{total} checks met</span>
            </div>
          </div>
          <span style={{ fontSize: 11, lineHeight: 1.5, color: "var(--ink-2, #6F747F)" }}>{LEVEL_META[level].outcome}</span>
          {failing.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 11, borderTop: "1px solid var(--line-soft, #F2F4F7)" }}>
              {quickWins.length > 0 && (
                <>
                  <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.7, color: "var(--ink-2, #6F747F)" }}>
                    QUICK WINS ({quickWins.length})
                  </span>
                  {quickWins.map((c) => (
                    <ExecutiveOpenItem key={c.key} level={level} check={c} onCheckOpen={onCheckOpen} />
                  ))}
                </>
              )}
              {platformGaps.length > 0 && (
                <>
                  <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.7, color: "var(--ink-2, #6F747F)", marginTop: quickWins.length > 0 ? 6 : 0 }}>
                    PLATFORM GAPS ({platformGaps.length})
                  </span>
                  {platformGaps.map((c) => (
                    <ExecutiveOpenItem key={c.key} level={level} check={c} onCheckOpen={onCheckOpen} />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </CardShell>
    </RefreshOverlay>
  );
};
