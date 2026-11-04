import React from "react";
import { isDemoMode, setDemoMode, useDemoMode } from "../demo/demoMode";

export const DemoModeToggleButton = () => {
  const demo = useDemoMode();
  return (
    <button
      onClick={() => setDemoMode(!isDemoMode())}
      title={demo ? "Demo mode is ON — showing sample data. Click to use live data." : "Switch to demo mode (sample data, no tenant queries)"}
      aria-pressed={demo}
      style={{
        background: demo ? "rgba(255,176,0,0.18)" : "rgba(0,0,0,0.06)",
        border: "1px solid " + (demo ? "rgba(255,176,0,0.6)" : "rgba(128,128,128,0.3)"),
        borderRadius: 20,
        padding: "6px 12px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        color: demo ? "#8A5A00" : "var(--sre-text-secondary, #6F747F)",
        fontWeight: 600,
        transition: "all 0.2s",
      }}
    >
      <span style={{ fontSize: 14 }}>{demo ? "🧪" : "○"}</span>
      Demo {demo ? "on" : "off"}
    </button>
  );
};

export const DemoModeBanner = () => {
  const demo = useDemoMode();
  if (!demo) return null;
  return (
    <div
      style={{
        background: "rgba(255,176,0,0.14)",
        borderBottom: "1px solid rgba(255,176,0,0.4)",
        color: "#8A5A00",
        fontSize: 12,
        fontWeight: 600,
        padding: "4px 16px",
        textAlign: "center",
      }}
    >
      Demo mode — all data shown is simulated sample data. No queries are sent to your Dynatrace tenant. The Readiness and Coverage tabs have no sample data yet.{" "}
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          setDemoMode(false);
        }}
        style={{ color: "inherit", textDecoration: "underline" }}
      >
        Exit demo
      </a>
    </div>
  );
};
