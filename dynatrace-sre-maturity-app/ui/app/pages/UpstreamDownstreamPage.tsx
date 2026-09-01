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
import { ActiveProblemLink } from "../components/SmartscapeViewMenu";

const MAX_LEVELS = 8;

const STATUS_QUERY = (appCI: string) => `load "/lookups/dynatrace/cmdb_appci_owner_mapping"
| filter lower(applicationci) == lower("${appCI}")
| fields operational_status
| limit 1`;

// Same active-problem join used per-level in useDependencyChain and in
// ServiceGoldenSignalsTable, scoped to a single known id — computed once
// here rather than inside each of the two chain hooks, since the selected
// service's own problem status is identical for both directions.
const ROOT_PROBLEM_QUERY = (serviceId: string) => `fetch dt.davis.problems, from:now()-30d
| filter event.status == "ACTIVE"
| expand affected_entity_ids
| filter affected_entity_ids == "${serviceId}"
| fieldsAdd role = if(affected_entity_ids == root_cause_entity_id, "Root cause", else: "Impacted")
| fieldsAdd roleRank = if(role == "Root cause", 0, else: 1)
| sort roleRank asc
| fields role, problemId = event.id
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

  const upstreamChain = useDependencyChain(selectedServiceId, "backward", upstreamLevels);
  const downstreamChain = useDependencyChain(selectedServiceId, "forward", downstreamLevels);

  const { data: rootProblemData } = useDql({
    query: selectedServiceId ? ROOT_PROBLEM_QUERY(selectedServiceId) : "data record(skip = true) | limit 0",
  });
  const rootProblemRow = rootProblemData?.records?.[0] as Record<string, unknown> | undefined;
  const rootProblem: ActiveProblemLink | null = rootProblemRow
    ? { role: String(rootProblemRow.role || ""), problemId: String(rootProblemRow.problemId || "") }
    : null;

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
                  rootProblem={rootProblem}
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
                  rootProblem={rootProblem}
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
