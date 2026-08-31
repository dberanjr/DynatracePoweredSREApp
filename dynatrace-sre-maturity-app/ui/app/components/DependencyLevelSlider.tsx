import React from "react";

interface Props {
  value: number;
  max: number;
  totalLevels: number;
  capped: boolean;
  onChange: (value: number) => void;
}

export const DependencyLevelSlider = ({ value, max, totalLevels, capped, onChange }: Props) => {
  const totalLabel = totalLevels === 0 ? "0" : capped ? `${max}+` : `${totalLevels}`;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <input
        type="range"
        min={1}
        max={max}
        value={value}
        disabled={totalLevels === 0}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: "#1966FF" }}
      />
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--sre-text-secondary)", whiteSpace: "nowrap" }}>
        Viewing {value} of up to {totalLabel} level{totalLabel === "1" ? "" : "s"}
      </span>
    </div>
  );
};
