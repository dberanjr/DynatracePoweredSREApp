import React from "react";
import ReactDOM from "react-dom";
import { CHECK_DETAIL_CONFIGS, LEVEL_META } from "./checkDetailConfigs";
import { getStatus } from "./checkStatus";
import { HardcodedBadge } from "./HardcodedBadge";

interface Props {
  checkKey: string;
  value: string;
  accentColor: string;
  children: React.ReactNode;
}

const STATUS_LABEL: Record<string, string> = { pass: "PASS", fail: "FAIL", warn: "WARN", na: "N/A" };
const STATUS_COLOR: Record<string, string> = {
  pass: "var(--pass-ink, #17663C)",
  fail: "var(--fail-ink, #B3261E)",
  warn: "var(--warn-ink, #8A6100)",
  na: "var(--na-ink, #4C5B73)",
};

export const CheckHoverPreview = ({ checkKey, value, accentColor, children }: Props) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [coords, setCoords] = React.useState<{ x: number; y: number } | null>(null);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const width = 340;
    const x = Math.max(12, Math.min(window.innerWidth - width - 12, r.left));
    setCoords({ x, y: r.bottom + 8 });
  };
  const hide = () => setCoords(null);

  const config = CHECK_DETAIL_CONFIGS[checkKey];
  const status = getStatus(value);
  const display = value.replace(/^(pass|fail|warn|n\/a)\s*/i, "");
  const levelInfo = config ? LEVEL_META[config.level] : null;

  return (
    <div ref={ref} onMouseEnter={show} onMouseLeave={hide} style={{ display: "contents" }}>
      {children}
      {coords &&
        config &&
        ReactDOM.createPortal(
          <div
            style={{
              position: "fixed",
              left: coords.x,
              top: coords.y,
              width: 340,
              zIndex: 9999,
              background: "var(--card, #fff)",
              border: "1px solid var(--line, rgba(0,0,0,0.08))",
              borderRadius: 12,
              boxShadow: "0 20px 60px rgba(20,28,49,.28)",
              overflow: "hidden",
              pointerEvents: "none",
            }}
          >
            <div style={{ height: 3, background: accentColor }} />
            <div style={{ padding: "13px 15px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    color: STATUS_COLOR[status],
                    background: "var(--panel, #F7F8FA)",
                    borderRadius: 4,
                    padding: "2px 7px",
                  }}
                >
                  {config.level}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 0 }}>
                  {checkKey.replace(/^\d+\.\s*/, "")}
                </span>
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, color: STATUS_COLOR[status] }}>
                  {STATUS_LABEL[status]}
                </span>
              </div>
              {config.hardcoded && <HardcodedBadge size="chip" />}
              <div style={{ fontSize: 12.5, color: "var(--ink, #1A2440)", lineHeight: 1.5 }}>
                {display || "—"}
              </div>
              <div>
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: 0.7,
                    color: "var(--ink-2, #6F747F)",
                    textTransform: "uppercase",
                  }}
                >
                  How it's calculated
                </span>
                <p style={{ margin: "4px 0 0", fontSize: 11.5, lineHeight: 1.5, color: "var(--ink, #1A2440)" }}>
                  {config.description}
                </p>
              </div>
              <div
                style={{
                  background: levelInfo ? `${levelInfo.color}14` : "var(--panel, #F7F8FA)",
                  border: `1px solid ${levelInfo ? levelInfo.color + "40" : "var(--line, #E3E6EB)"}`,
                  borderRadius: 7,
                  padding: "7px 10px",
                }}
              >
                <span style={{ fontSize: 11.5, lineHeight: 1.45 }}>
                  <strong style={{ color: levelInfo?.color }}>Passes when: </strong>
                  {config.passLogic}
                </span>
              </div>
              <span style={{ fontSize: 10.5, color: "var(--ink-2, #6F747F)" }}>Click for full detail →</span>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
