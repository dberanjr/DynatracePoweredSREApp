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

export function severityColor(severity: string | null): string | null {
  switch (severityRank(severity)) {
    case 1:
      return "#dc3545";
    case 2:
      return "#f0ad4e";
    case 3:
      return "#3BACF0";
    default:
      return null;
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
