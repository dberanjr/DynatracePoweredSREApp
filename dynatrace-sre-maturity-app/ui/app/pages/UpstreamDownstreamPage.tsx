import React, { useState } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { AppIdentityBar } from "../components/AppIdentityBar";
import { ServiceGoldenSignalsTable } from "../components/ServiceGoldenSignalsTable";
import { DependencyGraphPanel } from "../components/DependencyGraphPanel";
import { DependencySummaryPanel } from "../components/DependencySummaryPanel";
import { useDependencyChain } from "../hooks/useDependencyChain";

const MAX_LEVELS = 8;

const STATUS_QUERY = (appCI: string) => `load "/lookups/dynatrace/cmdb_appci_owner_mapping"
| filter lower(applicationci) == lower("${appCI}")
| fields operational_status
| limit 1`;

interface Props {
  appCI: string;
}

export const UpstreamDownstreamPage = ({ appCI }: Props) => {
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedServiceName, setSelectedServiceName] = useState<string>("");
  const [upstreamLevels, setUpstreamLevels] = useState(1);
  const [downstreamLevels, setDownstreamLevels] = useState(1);

  const { data: statusData, isLoading: statusLoading } = useDql({ query: STATUS_QUERY(appCI) });
  const status = String(statusData?.records?.[0]?.operational_status || "");
  const isInProduction = !statusLoading && status === "In Production";

  const upstreamChain = useDependencyChain(selectedServiceId, "backward");
  const downstreamChain = useDependencyChain(selectedServiceId, "forward");

  const handleSelect = (serviceId: string, serviceName: string) => {
    setSelectedServiceId(serviceId);
    setSelectedServiceName(serviceName);
    setUpstreamLevels(1);
    setDownstreamLevels(1);
  };

  return (
    <Flex flexDirection="column" gap={20} padding={16}>
      <Heading level={3}>Dependencies — Upstream / Downstream</Heading>
      <AppIdentityBar appCI={appCI} />

      {statusLoading ? (
        <Flex justifyContent="center" padding={16}>
          <ProgressCircle />
        </Flex>
      ) : !isInProduction ? (
        <Paragraph style={{ color: "var(--sre-text-secondary)" }}>
          Call chain analysis requires an In-Production application — <strong>{appCI}</strong> is currently{" "}
          <strong>{status || "unknown"}</strong>.
        </Paragraph>
      ) : (
        <>
          <div>
            <Heading level={5} style={{ marginBottom: 8 }}>
              Services
            </Heading>
            <ServiceGoldenSignalsTable appCI={appCI} selectedServiceId={selectedServiceId} onSelect={handleSelect} />
          </div>

          {!selectedServiceId ? (
            <Paragraph style={{ color: "var(--sre-text-secondary)", opacity: 0.6 }}>
              Select a service above to view its upstream and downstream call chains.
            </Paragraph>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <Heading level={5} style={{ marginBottom: 8 }}>
                  Upstream — {selectedServiceName}
                </Heading>
                <DependencyGraphPanel
                  direction="backward"
                  originId={selectedServiceId}
                  originName={selectedServiceName}
                  chain={upstreamChain}
                  levels={upstreamLevels}
                  maxLevels={MAX_LEVELS}
                  onLevelsChange={setUpstreamLevels}
                />
                <div style={{ marginTop: 12 }}>
                  <DependencySummaryPanel direction="upstream" chain={upstreamChain} />
                </div>
              </div>

              <div>
                <Heading level={5} style={{ marginBottom: 8 }}>
                  Downstream — {selectedServiceName}
                </Heading>
                <DependencyGraphPanel
                  direction="forward"
                  originId={selectedServiceId}
                  originName={selectedServiceName}
                  chain={downstreamChain}
                  levels={downstreamLevels}
                  maxLevels={MAX_LEVELS}
                  onLevelsChange={setDownstreamLevels}
                />
                <div style={{ marginTop: 12 }}>
                  <DependencySummaryPanel direction="downstream" chain={downstreamChain} />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </Flex>
  );
};
