import React from "react";

const ITEMS = [
  { label: "High", color: "#dc3545", shape: "ring" as const },
  { label: "Medium", color: "#f0ad4e", shape: "ring" as const },
  { label: "Low", color: "#3BACF0", shape: "ring" as const },
  { label: "None", color: "var(--sre-border, rgba(0,0,0,0.3))", shape: "ring" as const },
  { label: "Active problem", color: "#dc3545", shape: "fill" as const },
];

// Single shared color key — the same High/Medium/Low/None + Active-problem
// vocabulary is reused across the severity dot (table), chip borders
// (direct dependencies), and node borders/fills (topology map), so one
// legend covers all three surfaces.
export const SeverityLegend = () => (
  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", fontSize: 11, color: "var(--sre-text-secondary)" }}>
    {ITEMS.map((item) => (
      <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span
          style={{
            width: 11,
            height: 11,
            borderRadius: "50%",
            border: `2px solid ${item.color}`,
            background: item.shape === "fill" ? item.color : "transparent",
            flexShrink: 0,
          }}
        />
        {item.label}
      </div>
    ))}
  </div>
);
