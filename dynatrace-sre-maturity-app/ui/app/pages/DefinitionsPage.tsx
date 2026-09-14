import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { CHECK_DETAIL_CONFIGS, LEVEL_META, CheckDetailConfig } from "../components/checkDetailConfigs";

type Level = "L1" | "L2" | "L3" | "L4" | "L5";
const LEVELS: Level[] = ["L1", "L2", "L3", "L4", "L5"];

function isLevel(v: string | null): v is Level {
  return !!v && (LEVELS as string[]).includes(v);
}

// Minimal DQL syntax highlighter — renders a code block with line-level comment dimming.
function DQLBlock({ code }: { code: string }) {
  const lines = code.split("\n");
  return (
    <pre
      style={{
        margin: 0,
        padding: "14px 16px",
        background: "var(--sre-code-bg, #0d1117)",
        borderRadius: 8,
        overflowX: "auto",
        fontSize: 11.5,
        lineHeight: 1.7,
        fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, Monaco, Consolas, monospace",
        whiteSpace: "pre",
      }}
    >
      {lines.map((line, i) => {
        const trimmed = line.trimStart();
        // Comment lines
        if (trimmed.startsWith("//") || trimmed.startsWith("#")) {
          return (
            <span key={i} style={{ color: "#8b949e" }}>
              {line}
              {"\n"}
            </span>
          );
        }
        // Blank lines
        if (trimmed === "") {
          return <span key={i}>{"\n"}</span>;
        }
        // Lines with pipe operators — highlight pipe
        const parts = line.split("|");
        if (parts.length > 1) {
          return (
            <span key={i}>
              {parts.map((part, j) => (
                <React.Fragment key={j}>
                  {j > 0 && <span style={{ color: "#79c0ff" }}>|</span>}
                  <span style={{ color: "#e6edf3" }}>{part}</span>
                </React.Fragment>
              ))}
              {"\n"}
            </span>
          );
        }
        return (
          <span key={i} style={{ color: "#e6edf3" }}>
            {line}
            {"\n"}
          </span>
        );
      })}
    </pre>
  );
}

function CheckDefinitionCard({ label, config }: { label: string; config: CheckDetailConfig }) {
  const [showDql, setShowDql] = useState(false);

  const statusColors: Record<string, string> = {
    L1: "#57C0F4",
    L2: "#2E3EEA",
    L3: "#611CD9",
    L4: "#B23BE4",
    L5: "#E436FF",
  };
  const color = statusColors[config.level] ?? "#888";

  return (
    <div
      style={{
        background: "var(--sre-surface, #fff)",
        borderRadius: 10,
        border: "1px solid var(--sre-border, rgba(0,0,0,0.08))",
        overflow: "hidden",
        boxShadow: "0 1px 3px var(--sre-card-shadow)",
        marginBottom: 14,
      }}
    >
      {/* Check header */}
      <div
        style={{
          padding: "12px 16px",
          background: `${color}10`,
          borderBottom: `2px solid ${color}30`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            color,
            background: `${color}20`,
            padding: "2px 8px",
            borderRadius: 4,
            letterSpacing: 0.5,
            flexShrink: 0,
          }}
        >
          {config.level}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--sre-text-primary, #1f2328)" }}>
          {label}
        </span>
      </div>

      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Description */}
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: "var(--sre-text-primary, #1f2328)" }}>
          {config.description}
        </p>

        {/* Pass logic */}
        <div
          style={{
            padding: "9px 13px",
            borderRadius: 7,
            background: `${color}10`,
            border: `1px solid ${color}30`,
            fontSize: 12,
            color: "var(--sre-text-primary, #1f2328)",
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color }}>Pass logic: </strong>
          {config.passLogic}
        </div>

        {/* Guidance */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--sre-text-secondary, #6F747F)",
              letterSpacing: 0.6,
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            How to improve
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: "var(--sre-text-primary, #1f2328)" }}>
            {config.guidance}
          </p>
        </div>

        {/* DQL snippet toggle */}
        <div>
          <button
            onClick={() => setShowDql((v) => !v)}
            style={{
              background: "none",
              border: `1px solid ${color}40`,
              borderRadius: 6,
              padding: "5px 12px",
              fontSize: 11,
              fontWeight: 600,
              color,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 13 }}>{showDql ? "▾" : "▸"}</span>
            {showDql ? "Hide DQL" : "Show DQL"}
          </button>
          {showDql && (
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--sre-text-secondary, #6F747F)",
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                Scorecard DQL Query
              </div>
              <DQLBlock code={config.scorecardSnippet} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LevelPanel({ level }: { level: Level }) {
  const meta = LEVEL_META[level];
  const checks = Object.entries(CHECK_DETAIL_CONFIGS).filter(([, cfg]) => cfg.level === level);

  return (
    <div>
      {/* Level summary */}
      <div
        style={{
          padding: "16px 20px",
          background: `${meta.color}0d`,
          border: `1px solid ${meta.color}30`,
          borderRadius: 10,
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: meta.color,
              background: `${meta.color}20`,
              padding: "3px 10px",
              borderRadius: 5,
            }}
          >
            {level}
          </span>
          <Heading level={5} style={{ margin: 0, color: "var(--sre-text-primary, #1f2328)" }}>
            {meta.title}
          </Heading>
        </div>
        <Paragraph style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: "var(--sre-text-primary, #1f2328)" }}>
          {meta.summary}
        </Paragraph>
      </div>

      {/* Check cards */}
      {checks.map(([label, cfg]) => (
        <CheckDefinitionCard key={label} label={label} config={cfg} />
      ))}
    </div>
  );
}

export const DefinitionsPage = () => {
  // "def" links from ScorecardCard land here as /definitions?level=L3 so the
  // tab opens on the level the user actually clicked from, not always L1.
  const [searchParams] = useSearchParams();
  const levelParam = searchParams.get("level");
  const [activeLevel, setActiveLevel] = useState<Level>(isLevel(levelParam) ? levelParam : "L1");

  const tabColors: Record<Level, string> = {
    L1: "#57C0F4",
    L2: "#2E3EEA",
    L3: "#611CD9",
    L4: "#B23BE4",
    L5: "#E436FF",
  };

  return (
    <Flex flexDirection="column" gap={0} padding={16}>
      <div style={{ marginBottom: 16 }}>
        <Heading level={3} style={{ margin: "0 0 4px" }}>SRE Maturity — Check Definitions</Heading>
        <Paragraph style={{ margin: 0, fontSize: 13, color: "var(--sre-text-secondary, #6F747F)" }}>
          Full descriptions, pass/fail formulas, and DQL queries for every maturity check across L1–L5.
          Click "Show DQL" on any check to reveal the exact query logic used in the scorecard.
        </Paragraph>
      </div>

      {/* Level tab bar */}
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "2px solid var(--sre-border, rgba(0,0,0,0.1))",
          marginBottom: 20,
          overflowX: "auto",
        }}
      >
        {LEVELS.map((lv) => {
          const isActive = lv === activeLevel;
          const color = tabColors[lv];
          const meta = LEVEL_META[lv];
          const count = Object.values(CHECK_DETAIL_CONFIGS).filter((c) => c.level === lv).length;
          return (
            <button
              key={lv}
              onClick={() => setActiveLevel(lv)}
              style={{
                background: isActive ? `${color}14` : "transparent",
                border: "none",
                borderBottom: isActive ? `3px solid ${color}` : "3px solid transparent",
                padding: "10px 18px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                flexShrink: 0,
                borderRadius: "6px 6px 0 0",
                transition: "all 0.15s",
                marginBottom: -2,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: isActive ? 800 : 600,
                  color: isActive ? color : "var(--sre-text-secondary, #6F747F)",
                }}
              >
                {lv}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: isActive ? color : "var(--sre-text-secondary, #6F747F)",
                  fontWeight: isActive ? 600 : 400,
                  opacity: isActive ? 1 : 0.75,
                  maxWidth: 120,
                  textAlign: "center",
                  lineHeight: 1.2,
                }}
              >
                {meta.title}
              </span>
              <span
                style={{
                  fontSize: 9,
                  background: isActive ? color : "rgba(128,128,128,0.2)",
                  color: isActive ? "#fff" : "var(--sre-text-secondary)",
                  padding: "1px 6px",
                  borderRadius: 9,
                  fontWeight: 700,
                }}
              >
                {count} checks
              </span>
            </button>
          );
        })}
      </div>

      {/* Active level content */}
      <LevelPanel level={activeLevel} />
    </Flex>
  );
};
