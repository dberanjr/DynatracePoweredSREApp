import { Page } from "@dynatrace/strato-components-preview/layouts";
import React, { useState, useMemo } from "react";
import { Route, Routes } from "react-router-dom";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading } from "@dynatrace/strato-components/typography";
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
import { PortfolioPage } from "./pages/PortfolioPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LandingPage } from "./pages/LandingPage";
import { ProblemAnalyticsPage } from "./pages/ProblemAnalyticsPage";
import { ThemeToggleButton } from "./components/ThemeToggle";

export interface Timeframe {
  from: string;
  to: string;
}

// Try loading from lookup table first
const APPCI_LOOKUP_QUERY = `load "/lookups/dynatrace/cmdb_appci_owner_mapping"
| filter operational_status != "Retired"
| filter isNotNull(applicationci)
| filter stringLength(applicationci) <= 3
| dedup applicationci
| sort applicationci asc
| fields applicationci
| limit 10000`;

// Fallback: derive AppCI values from entity tags
const APPCI_FALLBACK_QUERY = `fetch dt.entity.service
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter isNotNull(appci)
| fieldsAdd appci = upper(appci)
| filter stringLength(appci) <= 3
| dedup appci
| sort appci asc
| fields applicationci = appci
| limit 10000`;

export const App = () => {
  const [selectedAppCI, setSelectedAppCI] = useState<string | null>("ADH");
  const [timeframe, setTimeframe] = useState<Timeframe>({ from: "now()-24h", to: "now()" });

  // Try lookup table first
  const { data: lookupData, error: lookupError, isLoading: lookupLoading } = useDql({
    query: APPCI_LOOKUP_QUERY,
  });

  // Fallback to entity tags if lookup fails
  const { data: fallbackData, isLoading: fallbackLoading } = useDql({
    query: lookupError ? APPCI_FALLBACK_QUERY : "data record(skip = true) | limit 0",
  });

  const appciData = lookupError ? fallbackData : lookupData;
  const appciLoading = lookupError ? fallbackLoading : lookupLoading;

  const appciOptions = useMemo(() => {
    if (!appciData?.records) return [];
    return appciData.records.map((r: Record<string, unknown>) => String(r.applicationci));
  }, [appciData]);

  const appCI = selectedAppCI || "ADH";

  return (
    <Page>
      <Page.Header>
        <Flex alignItems="center" gap={8} style={{ overflow: "hidden" }}>
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
            <Header />
          </div>
          <Flex alignItems="center" gap={8} style={{ flexShrink: 0, paddingRight: 8 }}>
            <ThemeToggleButton />
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
            <Heading level={6}>ApplicationCI:</Heading>
            <Select
              name="appci-selector"
              value={selectedAppCI}
              onChange={(val) => setSelectedAppCI(val as string | null)}
            >
              <SelectTrigger placeholder={appciLoading ? "Loading..." : "Select AppCI"} style={{ minWidth: 180 }} />
              <SelectContent>
                <SelectFilter />
                {appciOptions.map((opt: string) => (
                  <SelectOption key={opt} value={opt}>
                    {opt}
                  </SelectOption>
                ))}
              </SelectContent>
            </Select>
          </Flex>
        </Flex>
      </Page.Header>
      <Page.Main>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<ErrorBoundary><LandingPage /></ErrorBoundary>} />
            <Route path="/overview" element={<ErrorBoundary><Home appCI={appCI} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/golden-signals" element={<ErrorBoundary><GoldenSignalsPage appCI={appCI} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/ai-ops" element={<ErrorBoundary><AiOpsPage appCI={appCI} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/proactive" element={<ErrorBoundary><ProactivePage appCI={appCI} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/problem-analytics" element={<ErrorBoundary><ProblemAnalyticsPage appCI={appCI} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/scorecards" element={<ErrorBoundary><ScorecardsPage appCI={appCI} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/portfolio" element={<ErrorBoundary><PortfolioPage /></ErrorBoundary>} />
            <Route path="/data" element={<ErrorBoundary><Data /></ErrorBoundary>} />
          </Routes>
        </ErrorBoundary>
      </Page.Main>
    </Page>
  );
};
