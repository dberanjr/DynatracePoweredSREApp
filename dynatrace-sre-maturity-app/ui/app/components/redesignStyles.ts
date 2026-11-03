import type { CSSProperties } from "react";

// Style primitives for the redesigned look (the tokens live in ui/app/theme.css, with light and dark values).
//
// They reproduce what ScorecardCard and the header nav already do, so a new page looks like part of the same
// app without copying inline styles around: a `--card` surface with a `--line` hairline and `--shadow`, a
// 13.5px title over a divider, tiny uppercase eyebrow labels, `--chip` pills, and status text in the
// `--pass-ink` / `--warn-ink` / `--fail-ink` colors (which flip for dark mode, unlike a hard-coded hex).
// Every var() carries the light value as its fallback, as the existing components do.

/** Status text colors. Use these for text and icons; they stay readable in both themes. */
export const INK = {
  text: "var(--ink, #1A2440)",
  muted: "var(--ink-2, #6F747F)",
  pass: "var(--pass-ink, #17663C)",
  warn: "var(--warn-ink, #8A6100)",
  fail: "var(--fail-ink, #B3261E)",
  na: "var(--na-ink, #4C5B73)",
} as const;

/** Solid status fills (rails, a destructive button). Same literals as ScorecardCard's status rails. */
export const RAIL = { pass: "#1E9E5A", warn: "#E8A33D", fail: "#DC3545", na: "#8FA0BC" } as const;

/** Soft status backgrounds, as used for the tinted failing and warning rows on the scorecard. */
export const TINT = { warn: "rgba(232,163,61,.14)", fail: "rgba(220,53,69,.11)", pass: "rgba(30,158,90,.10)" } as const;

/** Solid accent for a primary button. Matches the nav's active accent; white text reads on it in both themes. */
export const ACCENT_SOLID = "#1414D3";

export const cardStyle: CSSProperties = {
  background: "var(--card, #fff)",
  border: "1px solid var(--line, #E3E6EB)",
  borderRadius: 10,
  boxShadow: "var(--shadow, 0 1px 2px rgba(26,36,64,.05))",
  overflow: "hidden",
};

export const cardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 8,
  padding: "11px 13px 10px",
  borderBottom: "1px solid var(--line, #E3E6EB)",
};

export const cardTitleStyle: CSSProperties = { fontSize: 13.5, fontWeight: 600, color: INK.text };
export const cardMetaStyle: CSSProperties = { marginLeft: "auto", fontSize: 11, color: INK.muted };
export const cardBodyStyle: CSSProperties = { padding: 13 };

/** Small uppercase label (the "PATH TO L5" / "STATUS" look). */
export const eyebrowStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.8,
  textTransform: "uppercase",
  color: INK.muted,
};

export const chipStyle: CSSProperties = {
  padding: "3px 10px",
  borderRadius: 12,
  border: "1px solid var(--line, #E3E6EB)",
  background: "var(--chip, #F4F6F9)",
  fontSize: 12,
  color: INK.text,
};

export const tableHeadCellStyle: CSSProperties = { ...eyebrowStyle, padding: "8px 10px", whiteSpace: "nowrap", textAlign: "left" };
export const tableCellStyle: CSSProperties = { padding: "7px 10px", whiteSpace: "nowrap", fontSize: 12, color: INK.text, fontVariantNumeric: "tabular-nums" };
export const tableHeadRowStyle: CSSProperties = { background: "var(--panel, #F7F8FA)" };
export const tableRowBorder = "1px solid var(--line-soft, #F2F4F7)";

/** An inline notice. `tone` picks the border and text color; the background is the matching soft tint. */
export const noticeStyle = (tone: "fail" | "warn" | "pass" | "neutral"): CSSProperties => ({
  padding: "10px 12px",
  borderRadius: 8,
  fontSize: 12,
  border: `1px solid ${tone === "neutral" ? "var(--line, #E3E6EB)" : RAIL[tone]}`,
  background: tone === "neutral" ? "var(--panel, #F7F8FA)" : TINT[tone],
  color: tone === "neutral" ? INK.text : INK[tone],
});

/** A tab in a sub-nav, styled like the header's pills: accent text, a cyan underline, a faint accent wash. */
export const subTabStyle = (isActive: boolean): CSSProperties => ({
  background: isActive ? "var(--nav-active-bg, rgba(20,20,211,.04))" : "transparent",
  border: "none",
  borderBottom: isActive ? "3px solid var(--lv1, #3BACF0)" : "3px solid transparent",
  borderRadius: "4px 4px 0 0",
  padding: "8px 16px",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: isActive ? 700 : 500,
  color: isActive ? "var(--nav-active, #1414D3)" : INK.muted,
});
