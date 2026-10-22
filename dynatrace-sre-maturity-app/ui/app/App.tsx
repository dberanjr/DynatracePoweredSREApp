import { Page } from "@dynatrace/strato-components-preview/layouts";
import React, { useState, useMemo, useEffect } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading } from "@dynatrace/strato-components/typography";
import { MessageContainer } from "@dynatrace/strato-components/content";
import { Select, SelectOption, SelectContent, SelectTrigger, SelectFilter } from "@dynatrace/strato-components/forms";
import { TimeframeSelector } from "@dynatrace/strato-components/filters";
import { useDql } from "@dynatrace-sdk/react-hooks";
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
import { CoveragePage } from "./pages/CoveragePage";
import { appciFromEntityTags, APPCI_MAP_PATH } from "./queries/maturityQueries";
import { ThemeToggleButton } from "./components/ThemeToggle";

export interface Timeframe {
  from: string;
  to: string;
}

// Try loading from lookup table first.
// All non-retired applications (In Production + Implementing), one row per
// applicationci, carrying the human-readable application name, sorted A→Z.
const APPCI_LOOKUP_QUERY = `load "/lookups/dynatrace/cmdb_appci_owner_mapping"
| filter operational_status != "Retired"
| filter isNotNull(applicationci)
| summarize appName = takeFirst(name), by:{applicationci}
| sort applicationci asc
| fields applicationci, appName
| limit 10000`;

// Fallback: derive AppCI values from entity tags (no application name available)
const APPCI_FALLBACK_QUERY = `fetch dt.entity.service
${appciFromEntityTags()}
| expand applicationci
| filter isNotNull(applicationci)
| fieldsAdd appci = upper(applicationci)
| filter stringLength(appci) <= 3
| dedup appci
| sort appci asc
| fieldsAdd appName = ""
| fields applicationci = appci, appName
| limit 10000`;

// Timeframe isn't a meaningful concept in this app yet (every page effectively
// always looks at a fixed recent window in its own DQL), so the picker is
// hidden from the header. The state/handler/prop threading stays in place —
// flip this back to true to bring the control back once timeframe matters.
const SHOW_TIMEFRAME_SELECTOR = false;

// A missing map makes every scoring query fail with UNKNOWN_TABULAR_FILE. Probe for it once so the
// app can say what is wrong and where to fix it, instead of showing a wall of per-card errors.
const APPCI_MAP_PROBE_QUERY = `load "${APPCI_MAP_PATH}" | limit 1`;
const isMissingLookup = (err: unknown): boolean =>
  !!err && /UNKNOWN_TABULAR_FILE|doesn't exist/i.test(`${(err as { message?: string }).message ?? ""} ${JSON.stringify(err)}`);

export const App = () => {
  const location = useLocation();
  // null until the picker has loaded, then the first AppCI in the list (see the effect below). The
  // app used to start on a hard-coded "ADH", which does not exist in every tenant.
  const [selectedAppCI, setSelectedAppCI] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>({ from: "now()-24h", to: "now()" });

  // Try lookup table first.
  // maxResultRecords lifts the Grail query API's 1000-record default so the
  // dropdown receives all non-retired AppCIs (~1,987 today) — the DQL `limit`
  // alone isn't enough; the API caps the response at 1000 without this. Set to
  // 5000 for headroom well above the current count.
  const { data: lookupData, error: lookupError, isLoading: lookupLoading } = useDql({
    query: APPCI_LOOKUP_QUERY,
    maxResultRecords: 5000,
  });

  // Fallback to entity tags if lookup fails
  const { data: fallbackData, isLoading: fallbackLoading } = useDql({
    query: lookupError ? APPCI_FALLBACK_QUERY : "data record(skip = true) | limit 0",
    maxResultRecords: 5000,
  });

  const appciData = lookupError ? fallbackData : lookupData;
  const appciLoading = lookupError ? fallbackLoading : lookupLoading;

  const appciOptions = useMemo(() => {
    if (!appciData?.records) return [];
    return appciData.records.map((r: Record<string, unknown>) => ({
      code: String(r.applicationci),
      name: r.appName != null ? String(r.appName) : "",
    }));
  }, [appciData]);

  // Preselect the first AppCI once the list arrives so no page starts on an AppCI that isn't in it.
  useEffect(() => {
    if (!selectedAppCI && appciOptions.length > 0) setSelectedAppCI(appciOptions[0].code);
  }, [selectedAppCI, appciOptions]);

  const { error: mapProbeError } = useDql({ query: APPCI_MAP_PROBE_QUERY });
  const mapMissing = isMissingLookup(mapProbeError);

  // Empty string before the list loads: pages already tolerate an AppCI with no data, and this avoids
  // querying for a placeholder code that was never a real application.
  const appCI = selectedAppCI || "";

  return (
    <Page>
      <Page.Header>
        <Flex alignItems="center" gap={8} style={{ overflow: "hidden" }}>
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
            <Header />
          </div>
          <Flex alignItems="center" gap={8} style={{ flexShrink: 0, paddingRight: 8 }}>
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
            <Heading level={6}>ApplicationCI:</Heading>
            <Select
              name="appci-selector"
              value={selectedAppCI}
              onChange={(val) => setSelectedAppCI(val as string | null)}
            >
              <SelectTrigger placeholder={appciLoading ? "Loading..." : "Select AppCI"} style={{ minWidth: 180 }} />
              <SelectContent>
                <SelectFilter />
                {appciOptions.map((opt) => (
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
        {mapMissing && location.pathname !== "/lookups" && (
          <MessageContainer variant="warning" style={{ margin: "8px 16px" }}>
            <MessageContainer.Title>AppCI map not found</MessageContainer.Title>
            <MessageContainer.Description>
              The lookup {APPCI_MAP_PATH} does not exist in this environment, so scores cannot be resolved to an
              AppCI and most pages will show errors. Create it on the Lookups tab (one row per application name).
            </MessageContainer.Description>
            <MessageContainer.Actions>
              <Link to="/lookups">Open Lookups</Link>
            </MessageContainer.Actions>
          </MessageContainer>
        )}
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<ErrorBoundary><LandingPage /></ErrorBoundary>} />
            <Route path="/overview" element={<ErrorBoundary><Home appCI={appCI} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/golden-signals" element={<ErrorBoundary><GoldenSignalsPage appCI={appCI} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/ai-ops" element={<ErrorBoundary><AiOpsPage appCI={appCI} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/proactive" element={<ErrorBoundary><ProactivePage appCI={appCI} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/problem-analytics" element={<ErrorBoundary><ProblemAnalyticsPage appCI={appCI} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/scorecards" element={<ErrorBoundary><ScorecardsPage appCI={appCI} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/upstream-downstream" element={<ErrorBoundary><UpstreamDownstreamPage appCI={appCI} onAppCIChange={setSelectedAppCI} /></ErrorBoundary>} />
            <Route path="/definitions" element={<ErrorBoundary><DefinitionsPage /></ErrorBoundary>} />
            <Route path="/coverage" element={<ErrorBoundary><CoveragePage /></ErrorBoundary>} />
            <Route path="/lookups" element={<ErrorBoundary><LookupsPage /></ErrorBoundary>} />
            <Route path="/portfolio" element={<ErrorBoundary><PortfolioPage /></ErrorBoundary>} />
            <Route path="/data" element={<ErrorBoundary><Data /></ErrorBoundary>} />
            <Route path="/about" element={<ErrorBoundary><AboutPage /></ErrorBoundary>} />
          </Routes>
        </ErrorBoundary>
      </Page.Main>
    </Page>
  );
};
