import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Paragraph } from "@dynatrace/strato-components/typography";
import { APP_VERSION, COMMIT_HASH, BUILD_DATE, DEPLOY_DATE } from "../version";

// Dynatrace brand palette (matches LandingPage / app design system)
const brand = {
  dark: "#1A2440",
  bullet: "#171C2D",
  accent1: "#49C2B3",
  accent2: "#3BACF0",
  accent3: "#1966FF",
  accent4: "#5E28E5",
  accent5: "#8D1CDC",
  accent6: "#C93FDB",
};

const CONFIG = {
  appName: "DynatracePoweredSRE",
  author: "David Beran",
  maintainer: "David Beran",
  email: "david.beran@dynatrace.com",
  repoLabel: "github.com/dberanjr/DynatracePoweredSREApp",
  repoUrl: "https://github.com/dberanjr/DynatracePoweredSREApp",
  license: "Apache License 2.0",
  environment: "Registered on your current Dynatrace tenant",
  description:
    "An SRE maturity assessment app that scores applications (by ApplicationCI) across a five-level reliability model — observability, measured reliability, AI-assisted operations, and beyond — using live Dynatrace Grail data.",
};

// Grail scopes the app requests (from app.config.json `scopes`), with a purpose each.
const SCOPES: { name: string; desc: string }[] = [
  { name: "storage:logs:read", desc: "Read log data" },
  { name: "storage:buckets:read", desc: "Read Grail buckets" },
  { name: "storage:files:read", desc: "Read lookup tables (/lookups/*)" },
  { name: "storage:events:read", desc: "Read events" },
  { name: "storage:bizevents:read", desc: "Read business events" },
  { name: "storage:metrics:read", desc: "Read metrics" },
  { name: "storage:entities:read", desc: "Read entity data (Smartscape topology)" },
  { name: "storage:system:read", desc: "Read system tables" },
];

function formatBuildDate(iso: string): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  const date = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
  return `${date} · ${time}`;
}

const cardStyle: React.CSSProperties = {
  background: "var(--sre-surface, #fff)",
  border: "1px solid var(--sre-border)",
  borderRadius: 10,
  padding: "24px 28px",
  boxShadow: "0 1px 3px var(--sre-card-shadow)",
};

const labelStyle: React.CSSProperties = {
  textTransform: "uppercase",
  letterSpacing: "1.2px",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--sre-text-secondary, #6F747F)",
};

const valueStyle: React.CSSProperties = {
  fontSize: 14,
  color: "var(--sre-text-primary, #1A2440)",
  lineHeight: 1.6,
};

const linkStyle: React.CSSProperties = { color: brand.accent3, textDecoration: "none" };

export const AboutPage = () => {
  const buildDate = formatBuildDate(BUILD_DATE);
  const deployDate = formatBuildDate(DEPLOY_DATE);
  const year = new Date().getFullYear();

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "App", value: CONFIG.appName },
    { label: "Version", value: <code>v{APP_VERSION}</code> },
    {
      label: "Build",
      value: (
        <span>
          {buildDate} · <code>{COMMIT_HASH}</code>
        </span>
      ),
    },
    {
      label: "Deployed",
      value: DEPLOY_DATE ? deployDate : "Not yet deployed",
    },
    { label: "Author", value: CONFIG.author },
    { label: "Maintainer", value: CONFIG.maintainer },
    {
      label: "Email",
      value: (
        <a style={linkStyle} href={`mailto:${CONFIG.email}`}>
          {CONFIG.email}
        </a>
      ),
    },
    {
      label: "Repository",
      value: (
        <a style={linkStyle} href={CONFIG.repoUrl} target="_blank" rel="noopener noreferrer">
          {CONFIG.repoLabel}
        </a>
      ),
    },
    {
      label: "Support",
      value: (
        <span>
          <a
            style={linkStyle}
            href={`${CONFIG.repoUrl}/issues/new`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Report an issue
          </a>
          {" · "}
          <a
            style={linkStyle}
            href={`${CONFIG.repoUrl}/issues/new?labels=enhancement`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Request a feature
          </a>
        </span>
      ),
    },
    { label: "License", value: CONFIG.license },
    { label: "Environment", value: CONFIG.environment },
    { label: "Description", value: CONFIG.description },
  ];

  return (
    <Flex flexDirection="column" style={{ background: "var(--sre-bg-primary, #fff)", minHeight: "100%" }}>
      {/* Hero */}
      <div
        style={{
          background: `linear-gradient(135deg, ${brand.dark}, ${brand.bullet})`,
          padding: "40px 48px 28px",
        }}
      >
        <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", letterSpacing: "-0.5px" }}>
          About
        </div>
        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 15, marginTop: 8, maxWidth: 720, lineHeight: 1.6 }}>
          {CONFIG.description}
        </div>
        <div
          style={{
            width: 220,
            height: 3,
            borderRadius: 2,
            marginTop: 20,
            background: `linear-gradient(90deg, ${brand.accent1}, ${brand.accent2}, ${brand.accent3}, ${brand.accent4}, ${brand.accent5}, ${brand.accent6})`,
          }}
        />
      </div>

      <Flex flexDirection="column" gap={16} style={{ padding: "28px 48px 40px", maxWidth: 1040 }}>
        {/* Attribution card */}
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", rowGap: 14, columnGap: 20 }}>
            {rows.map((row) => (
              <React.Fragment key={row.label}>
                <div style={labelStyle}>{row.label}</div>
                <div style={valueStyle}>{row.value}</div>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Permissions card */}
        {SCOPES.length > 0 ? (
          <div style={cardStyle}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--sre-text-primary, #1A2440)", marginBottom: 16 }}>
              Grail permissions required
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
              {SCOPES.map((scope) => (
                <div
                  key={scope.name}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 8,
                    background: "var(--sre-bg-primary, #F7F8FA)",
                    border: "1px solid var(--sre-border)",
                    borderLeft: `4px solid ${brand.accent1}`,
                  }}
                >
                  <div style={{ fontFamily: "monospace", fontWeight: 600, color: brand.accent3, wordBreak: "break-word" }}>
                    {scope.name}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "var(--sre-text-secondary, #6F747F)" }}>
                    {scope.desc}
                  </div>
                </div>
              ))}
            </div>
            <Paragraph style={{ marginTop: 16, fontSize: 13, color: "var(--sre-text-secondary, #6F747F)" }}>
              All scopes are read-only. They are requested at install time via the platform token
              dialog; none permit write access to your environment.
            </Paragraph>
          </div>
        ) : null}

        {/* Disclaimer */}
        <div
          style={{
            padding: "16px 20px",
            borderRadius: 10,
            color: "#8A5A00",
            background: "rgba(255,176,0,0.10)",
            border: "1px solid rgba(255,176,0,0.35)",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Field developed, not officially supported by Dynatrace. Use at your own risk.
        </div>

        {/* Footer */}
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--sre-text-primary, #1A2440)" }}>
            {CONFIG.appName}
          </div>
          <Paragraph style={{ marginTop: 4, fontSize: 13, color: "var(--sre-text-secondary, #6F747F)" }}>
            Copyright {year} {CONFIG.author}. Licensed under the {CONFIG.license}.
          </Paragraph>
          <Paragraph style={{ marginTop: 8, fontSize: 13, color: "var(--sre-text-secondary, #6F747F)" }}>
            This app queries Dynatrace Grail data within your tenant. No data leaves Dynatrace.
          </Paragraph>
        </div>
      </Flex>
    </Flex>
  );
};
