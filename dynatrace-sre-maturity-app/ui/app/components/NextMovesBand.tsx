import React from "react";
import { getTopMoves } from "./checkStatus";
import type { LevelRecord } from "./checkStatus";
import { HardcodedBadge } from "./HardcodedBadge";

interface Props {
  levelRecords: LevelRecord[];
  onCheckOpen: (level: LevelRecord["level"], key: string, value: string) => void;
}

const EFFORT_COLOR: Record<string, string> = { Low: "#49C2B3", Medium: "#E8A33D", High: "#DC3545" };

export const NextMovesBand = ({ levelRecords, onCheckOpen }: Props) => {
  const moves = getTopMoves(levelRecords, 4);
  if (moves.length === 0) return null;

  return (
    <div
      style={{
        background: "var(--band, #141C31)",
        borderRadius: 12,
        display: "flex",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: 212,
          flexShrink: 0,
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          background: "linear-gradient(180deg, rgba(94,40,229,.22), rgba(20,28,49,0))",
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.1, color: "rgba(255,255,255,.45)" }}>
          PATH TO L5
        </span>
        <span style={{ fontSize: 19, fontWeight: 600, color: "#fff", lineHeight: 1.15 }}>
          Next {moves.length} move{moves.length === 1 ? "" : "s"}
        </span>
        <span style={{ fontSize: 11.5, lineHeight: 1.5, color: "rgba(255,255,255,.5)" }}>
          Ranked by level, foundational checks first.
        </span>
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "grid",
          gridTemplateColumns: `repeat(${moves.length}, 1fr)`,
          gap: 10,
          padding: "14px 12px",
        }}
      >
        {moves.map((m) => (
          <div
            key={m.check.key}
            onClick={() => onCheckOpen(m.check.level, m.check.key, m.check.value)}
            style={{
              background: "rgba(255,255,255,.055)",
              border: "1px solid rgba(255,255,255,.10)",
              borderRadius: 10,
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 7,
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span
                style={{
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: "#fff",
                  lineHeight: 1.25,
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {m.title}
              </span>
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  color: "rgba(255,255,255,.6)",
                  border: "1px solid rgba(255,255,255,.25)",
                  borderRadius: 4,
                  padding: "2px 6px",
                  flexShrink: 0,
                }}
              >
                {m.levelTag}
              </span>
            </div>
            {m.hardcoded && <HardcodedBadge size="chip" />}
            <span
              style={{
                fontSize: 11.5,
                lineHeight: 1.5,
                color: "rgba(255,255,255,.62)",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
              }}
            >
              {m.body}
            </span>
            <div
              style={{
                marginTop: "auto",
                display: "flex",
                alignItems: "center",
                gap: 14,
                paddingTop: 7,
                borderTop: "1px solid rgba(255,255,255,.09)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5, color: "rgba(255,255,255,.35)" }}>
                  IMPACT
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#49C2B3" }}>{m.impact}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5, color: "rgba(255,255,255,.35)" }}>
                  EFFORT
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: EFFORT_COLOR[m.effort] }}>{m.effort}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5, color: "rgba(255,255,255,.35)" }}>
                  OWNER
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,.8)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {m.owner}
                </span>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,.45)", flexShrink: 0 }}>
                open ↗
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
