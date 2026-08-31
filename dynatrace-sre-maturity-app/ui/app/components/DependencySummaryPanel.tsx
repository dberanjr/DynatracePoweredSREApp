import React from "react";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { DependencyChainResult } from "../hooks/useDependencyChain";
import { severityColor } from "./dependencyUtils";

interface Props {
  direction: "upstream" | "downstream";
  chain: DependencyChainResult;
}

const chip = (label: string, key: string) => (
  <span
    key={key}
    style={{
      fontSize: 11,
      fontWeight: 700,
      padding: "2px 8px",
      borderRadius: 10,
      background: "rgba(25,102,255,0.1)",
      color: "#1966FF",
    }}
  >
    {label}
  </span>
);

export const DependencySummaryPanel = ({ direction, chain }: Props) => {
  const directLevel = chain.levels[1] || [];
  const directAppCIs = Array.from(new Set(directLevel.flatMap((n) => n.appCIs))).sort();
  const levelNumbers = Object.keys(chain.perLevelCounts)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 12 }}>
      <div>
        <Heading level={6} style={{ marginBottom: 6 }}>
          Direct (level 1) dependencies
        </Heading>
        {directLevel.length === 0 ? (
          <Paragraph style={{ color: "var(--sre-text-secondary)", opacity: 0.6, fontSize: 12 }}>None found</Paragraph>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 8 }}>
              <thead>
                <tr>
                  {["Service", "AppCI(s)"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "4px 8px",
                        borderBottom: "2px solid var(--sre-table-border)",
                        fontSize: 10,
                        fontWeight: 700,
                        color: "var(--sre-text-secondary)",
                        textTransform: "uppercase",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {directLevel.map((n) => {
                  const dot = severityColor(n.severity);
                  return (
                    <tr key={n.id}>
                      <td style={{ padding: "4px 8px", borderBottom: "1px solid var(--sre-table-border)" }}>
                        {dot && (
                          <span
                            style={{
                              display: "inline-block",
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: dot,
                              marginRight: 6,
                            }}
                          />
                        )}
                        {n.name}
                      </td>
                      <td style={{ padding: "4px 8px", borderBottom: "1px solid var(--sre-table-border)" }}>
                        {n.appCIs.length > 0 ? n.appCIs.join(", ") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {directAppCIs.length > 0 ? directAppCIs.map((a) => chip(a, a)) : (
                <Paragraph style={{ color: "var(--sre-text-secondary)", opacity: 0.6, fontSize: 11 }}>No resolved AppCIs</Paragraph>
              )}
            </div>
          </>
        )}
      </div>

      <div>
        <Heading level={6} style={{ marginBottom: 6 }}>
          Full {direction} chain stats
        </Heading>
        <Paragraph style={{ fontSize: 12, marginBottom: 4 }}>
          Total levels: <strong>{chain.capped ? "8+ (capped)" : chain.totalLevels}</strong>
        </Paragraph>
        {levelNumbers.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8, fontSize: 11 }}>
            {levelNumbers.map((lvl) => (
              <span key={lvl} style={{ color: "var(--sre-text-secondary)" }}>
                L{lvl}: <strong style={{ color: "var(--sre-text-primary)" }}>{chain.perLevelCounts[lvl]}</strong>
              </span>
            ))}
          </div>
        )}
        <Paragraph style={{ fontSize: 11, color: "var(--sre-text-secondary)", marginBottom: 4 }}>
          Unique AppCIs across all levels ({chain.uniqueAppCIsAllLevels.length}):
        </Paragraph>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {chain.uniqueAppCIsAllLevels.length > 0
            ? chain.uniqueAppCIsAllLevels.map((a) => chip(a, `all-${a}`))
            : (
              <Paragraph style={{ color: "var(--sre-text-secondary)", opacity: 0.6, fontSize: 11 }}>None resolved</Paragraph>
            )}
        </div>
      </div>
    </div>
  );
};
