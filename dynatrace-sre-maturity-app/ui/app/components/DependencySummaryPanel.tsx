import React from "react";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { DependencyChainResult, DependencyNode } from "../hooks/useDependencyChain";
import { severityColor } from "./dependencyUtils";

interface Props {
  direction: "upstream" | "downstream";
  chain: DependencyChainResult;
}

const ACCENT = "#1966FF";
const PROBLEM_RED = "#dc3545";

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

// Compact chip for a single direct dependency: border color is always the
// criticality color (or neutral if unrated); fill turns solid red only when
// the service has an active problem right now, regardless of criticality —
// live incident state is a separate signal from a static severity rating.
function DirectDepChip({ node }: { node: DependencyNode }) {
  const borderColor = severityColor(node.severity) || "var(--sre-border, rgba(0,0,0,0.25))";
  const hasProblem = !!node.problemRole;
  return (
    <span
      title={`${node.name}${node.appCIs.length ? ` — ${node.appCIs.join(", ")}` : ""}${hasProblem ? ` — ${node.problemRole}` : ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 9px",
        borderRadius: 12,
        border: `2px solid ${borderColor}`,
        background: hasProblem ? PROBLEM_RED : "var(--sre-table-stripe, rgba(0,0,0,0.03))",
        color: hasProblem ? "#fff" : "var(--sre-text-primary)",
        maxWidth: 220,
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
      {node.appCIs.length > 0 && (
        <span style={{ fontWeight: 800, opacity: hasProblem ? 0.95 : 0.6, flexShrink: 0 }}>{node.appCIs.join(",")}</span>
      )}
    </span>
  );
}

// The per-level "chain shape" — a small histogram of new-node count by level.
// Rendered above the topology map (page-level placement), since it's the
// summary a user wants to see before diving into the graph itself.
export function ChainShapeSummary({ direction, chain }: Props) {
  const levelNumbers = Object.keys(chain.perLevelCounts)
    .map(Number)
    .sort((a, b) => a - b);
  const barMaxHeight = 40;

  return (
    <div style={{ marginBottom: 8 }}>
      <Heading level={6} style={{ marginBottom: 6 }}>
        Chain shape — {chain.capped ? "8+ (capped)" : chain.totalLevels} level{chain.totalLevels === 1 ? "" : "s"}
      </Heading>
      {levelNumbers.length === 0 ? (
        <Paragraph style={{ color: "var(--sre-text-secondary)", opacity: 0.6, fontSize: 11 }}>
          No {direction} dependencies found
        </Paragraph>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: barMaxHeight + 26 }}>
          {(() => {
            const max = Math.max(1, ...levelNumbers.map((l) => chain.perLevelCounts[l]));
            return levelNumbers.map((lvl) => {
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
            });
          })()}
        </div>
      )}
    </div>
  );
}

export const DependencySummaryPanel = ({ direction, chain }: Props) => {
  const directLevel = chain.levels[1] || [];
  const rankedAppCIs = Object.entries(chain.appCICounts).sort((a, b) => b[1] - a[1]);
  const maxAppCICount = Math.max(1, ...rankedAppCIs.map(([, c]) => c));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 12 }}>
      <div>
        <Heading level={6} style={{ marginBottom: 6 }}>
          Direct (level 1) dependencies
        </Heading>
        {directLevel.length === 0 ? (
          <Paragraph style={{ color: "var(--sre-text-secondary)", opacity: 0.6, fontSize: 12 }}>None found</Paragraph>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {directLevel.map((n) => (
              <DirectDepChip key={n.id} node={n} />
            ))}
          </div>
        )}
      </div>

      <div>
        <Heading level={6} style={{ marginBottom: 6 }}>
          Unique AppCIs {direction} ({rankedAppCIs.length})
        </Heading>
        {rankedAppCIs.length === 0 ? (
          <Paragraph style={{ color: "var(--sre-text-secondary)", opacity: 0.6, fontSize: 11 }}>None resolved</Paragraph>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 160, overflowY: "auto", paddingRight: 6 }}>
            {rankedAppCIs.map(([code, count]) => (
              <AppCIWeightRow key={code} code={code} count={count} max={maxAppCICount} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
