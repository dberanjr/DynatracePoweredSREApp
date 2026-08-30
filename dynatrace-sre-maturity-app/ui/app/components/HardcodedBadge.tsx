// Visible marker for the 4 checks whose DQL is an unconditional literal
// string today (see checkDetailConfigs.ts's CHECK_REDESIGN_META comment) —
// used wherever such a check's status renders, so it's never mistaken for a
// real per-app measurement. `size="chip"` is a compact inline label for
// tight spaces (heatmap cells, card rows); `size="full"` adds the explanatory
// sentence, for the hover popover and modal.
import React from "react";

export const HardcodedBadge = ({ size = "chip" }: { size?: "chip" | "full" }) => {
  const chip = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: 0.5,
        color: "#fff",
        background:
          "repeating-linear-gradient(135deg, #6b7280, #6b7280 4px, #545a63 4px, #545a63 8px)",
        borderRadius: 4,
        padding: "2px 6px",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
      title="Not yet live: same result for every application until this capability is built"
    >
      Not yet live
    </span>
  );

  if (size === "chip") return chip;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      {chip}
      <span style={{ fontSize: 11, lineHeight: 1.4, color: "var(--ink-2, #6F747F)" }}>
        Same result for every application in this tenant until this capability is built — not a per-app measurement yet.
      </span>
    </div>
  );
};
