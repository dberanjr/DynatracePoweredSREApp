import { Page } from "@dynatrace/strato-components-preview/layouts";
import React, { useState, useMemo, useEffect } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading } from "@dynatrace/strato-components/typography";
import { MessageContainer } from "@dynatrace/strato-components/content";
import { Select, SelectOption, SelectContent, SelectTrigger, SelectFilter } from "@dynatrace/strato-components/forms";
import { TimeframeSelector } from "@dynatrace/strato-components/filters";
import { useDql } from "./hooks/useDql";
import { Header } from "./components/Header";
import { Home } from "./pages/Home";
import { Data } from "./pages/Data";
import { GoldenSignalsPage } from "./pages/GoldenSignalsPage";
import { AiOpsPage } from "./pages/AiOpsPage";
import { ProactivePage } from "./pages/ProactivePage";
import { ScorecardsPage } from "./pages/ScorecardsPage";
import { UpstreamDownstreamPage } from "./pages/UpstreamDownstreamPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LandingPage } from "./pages/LandingPage";
import { ProblemAnalyticsPage } from "./pages/ProblemAnalyticsPage";
import { AboutPage } from "./pages/AboutPage";
import { DefinitionsPage } from "./pages/DefinitionsPage";
import { LookupsPage } from "./pages/LookupsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { CoveragePage } from "./pages/CoveragePage";
import { ReadinessPage } from "./pages/ReadinessPage";
import { appIdFromEntityTags, APP_ID_MAP_PATH } from "./queries/maturityQueries";
import { ThemeToggleButton } from "./components/ThemeToggle";
import { DemoModeToggleButton, DemoModeBanner } from "./components/DemoModeToggle";

import { APP_ID_FIELD, LOAD, APP_ID_LABEL, APP_ID_MAX_LENGTH } from "./settings/appSettings";
export interface Timeframe {
  from: string;
  to: string;
}

// Try loading from lookup table first.
// All non-retired applications (In Production + Implementing), one row per
// applicationci, carrying the human-readable application name, sorted A→Z.
const APP_ID_LOOKUP_QUERY = `${LOAD.cmdb}
| filter operational_status != "Retired"
| filter isNotNull(${APP_ID_FIELD})
| summarize appName = takeFirst(name), by:{${APP_ID_FIELD}}
| sort ${APP_ID_FIELD} asc
| fields ${APP_ID_FIELD}, appName
| limit 10000`;

// Fallback: derive application ID values from entity tags (no application name available)
const APP_ID_FALLBACK_QUERY = `fetch dt.entity.service
${appIdFromEntityTags()}
| expand ${APP_ID_FIELD}
| filter isNotNull(${APP_ID_FIELD})
| fieldsAdd appId = upper(${APP_ID_FIELD})
| filter stringLength(appId) <= ${APP_ID_MAX_LENGTH}
| dedup appId
| sort appId asc
| fieldsAdd appName = ""
| fields ${APP_ID_FIELD} = appId, appName
| limit 10000`;

// Timeframe isn't a meaningful concept in this app yet (every page effectively
// always looks at a fixed recent window in its own DQL), so the picker is
// hidden from the header. The state/handler/prop threading stays in place —
// flip this back to true to bring the control back once timeframe matters.
const SHOW_TIMEFRAME_SELECTOR = false;

// A missing map makes every scoring query fail with UNKNOWN_TABULAR_FILE. Probe for it once so the
// app can say what is wrong and where to fix it, instead of showing a wall of per-card errors.
const APP_ID_MAP_PROBE_QUERY = `load "${APP_ID_MAP_PATH}" | limit 1`;
const isMissingLookup = (err: unknown): boolean =>
  !!err && /UNKNOWN_TABULAR_FILE|doesn't exist/i.test(`${(err as { message?: string }).message ?? ""} ${JSON.stringify(err)}`);

export const App = () => {
  const location = useLocation();
  // null until the picker has loaded, then the first application ID in the list (see the effect below). The
  // app used to start on a hard-coded "ADH", which does not exist in every tenant.
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>({ from: "now()-24h", to: "now()" });

  // Try lookup table first.
  // maxResultRecords lifts the Grail query API's 1000-record default so the
  // dropdown receives all non-retired AppIds (~1,987 today) — the DQL `limit`
  // alone isn't enough; the API caps the response at 1000 without this. Set to
  // 5000 for headroom well above the current count.
  const { data: lookupData, error: lookupError, isLoading: lookupLoading } = useDql({
    query: APP_ID_LOOKUP_QUERY,
    maxResultRecords: 5000,
  });

  // Fallback to entity tags if lookup fails
  const { data: fallbackData, isLoading: fallbackLoading } = useDql({
    query: lookupError ? APP_ID_FALLBACK_QUERY : "data record(skip = true) | limit 0",
    maxResultRecords: 5000,
  });

  const appIdData = lookupError ? fallbackData : lookupData;
  const appIdLoading = lookupError ? fallbackLoading : lookupLoading;

  const appIdOptions = useMemo(() => {
    if (!appIdData?.records) return [];
    return appIdData.records.map((r: Record<string, unknown>) => ({
      code: String(r[APP_ID_FIELD]),
      name: r.appName != null ? String(r.appName) : "",
    }));
  }, [appIdData]);

  // Preselect the first application ID once the list arrives so no page starts on an application ID that isn't in it.
  useEffect(() => {
    if (!selectedAppId && appIdOptions.length > 0) setSelectedAppId(appIdOptions[0].code);
  }, [selectedAppId, appIdOptions]);

  const { error: mapProbeError } = useDql({ query: APP_ID_MAP_PROBE_QUERY });
  const mapMissing = isMissingLookup(mapProbeError);

  // Empty string before the list loads: pages already tolerate an application ID with no data, and this avoids
  // querying for a placeholder code that was never a real application.
  const appId = selectedAppId || "";

  return (
    <Page>
      <Page.Header>
        <Flex alignItems="center" gap={8} style={{ overflow: "hidden" }}>
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
            <Header />
          </div>
          <Flex alignItems="center" gap={8} style={{ flexShrink: 0, paddingRight: 8 }}>
            <DemoModeToggleButton />
            <ThemeToggleButton />
            {SHOW_TIMEFRAME_SELECTOR && (
              <TimeframeSelector
                value={timeframe}
                onChange={(tf: any) => {
                  if (tf) {
                    const from = typeof tf.from === "string" ? tf.from : tf.from?.value ?? "now()-24h";
                    const to = typeof tf.to === "string" ? tf.to : tf.to?.value ?? "now()";
                    setTimeframe({ from, to });
                  }
                }}
              />
            )}
            <Heading level={6}>{APP_ID_LABEL}:</Heading>
            <Select
              name="appId-selector"
              value={selectedAppId}
              onChange={(val) => setSelectedAppId(val as string | null)}
            >
              <SelectTrigger placeholder={appIdLoading ? "Loading..." : `Select ${APP_ID_LABEL}`} style={{ minWidth: 180 }} />
              <SelectContent>
                <SelectFilter />
                {appIdOptions.map((opt) => (
                  <SelectOption
                    key={opt.code}
                    value={opt.code}
                    textValue={opt.name ? `${opt.code} ${opt.name}` : opt.code}
                  >
                    {opt.name ? `${opt.code} (${opt.name})` : opt.code}
                  </SelectOption>
                ))}
              </SelectContent>
            </Select>
          </Flex>
        </Flex>
      </Page.Header>
      <Page.Main>
        <DemoModeBanner />
        {mapMissing && location.pathname !== "/lookups" && (
          <MessageContainer variant="warning" style={{ margin: "8px 16px" }}>
            <MessageContainer.Title>{APP_ID_LABEL} map not found</MessageContainer.Title>
            <MessageContainer.Description>
              The lookup {APP_ID_MAP_PATH} does not exist in this environment, so scores cannot be resolved to an
              {APP_ID_LABEL} and most pages will show errors. Create it on the Lookups tab (one row per application name).
            </MessageContainer.Description>
            <MessageContainer.Actions>
              <Link to="/lookups">Open Lookups</Link>
            </MessageContainer.Actions>
          </MessageContainer>
        )}
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<ErrorBoundary><LandingPage /></ErrorBoundary>} />
            <Route path="/overview" element={<ErrorBoundary><Home appId={appId} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/golden-signals" element={<ErrorBoundary><GoldenSignalsPage appId={appId} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/ai-ops" element={<ErrorBoundary><AiOpsPage appId={appId} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/proactive" element={<ErrorBoundary><ProactivePage appId={appId} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/problem-analytics" element={<ErrorBoundary><ProblemAnalyticsPage appId={appId} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/scorecards" element={<ErrorBoundary><ScorecardsPage appId={appId} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/upstream-downstream" element={<ErrorBoundary><UpstreamDownstreamPage appId={appId} onAppIdChange={setSelectedAppId} /></ErrorBoundary>} />
            <Route path="/definitions" element={<ErrorBoundary><DefinitionsPage /></ErrorBoundary>} />
            <Route path="/coverage" element={<ErrorBoundary><CoveragePage /></ErrorBoundary>} />
            <Route path="/readiness" element={<ErrorBoundary><ReadinessPage appId={appId} /></ErrorBoundary>} />
            <Route path="/lookups" element={<ErrorBoundary><LookupsPage /></ErrorBoundary>} />
            <Route path="/portfolio" element={<ErrorBoundary><PortfolioPage /></ErrorBoundary>} />
            <Route path="/data" element={<ErrorBoundary><Data /></ErrorBoundary>} />
            <Route path="/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
            <Route path="/about" element={<ErrorBoundary><AboutPage /></ErrorBoundary>} />
          </Routes>
        </ErrorBoundary>
      </Page.Main>
    </Page>
  );
};
