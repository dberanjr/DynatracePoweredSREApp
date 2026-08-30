// Per-level card in the Scorecards redesign. No longer fetches its own data
// or owns modal state — ScorecardsPage fetches once and passes the resolved
// record down, and a single shared CheckDetailModal lives at the
// ScorecardsPage level so hero-banner cells and card-grid rows open the same
// modal.
import React from "react";
import { Link } from "react-router-dom";
import { Paragraph } from "@dynatrace/strato-components/typography";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { RefreshOverlay } from "./RefreshOverlay";
import { LEVEL_META, CHECK_DETAIL_CONFIGS } from "./checkDetailConfigs";
import { LevelId, getStatus, getFailingChecks, splitByOwnership, CheckResult } from "./checkStatus";
import { CheckHoverPreview } from "./CheckHoverPreview";
import { HardcodedBadge } from "./HardcodedBadge";

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

const STATUS_STYLES = {
  pass: { bg: "rgba(30,158,90,.10)", border: "rgba(30,158,90,.34)", text: "var(--pass-ink, #17663C)" },
  fail: { bg: "rgba(220,53,69,.11)", border: "rgba(220,53,69,.34)", text: "var(--fail-ink, #B3261E)" },
  warn: { bg: "rgba(232,163,61,.14)", border: "rgba(232,163,61,.38)", text: "var(--warn-ink, #8A6100)" },
  na: { bg: "rgba(143,160,188,.10)", border: "rgba(143,160,188,.32)", text: "var(--na-ink, #4C5B73)" },
};

function parseScore(record: Record<string, unknown>): { current: number; total: number } {
  const scoreKey = Object.keys(record).find((k) => k.toLowerCase().includes("score"));
  if (!scoreKey) return { current: 0, total: 0 };
  const match = String(record[scoreKey]).match(/(\d+)\s*\/\s*(\d+)/);
  return match ? { current: parseInt(match[1], 10), total: parseInt(match[2], 10) } : { current: 0, total: 0 };
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
        <Link to="/definitions" style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink-2, #6F747F)" }}>
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
          padding: "8px 10px",
          display: "flex",
          gap: 8,
          cursor: "pointer",
          borderBottom: "1px solid var(--line-soft, #F2F4F7)",
          background: hovered ? s.bg : "transparent",
        }}
      >
        <div style={{ width: 4, flexShrink: 0, borderRadius: 2, background: s.border }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: s.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {checkKey.replace(/^\d+\.\s*/, "")}
            </span>
            {hardcoded && <HardcodedBadge size="chip" />}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink, #1A2440)", lineHeight: 1.35, marginTop: 1 }}>
            {display || (status === "na" ? "N/A" : status === "fail" ? "Not detected" : "Active")}
          </div>
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
    return (
      <CardShell accentColor={accentColor}>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, minHeight: 300, justifyContent: "center" }}>
          <ProgressCircle size="small" />
          <Paragraph style={{ fontSize: 12 }}>Loading...</Paragraph>
        </div>
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
