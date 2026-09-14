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

const POPUP_WIDTH = 300;
const HOVER_DELAY_MS = 800;

export const CheckHoverPreview = ({ checkKey, value, accentColor, children }: Props) => {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const timeoutRef = React.useRef<number | null>(null);
  const [coords, setCoords] = React.useState<{ x: number; top?: number; bottom?: number } | null>(null);

  const clearTimer = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const show = () => {
    clearTimer();
    timeoutRef.current = window.setTimeout(() => {
      // wrapperRef's div is `display: contents` (so it doesn't disturb the
      // flex/grid layout it sits in), which means it has no box of its own —
      // getBoundingClientRect() on it returns an empty rect at (0,0). Measure
      // its rendered child instead, or the popup pins to the viewport corner.
      const target = (wrapperRef.current?.firstElementChild ?? wrapperRef.current) as HTMLElement | null;
      const r = target?.getBoundingClientRect();
      if (!r) return;
      const centerX = r.left + r.width / 2;
      const x = Math.max(12, Math.min(window.innerWidth - POPUP_WIDTH - 12, centerX - POPUP_WIDTH / 2));
      const spaceBelow = window.innerHeight - r.bottom;
      const spaceAbove = r.top;
      if (spaceBelow < 260 && spaceAbove > spaceBelow) {
        setCoords({ x, bottom: window.innerHeight - r.top + 8 });
      } else {
        setCoords({ x, top: r.bottom + 8 });
      }
    }, HOVER_DELAY_MS);
  };

  const hide = () => {
    clearTimer();
    setCoords(null);
  };

  React.useEffect(() => clearTimer, []);

  const config = CHECK_DETAIL_CONFIGS[checkKey];
  const status = getStatus(value);
  const display = value.replace(/^(pass|fail|warn|n\/a)\s*/i, "");
  const levelInfo = config ? LEVEL_META[config.level] : null;
  // passLogic is usually "Pass: ..." or "N/A: ...", but a couple of
  // known-not-yet-live checks are a single plain sentence with no leading
  // label — only split off a label when the text before the colon reads
  // like one (short), not when a colon happens to appear mid-sentence.
  const passLogicText = config?.passLogic ?? "";
  const colonIdx = passLogicText.indexOf(":");
  const hasLabel = colonIdx > 0 && colonIdx < 12;
  const formulaLabel = hasLabel ? passLogicText.slice(0, colonIdx).toUpperCase() : null;
  const formula = hasLabel ? passLogicText.slice(colonIdx + 1).trim() : passLogicText;

  return (
    <div ref={wrapperRef} onMouseEnter={show} onMouseLeave={hide} style={{ display: "contents" }}>
      {children}
      {coords &&
        config &&
        ReactDOM.createPortal(
          <div
            style={{
              position: "fixed",
              left: coords.x,
              top: coords.top,
              bottom: coords.bottom,
              width: POPUP_WIDTH,
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
            <div style={{ padding: "12px 14px 11px", display: "flex", flexDirection: "column", gap: 9 }}>
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
                <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0 }}>
                  {checkKey.replace(/^\d+\.\s*/, "")}
                </span>
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, color: STATUS_COLOR[status] }}>
                  {STATUS_LABEL[status]}
                </span>
              </div>
              {config.hardcoded && <HardcodedBadge size="chip" />}
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink, #1A2440)", lineHeight: 1.3 }}>
                {display || "—"}
              </div>
              {formula && (
                <div
                  style={{
                    background: levelInfo ? `${levelInfo.color}14` : "var(--panel, #F7F8FA)",
                    border: `1px solid ${levelInfo ? levelInfo.color + "40" : "var(--line, #E3E6EB)"}`,
                    borderRadius: 7,
                    padding: "7px 10px",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 11,
                    lineHeight: 1.4,
                  }}
                >
                  {formulaLabel && <strong style={{ color: levelInfo?.color }}>{formulaLabel}: </strong>}
                  {formula}
                </div>
              )}
              <span style={{ fontSize: 10, color: "var(--ink-2, #6F747F)" }}>Click for full detail →</span>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
