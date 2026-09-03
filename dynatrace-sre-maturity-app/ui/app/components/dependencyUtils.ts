// Normalizes /lookups/critical_services severity values, which carry known
// data-hygiene noise (a "medum" typo and blank "-" rows) — same tolerance
// pattern already used in checkDetailConfigs.ts's "Critical Services Tagged" check.
export function severityRank(severity: string | null): number {
  const s = (severity || "").toLowerCase();
  if (s === "high") return 1;
  if (s.startsWith("med")) return 2;
  if (s === "low") return 3;
  return 4;
}

// Criticality is an ORDINAL scale (High > Medium > Low), not a set of
// independent categories — so it gets one hue at monotone lightness steps
// (dark = most severe, light = least) rather than distinct "signal" hues.
// Red and amber are deliberately not reused here: this app already gives
// them fixed meaning elsewhere in this same view (red = active problem /
// root cause, amber = impacted/victim) — reusing them for criticality too
// would make one color mean two different things depending on context.
// Violet was picked as a hue not already claimed by another status in this
// view (blue is the generic UI/selection accent). Values are the light-mode
// ramp; validated with the dataviz skill's ordinal checks (monotone
// lightness, single hue, light-end contrast >= 2:1 against this app's
// --sre-surface).
export function severityColor(severity: string | null): string | null {
  switch (severityRank(severity)) {
    case 1:
      return "#4c1d95"; // High — deep violet
    case 2:
      return "#7c3aed"; // Medium — mid violet
    case 3:
      return "#a78bfa"; // Low — light violet
    default:
      return null; // None — neutral grey, rendered by callers
  }
}

export function severityLabel(severity: string | null): string {
  switch (severityRank(severity)) {
    case 1:
      return "High";
    case 2:
      return "Medium";
    case 3:
      return "Low";
    default:
      return "—";
  }
}

// Auto-formats a microsecond duration into the smallest sensible unit —
// mirrors GoldenSignalsPage.tsx's formatDurationUs, using "s"/"ms" abbreviations.
export function formatDurationUs(us: number): string {
  if (us >= 60 * 1000000) return `${(us / (60 * 1000000)).toFixed(1)} min`;
  if (us >= 1000000) return `${(us / 1000000).toFixed(2)} s`;
  if (us >= 1000) return `${(us / 1000).toFixed(0)} ms`;
  return `${Math.round(us)} μs`;
}
