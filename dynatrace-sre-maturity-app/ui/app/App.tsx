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
const UTAN_LOOKUP_QUERY = `load "/lookups/utan_data"
| filter isNotNull(utan)
| dedup utan
| sort utan asc
| fields utan
| limit 10000`;

// Fallback: derive UTAN values from entity tags
const UTAN_FALLBACK_QUERY = `fetch dt.entity.service
| expand tags
| parse tags, "'utan:' LD:utan"
| filter isNotNull(utan)
| fieldsAdd utan = upper(utan)
| dedup utan
| sort utan asc
| fields utan = utan
| limit 10000`;

export const App = () => {
  const [selectedUtan, setSelectedUtan] = useState<string | null>("48263");
  const [timeframe, setTimeframe] = useState<Timeframe>({ from: "now()-24h", to: "now()" });

  // Try lookup table first
  const { data: lookupData, error: lookupError, isLoading: lookupLoading } = useDql({
    query: UTAN_LOOKUP_QUERY,
  });

  // Fallback to entity tags if lookup fails
  const { data: fallbackData, isLoading: fallbackLoading } = useDql({
    query: lookupError ? UTAN_FALLBACK_QUERY : "data record(skip = true) | limit 0",
  });

  const utanData = lookupError ? fallbackData : lookupData;
  const utanLoading = lookupError ? fallbackLoading : lookupLoading;

  const utanOptions = useMemo(() => {
    if (!utanData?.records) return [];
    return utanData.records.map((r: Record<string, unknown>) => String(r.utan));
  }, [utanData]);

  const utan = selectedUtan || "48263";

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
            <Heading level={6}>UTAN:</Heading>
            <Select
              name="utan-selector"
              value={selectedUtan}
              onChange={(val) => setSelectedUtan(val as string | null)}
            >
              <SelectTrigger placeholder={utanLoading ? "Loading..." : "Select UTAN"} style={{ minWidth: 180 }} />
              <SelectContent>
                <SelectFilter />
                {utanOptions.map((opt: string) => (
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
            <Route path="/overview" element={<ErrorBoundary><Home utan={utan} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/golden-signals" element={<ErrorBoundary><GoldenSignalsPage utan={utan} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/ai-ops" element={<ErrorBoundary><AiOpsPage utan={utan} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/proactive" element={<ErrorBoundary><ProactivePage utan={utan} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/problem-analytics" element={<ErrorBoundary><ProblemAnalyticsPage utan={utan} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/scorecards" element={<ErrorBoundary><ScorecardsPage utan={utan} timeframe={timeframe} /></ErrorBoundary>} />
            <Route path="/portfolio" element={<ErrorBoundary><PortfolioPage /></ErrorBoundary>} />
            <Route path="/data" element={<ErrorBoundary><Data /></ErrorBoundary>} />
          </Routes>
        </ErrorBoundary>
      </Page.Main>
    </Page>
  );
};
