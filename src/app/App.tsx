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

const APPCI_QUERY = `load "/lookups/dynatrace/cmdb_appci_owner_mapping"
| filter operational_status != "Retired"
| sort applicationci asc
| fields applicationci`;

export const App: React.FC = () => {
  const [selectedAppCI, setSelectedAppCI] = useState<string>("ADH");
  const [activeTab, setActiveTab] = useState(0);

  const { records: appciRecords, loading: appciLoading } = useDqlQuery(APPCI_QUERY);

  const appciOptions = useMemo(() => {
    if (!appciRecords) return [];
    return appciRecords.map((r) => String(r.applicationci));
  }, [appciRecords]);

  return (
    <Page>
      <Page.Header>
        <Flex alignItems="center" gap={16}>
          <Text as="h1" textStyle="heading-level-1">
            Dynatrace SRE Maturity
          </Text>
          <Select
            name="appci-selector"
            value={selectedAppCI}
            onChange={(value) => setSelectedAppCI(value as string)}
            loading={appciLoading}
          >
            {appciOptions.map((appci) => (
              <SelectOption key={appci} value={appci}>
                {appci}
              </SelectOption>
            ))}
          </Select>
        </Flex>
      </Page.Header>
      <Page.Main>
        <Tabs selectedIndex={activeTab} onChange={setActiveTab}>
          <Tab title="Overview">
            <OverviewPage appCI={selectedAppCI} />
          </Tab>
          <Tab title="Golden Signals">
            <GoldenSignalsPage appCI={selectedAppCI} />
          </Tab>
          <Tab title="AI Ops">
            <AiOpsPage appCI={selectedAppCI} />
          </Tab>
          <Tab title="Proactive">
            <ProactivePage appCI={selectedAppCI} />
          </Tab>
          <Tab title="Scorecards">
            <ScorecardsPage appCI={selectedAppCI} />
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
