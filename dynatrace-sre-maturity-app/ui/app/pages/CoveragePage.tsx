import React, { useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { appciFromEntityTags, unmappedApplicationsQuery, APPCI_MAP_ROWS_QUERY, appciFromWorkflowTitle } from "../queries/maturityQueries";

// Tagging / onboarding coverage: for every active application in the CMDB table, how much of its
// data the scorecards can actually find. Read-only: it measures, it never changes tenant config.
// Each signal is its own query so a missing lookup or a failing source degrades one column, not the page.
// The tag extraction mirrors the scorecard bulk queries (MaturityLeaderboard.tsx) on purpose, so a
// count here means "the scorecard will see it". Unlike the scorecards it does NOT drop codes longer
// than 3 characters; those are flagged instead of silently disappearing.

// eslint-disable-next-line noSecrets/no-secrets
const CMDB_QUERY = `load "/lookups/dynatrace/cmdb_appci_owner_mapping"
| filter operational_status != "Retired"
| fields applicationci, name, business_criticality, operational_status
| limit 10000`;

// AppCI codes found in `applicationci:<code>` tags on one entity type, with how many entities carry each.
const tagCodes = (entityFetch: string, countField: string) => `${entityFetch}
${appciFromEntityTags()}
| expand applicationci
| summarize ${countField} = count(), by:{applicationci}`;

const SERVICES_QUERY = tagCodes("fetch dt.entity.service", "n");
// Application names that resolve to no AppCI, on each entity type the L1 checks count, fetched the way those
// checks fetch them. The same application is often spelled differently per type (a service says
// "BillingPortal", a synthetic test says "Billing Portal"), so a name can be mapped for one type and missed
// on another. Listing all four shows the spellings that still need a map row.
const UNMAPPED_SERVICES_QUERY = unmappedApplicationsQuery("fetch dt.entity.service");
const UNMAPPED_HOSTS_QUERY = unmappedApplicationsQuery("fetch dt.entity.host\n| limit 100000\n| filter lifetime[end] > asTimestamp(now()-2h)");
const UNMAPPED_RUM_QUERY = unmappedApplicationsQuery("fetch dt.entity.application, from:now()-1000d");
const UNMAPPED_SYNTHETIC_QUERY = unmappedApplicationsQuery("fetch dt.entity.synthetic_test");
const UNMAPPED_KINDS = ["services", "hosts", "RUM apps", "synthetic tests"] as const;
const UNMAPPED_KIND_ONE = ["service", "host", "RUM app", "synthetic test"] as const;
const HOSTS_QUERY = tagCodes("fetch dt.entity.host\n| limit 100000\n| filter lifetime[end] > asTimestamp(now()-2h)", "n");

const SLO_QUERY = `load "/lookups/slo"
| fieldsAdd applicationci = lower(substring(slo, from:0, to:3))
| summarize n = count(), by:{applicationci}`;
const GUARDIAN_QUERY = `load "/lookups/guardians"
| fieldsAdd applicationci = lower(appci)
| summarize n = count(), by:{applicationci}`;
const DASHBOARD_QUERY = `load "/lookups/slo-dashboards"
| fieldsAdd applicationci = lower(appci)
| summarize n = count(), by:{applicationci}`;
const CRITICAL_QUERY = `load "/lookups/critical_services"
| fieldsAdd applicationci = lower(appci)
| summarize n = count(), resolved = countIf(entity_ids != "-"), by:{applicationci}`;
const WORKFLOW_QUERY = `fetch dt.system.events, from:now()-30d
| filter event.provider == "AUTOMATION_ENGINE"
| filter event.kind == "WORKFLOW_EVENT" and event.type == "WORKFLOW_EXECUTION"
${appciFromWorkflowTitle()}
| summarize n = countDistinct(\`dt.automation_engine.workflow.id\`), by:{applicationci}`;

interface Signal {
  key: "services" | "hosts" | "slos" | "guardians" | "dashboards" | "critical" | "workflows";
  label: string;
  /** How the scorecards find this resource: shown as the column tooltip and in the legend. */
  how: string;
}

const SIGNALS: Signal[] = [
  { key: "services", label: "Services", how: "Services tagged applicationci:<code>, or tagged Application:<name> with that name mapped to the code on Lookups > AppCI map" },
  { key: "hosts", label: "Hosts", how: "Hosts tagged applicationci:<code>, or tagged Application:<name> mapped to the code on Lookups > AppCI map" },
  { key: "slos", label: "SLOs", how: "SLO names that start with the code (from /lookups/slo)" },
  { key: "guardians", label: "Guardians", how: "Site Reliability Guardians tagged applicationci:<code> (from /lookups/guardians)" },
  { key: "dashboards", label: "SLO dashboards", how: "Dashboards named <code> … SLO (from /lookups/slo-dashboards)" },
  { key: "critical", label: "Critical services", how: "Rows in the critical services seed; resolved = matched to a Dynatrace entity" },
  { key: "workflows", label: "Workflows", how: "Automation workflows whose title starts with the code, or with an application name in the AppCI map (last 30 days)" },
];

interface Counts {
  n: number;
  resolved?: number;
}

// One source -> Map<code, counts>. `error` is set when the query failed (e.g. a lookup that doesn't exist yet).
function useSource(query: string) {
  const { data, error, isLoading } = useDql({ query });
  const map = useMemo(() => {
    const m = new Map<string, Counts>();
    for (const rec of data?.records ?? []) {
      const r = rec as Record<string, unknown>;
      const code = typeof r.applicationci === "string" ? r.applicationci.trim().toLowerCase() : "";
      if (!code) continue;
      m.set(code, { n: Number(r.n ?? 0), resolved: r.resolved === undefined ? undefined : Number(r.resolved) });
    }
    return m;
  }, [data]);
  const message = error?.message;
  return useMemo(() => ({ map, error: message, isLoading }), [map, message, isLoading]);
}

const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");

const cellStyle: React.CSSProperties = { padding: "6px 10px", whiteSpace: "nowrap" };
const OK = "#1B7F4B";
const MUTED = "var(--sre-text-secondary, #6F747F)";

export const CoveragePage = () => {
  const cmdb = useDql({ query: CMDB_QUERY });
  const services = useSource(SERVICES_QUERY);
  const hosts = useSource(HOSTS_QUERY);
  const slos = useSource(SLO_QUERY);
  const guardians = useSource(GUARDIAN_QUERY);
  const dashboards = useSource(DASHBOARD_QUERY);
  const critical = useSource(CRITICAL_QUERY);
  const workflows = useSource(WORKFLOW_QUERY);
  const unmappedServices = useDql({ query: UNMAPPED_SERVICES_QUERY });
  const unmappedHosts = useDql({ query: UNMAPPED_HOSTS_QUERY });
  const unmappedRum = useDql({ query: UNMAPPED_RUM_QUERY });
  const unmappedSynthetic = useDql({ query: UNMAPPED_SYNTHETIC_QUERY });
  const mapRowsSrc = useDql({ query: APPCI_MAP_ROWS_QUERY });
  // Rebuilt only when a source's data or state changes, so the memos below stay stable.
  const sources = useMemo(
    () => ({ services, hosts, slos, guardians, dashboards, critical, workflows }),
    [services, hosts, slos, guardians, dashboards, critical, workflows]
  );

  const apps = useMemo(() => {
    const rows = (cmdb.data?.records ?? []).map((rec) => {
      const r = rec as Record<string, unknown>;
      const code = str(r.applicationci);
      const key = code.toLowerCase();
      const found = SIGNALS.filter((s) => (sources[s.key].map.get(key)?.n ?? 0) > 0).length;
      return { code, key, name: str(r.name), tier: str(r.business_criticality), found, tooLong: code.length > 3 };
    });
    // Least ready first: those are the ones that need attention.
    return rows.sort((a, b) => a.found - b.found || a.key.localeCompare(b.key));
  }, [cmdb.data, sources]);

  // Codes present in service tags that are not in the CMDB table: usually typos or apps never registered.
  const cmdbKeys = useMemo(() => new Set(apps.map((a) => a.key)), [apps]);
  const orphans = useMemo(
    () => [...sources.services.map.entries()].filter(([code]) => !cmdbKeys.has(code)).sort((a, b) => b[1].n - a[1].n),
    [sources.services.map, cmdbKeys]
  );

  // Application names on services that no AppCI covers: the to-do list for Lookups > AppCI map.
  const unmappedSources = [unmappedServices, unmappedHosts, unmappedRum, unmappedSynthetic];
  const unmapped = useMemo(() => {
    const byName = new Map<string, { name: string; counts: number[]; total: number }>();
    [unmappedServices.data, unmappedHosts.data, unmappedRum.data, unmappedSynthetic.data].forEach((data, kind) => {
      for (const rec of data?.records ?? []) {
        const r = rec as Record<string, unknown>;
        const name = str(r.appciName);
        if (!name) continue;
        const entry = byName.get(name) ?? { name, counts: [0, 0, 0, 0], total: 0 };
        const n = Number(r.entities ?? 0);
        entry.counts[kind] += n;
        entry.total += n;
        byName.set(name, entry);
      }
    });
    return [...byName.values()].sort((a, b) => b.total - a.total);
  }, [unmappedServices.data, unmappedHosts.data, unmappedRum.data, unmappedSynthetic.data]);
  // A source that failed (for example an entity type this tenant does not have) hides only its own column.
  const unmappedFailed = UNMAPPED_KINDS.filter((_, i) => unmappedSources[i].error);
  // Map rows that point at an AppCI absent from the CMDB table: usually a typo in the code.
  const mapOrphans = useMemo(
    () =>
      (mapRowsSrc.data?.records ?? [])
        .map((rec) => {
          const r = rec as Record<string, unknown>;
          return { name: str(r.app_name), code: str(r.applicationci) };
        })
        .filter((m) => m.code && !cmdbKeys.has(m.code.toLowerCase())),
    [mapRowsSrc.data, cmdbKeys]
  );

  const taggedApps = apps.filter((a) => (sources.services.map.get(a.key)?.n ?? 0) > 0).length;
  const failed = SIGNALS.filter((s) => sources[s.key].error);
  const loading = cmdb.isLoading;

  return (
    <Flex flexDirection="column" gap={0} padding={16}>
      <div style={{ marginBottom: 14 }}>
        <Heading level={3} style={{ margin: "0 0 4px" }}>Tagging Coverage</Heading>
        <Paragraph style={{ margin: 0, fontSize: 13, color: MUTED }}>
          For each active application in the CMDB table, how much of its data the scorecards can find. A dash means nothing was
          matched, so the related checks will fail or show n/a. Applications are listed least-ready first. This page only
          reads data; it changes nothing in your environment.
        </Paragraph>
      </div>

      {cmdb.error && (
        <div style={{ padding: 10, marginBottom: 12, borderRadius: 6, border: "1px solid #C4233B", color: "#C4233B", fontSize: 12 }}>
          Could not load the CMDB table ({cmdb.error.message}). Load it on the Lookups tab first.
        </div>
      )}

      {!loading && !cmdb.error && (
        <div style={{ marginBottom: 12, fontSize: 13 }}>
          <strong>{taggedApps}</strong> of <strong>{apps.length}</strong> applications have tagged services
          {apps.length > 0 && taggedApps === 0 && (
            <span style={{ color: "#B45309" }}>
              {" "}
              — no service resolves to a CMDB AppCI, so the leaderboard and daily snapshot will be empty. Services resolve through an
              <code>applicationci:&lt;code&gt;</code> tag or through the AppCI map on the Lookups tab.
            </span>
          )}
        </div>
      )}

      {failed.length > 0 && (
        <div style={{ padding: 10, marginBottom: 12, borderRadius: 6, border: "1px solid var(--sre-border, #C4C8D1)", fontSize: 12 }}>
          {failed.map((s) => (
            <div key={s.key}>
              <strong>{s.label}</strong> could not be read: {sources[s.key].error}
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <Paragraph>Loading…</Paragraph>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--sre-table-border, #E3E5EA)", borderRadius: 8, marginBottom: 18 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--sre-table-header-bg, #F2F3F5)", textAlign: "left" }}>
                <th style={cellStyle}>AppCI</th>
                <th style={cellStyle}>Name</th>
                <th style={cellStyle}>Tier</th>
                {SIGNALS.map((s) => (
                  <th key={s.key} style={{ ...cellStyle, textAlign: "center" }} title={s.how}>
                    {s.label}
                  </th>
                ))}
                <th style={{ ...cellStyle, textAlign: "center" }}>Found</th>
              </tr>
            </thead>
            <tbody>
              {apps.length === 0 && (
                <tr>
                  <td colSpan={SIGNALS.length + 4} style={{ padding: 16, textAlign: "center", color: MUTED }}>
                    No active applications in the CMDB table.
                  </td>
                </tr>
              )}
              {apps.map((a) => (
                <tr key={a.key} style={{ borderTop: "1px solid var(--sre-table-border, #E3E5EA)" }}>
                  <td style={{ ...cellStyle, fontWeight: 700 }}>
                    {a.code}
                    {a.tooLong && (
                      <span
                        title="Longer than 3 characters: the scorecards, leaderboard and snapshot ignore codes this long. Use a 3-character code."
                        style={{ marginLeft: 6, color: "#B45309", fontWeight: 600 }}
                      >
                        ⚠ &gt;3 chars
                      </span>
                    )}
                  </td>
                  <td style={cellStyle}>{a.name}</td>
                  <td style={cellStyle}>{a.tier}</td>
                  {SIGNALS.map((s) => {
                    const src = sources[s.key];
                    const c = src.map.get(a.key);
                    const text =
                      src.error ? "?" : src.isLoading ? "…" : c && c.n > 0 ? (s.key === "critical" && c.resolved !== undefined ? `${c.resolved}/${c.n}` : String(c.n)) : "–";
                    const good = !src.error && !src.isLoading && !!c && c.n > 0 && (s.key !== "critical" || (c.resolved ?? 0) > 0);
                    return (
                      <td key={s.key} title={src.error ? src.error : s.how} style={{ ...cellStyle, textAlign: "center", color: good ? OK : MUTED, fontWeight: good ? 700 : 400 }}>
                        {text}
                      </td>
                    );
                  })}
                  <td style={{ ...cellStyle, textAlign: "center", fontWeight: 700 }}>
                    {a.found}/{SIGNALS.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {orphans.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Tagged codes that aren't in the CMDB table</div>
          <Paragraph style={{ margin: "0 0 8px", fontSize: 12, color: MUTED }}>
            Services carry these <code>applicationci</code> tag values, but no CMDB row matches. They are usually typos, a
            different spelling than the CMDB code, or applications that were never registered. Fix the tag, or add the
            application on the Lookups tab.
          </Paragraph>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {orphans.slice(0, 40).map(([code, c]) => (
              <span key={code} style={{ padding: "3px 10px", borderRadius: 12, border: "1px solid var(--sre-border, #C4C8D1)", fontSize: 12 }}>
                {code} <span style={{ color: MUTED }}>({c.n} services{code.length > 3 ? ", >3 chars" : ""})</span>
              </span>
            ))}
            {orphans.length > 40 && <span style={{ fontSize: 12, color: MUTED }}>…and {orphans.length - 40} more</span>}
          </div>
        </div>
      )}

      {unmapped.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
            Application names with no AppCI ({unmapped.length})
          </div>
          <Paragraph style={{ margin: "0 0 8px", fontSize: 12, color: MUTED }}>
            Services, hosts, RUM applications or synthetic tests carry these <code>Application:&lt;name&gt;</code> tags, but no{" "}
            <code>applicationci</code> tag and no row in the AppCI map, so the scorecards cannot see them. Add each name (without its
            environment suffix) on Lookups &gt; AppCI map. The same application is often spelled differently per type (for example
            "BillingPortal" on services and "Billing Portal" on synthetic tests): each spelling needs its own row.
            {unmappedFailed.length > 0 && <span style={{ color: "#B45309" }}> Could not read: {unmappedFailed.join(", ")}.</span>}
          </Paragraph>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {unmapped.slice(0, 60).map((u) => (
              <span key={u.name} style={{ padding: "3px 10px", borderRadius: 12, border: "1px solid var(--sre-border, #C4C8D1)", fontSize: 12 }}>
                {u.name}{" "}
                <span style={{ color: MUTED }}>
                  ({UNMAPPED_KINDS.map((k, i) => (u.counts[i] > 0 ? `${u.counts[i]} ${u.counts[i] === 1 ? UNMAPPED_KIND_ONE[i] : k}` : "")).filter(Boolean).join(", ")})
                </span>
              </span>
            ))}
            {unmapped.length > 60 && <span style={{ fontSize: 12, color: MUTED }}>…and {unmapped.length - 60} more</span>}
          </div>
        </div>
      )}

      {mapOrphans.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>AppCI map rows that point outside the CMDB table ({mapOrphans.length})</div>
          <Paragraph style={{ margin: "0 0 8px", fontSize: 12, color: MUTED }}>
            These map rows name an AppCI that has no active CMDB row, which is usually a typo in the code.
          </Paragraph>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {mapOrphans.slice(0, 40).map((m) => (
              <span key={m.name} style={{ padding: "3px 10px", borderRadius: 12, border: "1px solid var(--sre-border, #C4C8D1)", fontSize: 12 }}>
                {m.name} <span style={{ color: MUTED }}>→ {m.code}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: MUTED }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>How each column is matched</div>
        {SIGNALS.map((s) => (
          <div key={s.key}>
            <strong>{s.label}:</strong> {s.how}
          </div>
        ))}
      </div>
    </Flex>
  );
};
