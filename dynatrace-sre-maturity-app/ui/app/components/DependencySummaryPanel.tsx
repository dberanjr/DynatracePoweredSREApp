import React from "react";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { DependencyChainResult } from "../hooks/useDependencyChain";
import { severityColor } from "./dependencyUtils";

interface Props {
  direction: "upstream" | "downstream";
  chain: DependencyChainResult;
}

const ACCENT = "#1966FF";

// Ranked, weighted AppCI pill: identity (the code) is a fixed single hue —
// these aren't a small comparable category set, so per-entity hues would
// violate the "never cycle categorical hues" rule for an open-ended list.
// Magnitude (how many chain nodes belong to that AppCI) is instead encoded
// sequentially via fill width, one hue light->dark, turning a flat tag list
// into a compact ranked mini-bar-chart.
function AppCIWeightRow({ code, count, max }: { code: string; count: number; max: number }) {
  const pct = Math.max(8, Math.round((count / max) * 100));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "var(--sre-text-primary)",
          width: 40,
          flexShrink: 0,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {code}
      </span>
      <div style={{ flex: 1, height: 10, borderRadius: 5, background: "rgba(25,102,255,0.08)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            borderRadius: 5,
            background: `linear-gradient(90deg, ${ACCENT}99, ${ACCENT})`,
          }}
        />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--sre-text-secondary)", width: 16, textAlign: "right" }}>
        {count}
      </span>
    </div>
  );
}

// The per-level "chain shape" — a small histogram of new-node count by level.
// This is the visualization of "total levels + total dependencies at every
// level": a scannable growth curve instead of a run of "L1: 3 L2: 8" text.
function ChainShapeBars({ chain }: { chain: DependencyChainResult }) {
  const levelNumbers = Object.keys(chain.perLevelCounts)
    .map(Number)
    .sort((a, b) => a - b);
  if (levelNumbers.length === 0) return null;
  const max = Math.max(1, ...levelNumbers.map((l) => chain.perLevelCounts[l]));
  const barMaxHeight = 44;

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: barMaxHeight + 28, marginBottom: 4 }}>
      {levelNumbers.map((lvl) => {
        const count = chain.perLevelCounts[lvl];
        const isLastAndCapped = chain.capped && lvl === levelNumbers[levelNumbers.length - 1];
        const h = Math.max(4, Math.round((count / max) * barMaxHeight));
        return (
          <div key={lvl} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "1 1 0", minWidth: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--sre-text-secondary)", marginBottom: 3 }}>{count}</span>
            <div
              title={`Level ${lvl}: ${count} new node${count === 1 ? "" : "s"}`}
              style={{
                width: "100%",
                maxWidth: 28,
                height: h,
                borderRadius: "4px 4px 0 0",
                background: isLastAndCapped ? `repeating-linear-gradient(135deg, ${ACCENT}, ${ACCENT} 3px, ${ACCENT}55 3px, ${ACCENT}55 6px)` : ACCENT,
              }}
            />
            <span style={{ fontSize: 9, color: "var(--sre-text-secondary)", marginTop: 3, opacity: 0.7 }}>
              L{lvl}
              {isLastAndCapped ? "+" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const DependencySummaryPanel = ({ direction, chain }: Props) => {
  const directLevel = chain.levels[1] || [];
  const rankedAppCIs = Object.entries(chain.appCICounts).sort((a, b) => b[1] - a[1]);
  const maxAppCICount = Math.max(1, ...rankedAppCIs.map(([, c]) => c));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontSize: 12 }}>
      <div>
        <Heading level={6} style={{ marginBottom: 8 }}>
          Direct (level 1) dependencies
        </Heading>
        {directLevel.length === 0 ? (
          <Paragraph style={{ color: "var(--sre-text-secondary)", opacity: 0.6, fontSize: 12 }}>None found</Paragraph>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {directLevel.map((n) => {
              const accent = severityColor(n.severity) || "var(--sre-border, rgba(0,0,0,0.12))";
              return (
                <div
                  key={n.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 8px",
                    borderLeft: `3px solid ${accent}`,
                    background: "var(--sre-table-stripe, rgba(0,0,0,0.02))",
                    borderRadius: 4,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontWeight: 600,
                      color: "var(--sre-text-primary)",
                    }}
                    title={n.name}
                  >
                    {n.name}
                  </span>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    {n.appCIs.length > 0 ? (
                      n.appCIs.map((a) => (
                        <span
                          key={a}
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "1px 6px",
                            borderRadius: 10,
                            background: "rgba(25,102,255,0.1)",
                            color: ACCENT,
                          }}
                        >
                          {a}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: 10, color: "var(--sre-text-secondary)", fontStyle: "italic" }}>Unresolved</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <Heading level={6} style={{ marginBottom: 8 }}>
          Chain shape — {chain.capped ? "8+ (capped)" : chain.totalLevels} level{chain.totalLevels === 1 ? "" : "s"}
        </Heading>
        <ChainShapeBars chain={chain} />
      </div>

      <div>
        <Heading level={6} style={{ marginBottom: 8 }}>
          Unique AppCIs {direction} ({rankedAppCIs.length})
        </Heading>
        {rankedAppCIs.length === 0 ? (
          <Paragraph style={{ color: "var(--sre-text-secondary)", opacity: 0.6, fontSize: 11 }}>None resolved</Paragraph>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {rankedAppCIs.map(([code, count]) => (
              <AppCIWeightRow key={code} code={code} count={count} max={maxAppCICount} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
