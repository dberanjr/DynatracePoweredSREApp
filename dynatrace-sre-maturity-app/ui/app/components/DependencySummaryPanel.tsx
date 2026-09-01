import React from "react";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { DependencyChainResult, DependencyNode, MAX_LEVELS } from "../hooks/useDependencyChain";
import { severityColor } from "./dependencyUtils";

interface Props {
  direction: "upstream" | "downstream";
  chain: DependencyChainResult;
}

interface ProblematicService {
  id: string;
  name: string;
}

interface SummaryPanelProps extends Props {
  /** Currently-selected level count for this direction (the map's slider
   * value) — one chip section is rendered per level from 1 up to this. */
  levels: number;
  onSelectService: (serviceId: string, serviceName: string) => void;
  /** Fired when an AppCI row with at least one problematic service is
   * clicked. The caller switches the global AppCI filter to this code and
   * decides what to do with the service list (auto-select if there's
   * exactly one, otherwise let the user pick). */
  onSelectAppCI: (appCI: string, problematicServices: ProblematicService[]) => void;
}

const ACCENT = "#1966FF";
const PROBLEM_RED = "#dc3545";

// Ranked, weighted AppCI pill: identity (the code) is a fixed single hue —
// these aren't a small comparable category set, so per-entity hues would
// violate the "never cycle categorical hues" rule for an open-ended list.
// Magnitude (how many chain nodes belong to that AppCI) is instead encoded
// sequentially via fill width, one hue light->dark, turning a flat tag list
// into a compact ranked mini-bar-chart. A problem badge (root cause > has a
// problem, in that precedence) makes the row clickable — clicking hands the
// AppCI and its problematic services up to the caller.
function AppCIWeightRow({
  code,
  count,
  max,
  hasProblem,
  hasRootCause,
  problematicServices,
  onClick,
}: {
  code: string;
  count: number;
  max: number;
  hasProblem: boolean;
  hasRootCause: boolean;
  problematicServices: ProblematicService[];
  onClick: () => void;
}) {
  const pct = Math.max(8, Math.round((count / max) * 100));
  return (
    <div
      role={hasProblem ? "button" : undefined}
      tabIndex={hasProblem ? 0 : undefined}
      onClick={hasProblem ? onClick : undefined}
      onKeyDown={hasProblem ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
      title={hasProblem ? `${problematicServices.length} problematic service${problematicServices.length === 1 ? "" : "s"} — click to focus ${code}` : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        cursor: hasProblem ? "pointer" : "default",
      }}
    >
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
      {hasRootCause ? (
        <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 8, background: PROBLEM_RED, color: "#fff", flexShrink: 0 }}>
          Root cause
        </span>
      ) : hasProblem ? (
        <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 8, background: "#f0ad4e", color: "#fff", flexShrink: 0 }}>
          Problem
        </span>
      ) : null}
    </div>
  );
}

// Compact chip for a single dependency at any level: border color is always
// the criticality color (or neutral if unrated); fill turns solid red only
// when the service has an active problem right now (root cause or victim),
// regardless of criticality — live incident state is a separate signal from
// a static severity rating. Clicking pivots the whole view to focus on that
// service (immediate reflow, same as picking it from the table).
function DependencyChip({ node, onSelectService }: { node: DependencyNode; onSelectService: (id: string, name: string) => void }) {
  const borderColor = severityColor(node.severity) || "var(--sre-border, rgba(0,0,0,0.25))";
  const hasProblem = !!node.problemRole;
  return (
    <button
      type="button"
      onClick={() => onSelectService(node.id, node.name)}
      title={`${node.name}${node.appCIs.length ? ` — ${node.appCIs.join(", ")}` : ""}${hasProblem ? ` — ${node.problemRole}` : ""} — click to focus`}
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
        cursor: "pointer",
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
      {node.appCIs.length > 0 && (
        <span style={{ fontWeight: 800, opacity: hasProblem ? 0.95 : 0.6, flexShrink: 0 }}>{node.appCIs.join(",")}</span>
      )}
    </button>
  );
}

interface ChainShapeProps extends Props {
  selectedLevel: number;
  onLevelClick: (level: number) => void;
}

// The per-level "chain shape" — a small histogram of new-node count by
// level, rendered above the topology map. Each bar is clickable and sets
// the map's level slider directly, so the chart doubles as a level picker.
export function ChainShapeSummary({ direction, chain, selectedLevel, onLevelClick }: ChainShapeProps) {
  const barMaxHeight = 40;
  // Always render all 8 possible level slots (not just the levels that
  // actually have data) so the chart's shape/width is consistent across
  // services — a chain that dead-ends at level 3 visibly shows 5 empty
  // slots after it, rather than the chart just being narrower.
  const allLevels = Array.from({ length: MAX_LEVELS }, (_, i) => i + 1);
  const max = Math.max(1, ...allLevels.map((l) => chain.perLevelCounts[l] || 0));

  return (
    <div style={{ marginBottom: 8 }}>
      <Heading level={6} style={{ marginBottom: 6 }}>
        Chain shape — {chain.capped ? "8+ (capped)" : chain.totalLevels} level{chain.totalLevels === 1 ? "" : "s"}
      </Heading>
      {chain.totalLevels === 0 ? (
        <Paragraph style={{ color: "var(--sre-text-secondary)", opacity: 0.6, fontSize: 11 }}>
          No {direction} dependencies found
        </Paragraph>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: barMaxHeight + 26 }}>
          {allLevels.map((lvl) => {
            const count = chain.perLevelCounts[lvl] || 0;
            const isEmpty = count === 0;
            const isSelected = lvl === selectedLevel;
            const isLastAndCapped = chain.capped && lvl === MAX_LEVELS;
            const h = isEmpty ? 3 : Math.max(4, Math.round((count / max) * barMaxHeight));
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => onLevelClick(lvl)}
                title={isEmpty ? `Level ${lvl}: no dependencies — click to show up to this level` : `Level ${lvl}: ${count} new node${count === 1 ? "" : "s"} — click to show up to this level`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  flex: "1 1 0",
                  minWidth: 0,
                  background: isSelected ? "rgba(25,102,255,0.08)" : "transparent",
                  border: "none",
                  borderRadius: 4,
                  padding: "2px 0 0",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--sre-text-secondary)", marginBottom: 3, opacity: isEmpty ? 0.4 : 1 }}>
                  {count}
                </span>
                <div
                  style={{
                    width: "100%",
                    maxWidth: 28,
                    height: h,
                    borderRadius: "4px 4px 0 0",
                    background: isEmpty
                      ? "var(--sre-border, rgba(0,0,0,0.12))"
                      : isLastAndCapped
                        ? `repeating-linear-gradient(135deg, ${ACCENT}, ${ACCENT} 3px, ${ACCENT}55 3px, ${ACCENT}55 6px)`
                        : ACCENT,
                  }}
                />
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: isSelected ? 800 : 400,
                    color: isSelected ? ACCENT : "var(--sre-text-secondary)",
                    marginTop: 3,
                    opacity: isEmpty && !isSelected ? 0.4 : 0.85,
                  }}
                >
                  L{lvl}
                  {isLastAndCapped ? "+" : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function levelHeading(lvl: number, direction: "upstream" | "downstream"): string {
  return lvl === 1 ? "Direct (level 1) dependencies" : `${lvl} levels deep ${direction}`;
}

// Per-AppCI problem status, derived from whichever levels are currently
// rendered (1..levels) — the same scope already used for the per-level chip
// sections and the graph's problem highlighting, since the active-problem
// join is only fetched for rendered levels to begin with (see
// useDependencyChain). Expanding the level slider naturally reveals more of
// the picture, consistent with how everything else in this view loads.
function computeAppCIProblems(chain: DependencyChainResult, levels: number) {
  const byAppCI = new Map<string, { hasProblem: boolean; hasRootCause: boolean; services: Map<string, string> }>();
  for (let lvl = 1; lvl <= levels; lvl++) {
    for (const n of chain.levels[lvl] || []) {
      if (!n.problemRole) continue;
      for (const appci of n.appCIs) {
        const entry = byAppCI.get(appci) || { hasProblem: false, hasRootCause: false, services: new Map<string, string>() };
        entry.hasProblem = true;
        if (n.problemRole === "Root cause") entry.hasRootCause = true;
        entry.services.set(n.id, n.name);
        byAppCI.set(appci, entry);
      }
    }
  }
  return byAppCI;
}

export const DependencySummaryPanel = ({ direction, chain, levels, onSelectService, onSelectAppCI }: SummaryPanelProps) => {
  const rankedAppCIs = Object.entries(chain.appCICounts).sort((a, b) => b[1] - a[1]);
  const maxAppCICount = Math.max(1, ...rankedAppCIs.map(([, c]) => c));
  const levelNumbers = Array.from({ length: levels }, (_, i) => i + 1);
  const appCIProblems = computeAppCIProblems(chain, levels);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 12 }}>
      {levelNumbers.map((lvl) => {
        const levelNodes = chain.levels[lvl] || [];
        return (
          <div key={lvl}>
            <Heading level={6} style={{ marginBottom: 6 }}>
              {levelHeading(lvl, direction)}
            </Heading>
            {levelNodes.length === 0 ? (
              <Paragraph style={{ color: "var(--sre-text-secondary)", opacity: 0.6, fontSize: 12 }}>None found</Paragraph>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {levelNodes.map((n) => (
                  <DependencyChip key={n.id} node={n} onSelectService={onSelectService} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div>
        <Heading level={6} style={{ marginBottom: 6 }}>
          Unique AppCIs {direction} ({rankedAppCIs.length})
        </Heading>
        {rankedAppCIs.length === 0 ? (
          <Paragraph style={{ color: "var(--sre-text-secondary)", opacity: 0.6, fontSize: 11 }}>None resolved</Paragraph>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 160, overflowY: "auto", paddingRight: 6 }}>
            {rankedAppCIs.map(([code, count]) => {
              const problemInfo = appCIProblems.get(code);
              const problematicServices: ProblematicService[] = problemInfo
                ? Array.from(problemInfo.services, ([id, name]) => ({ id, name }))
                : [];
              return (
                <AppCIWeightRow
                  key={code}
                  code={code}
                  count={count}
                  max={maxAppCICount}
                  hasProblem={!!problemInfo?.hasProblem}
                  hasRootCause={!!problemInfo?.hasRootCause}
                  problematicServices={problematicServices}
                  onClick={() => onSelectAppCI(code, problematicServices)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
