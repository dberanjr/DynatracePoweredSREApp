import React, { useState, useMemo } from "react";
import {
  AppHeader,
  Page,
  Tab,
  Tabs,
  Select,
  SelectOption,
  Flex,
  Text,
} from "@dynatrace/strato-components-preview";
import { useDqlQuery } from "./hooks/useDqlQuery";
import { OverviewPage } from "./pages/OverviewPage";
import { GoldenSignalsPage } from "./pages/GoldenSignalsPage";
import { AiOpsPage } from "./pages/AiOpsPage";
import { ProactivePage } from "./pages/ProactivePage";
import { ScorecardsPage } from "./pages/ScorecardsPage";
import { PortfolioPage } from "./pages/PortfolioPage";

const UTAN_QUERY = `load "/lookups/utan_data"
| sort utan asc
| fields utan`;

export const App: React.FC = () => {
  const [selectedUtan, setSelectedUtan] = useState<string>("48263");
  const [activeTab, setActiveTab] = useState(0);

  const { records: utanRecords, loading: utanLoading } = useDqlQuery(UTAN_QUERY);

  const utanOptions = useMemo(() => {
    if (!utanRecords) return [];
    return utanRecords.map((r) => String(r.utan));
  }, [utanRecords]);

  return (
    <Page>
      <Page.Header>
        <Flex alignItems="center" gap={16}>
          <Text as="h1" textStyle="heading-level-1">
            Dynatrace SRE Maturity
          </Text>
          <Select
            name="utan-selector"
            value={selectedUtan}
            onChange={(value) => setSelectedUtan(value as string)}
            loading={utanLoading}
          >
            {utanOptions.map((utan) => (
              <SelectOption key={utan} value={utan}>
                {utan}
              </SelectOption>
            ))}
          </Select>
        </Flex>
      </Page.Header>
      <Page.Main>
        <Tabs selectedIndex={activeTab} onChange={setActiveTab}>
          <Tab title="Overview">
            <OverviewPage utan={selectedUtan} />
          </Tab>
          <Tab title="Golden Signals">
            <GoldenSignalsPage utan={selectedUtan} />
          </Tab>
          <Tab title="AI Ops">
            <AiOpsPage utan={selectedUtan} />
          </Tab>
          <Tab title="Proactive">
            <ProactivePage utan={selectedUtan} />
          </Tab>
          <Tab title="Scorecards">
            <ScorecardsPage utan={selectedUtan} />
          </Tab>
          <Tab title="Portfolio">
            <PortfolioPage />
          </Tab>
        </Tabs>
      </Page.Main>
    </Page>
  );
};

export default App;
