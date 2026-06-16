import React from "react";
import { Link, useLocation } from "react-router-dom";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/overview", label: "Overview" },
  { to: "/golden-signals", label: "Golden Signals" },
  { to: "/ai-ops", label: "AI Ops" },
  { to: "/proactive", label: "Proactive" },
  { to: "/problem-analytics", label: "Problem Analytics" },
  { to: "/scorecards", label: "Scorecards" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/data", label: "Explore Data" },
];

export const Header = () => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/\/+$/, "") || "/";

  return (
    <nav style={{
      display: "flex",
      alignItems: "center",
      gap: 2,
      overflowX: "auto",
      whiteSpace: "nowrap",
      scrollbarWidth: "none",
      msOverflowStyle: "none",
      flexShrink: 0,
    }}>
      <style>{`nav::-webkit-scrollbar { display: none; }`}</style>
      <Link
        to="/"
        style={{
          fontSize: 14,
          fontWeight: 800,
          color: "var(--sre-text-primary, #1A2440)",
          textDecoration: "none",
          padding: "6px 12px 6px 0",
          marginRight: 4,
          flexShrink: 0,
        }}
      >
        DynatracePoweredSRE
      </Link>
      {navItems.map((item) => {
        const isActive = item.to === "/"
          ? currentPath === "/" || currentPath === ""
          : currentPath.startsWith(item.to);

        return (
          <Link
            key={item.to}
            to={item.to}
            style={{
              fontSize: 13,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? "#1414D3" : "var(--sre-text-secondary, #6F747F)",
              textDecoration: "none",
              padding: "6px 10px",
              borderBottom: isActive ? "3px solid #3BACF0" : "3px solid transparent",
              borderRadius: "4px 4px 0 0",
              background: isActive ? "rgba(20,20,211,0.04)" : "transparent",
              transition: "all 0.2s",
              flexShrink: 0,
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
};
