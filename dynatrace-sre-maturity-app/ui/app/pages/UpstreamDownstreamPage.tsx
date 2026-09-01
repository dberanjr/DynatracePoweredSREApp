import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { AppIdentityBar } from "../components/AppIdentityBar";
import { SPINE_BACKGROUND } from "../components/MaturitySpine";
import { ServiceGoldenSignalsTable, SeverityFilterValue } from "../components/ServiceGoldenSignalsTable";
import { DependencyGraphPanel, NodeMetrics } from "../components/DependencyGraphPanel";
import { DependencySummaryPanel, ChainShapeSummary } from "../components/DependencySummaryPanel";
import { SeverityLegend } from "../components/SeverityLegend";
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

// Root's own traffic/latency for Perf-mode node sizing — same golden-signal
// shape used per-level in useDependencyChain, scoped to one known id.
const ROOT_METRICS_QUERY = (serviceId: string) => `timeseries {
    req = sum(dt.service.request.count, rollup: sum, scalar:true),
    p95 = percentile(dt.service.request.response_time, 95, rollup: avg, scalar:true)
  }, by:{dt.entity.service}, from:now()-1h
| filter dt.entity.service == "${serviceId}"
| fields reqCount = req, p95Us = p95
| limit 1`;

// Headline counts for the header card — a cheaper, count-only variant of
// ServiceGoldenSignalsTable's critical/problem joins (no timeseries lookups).
const SUMMARY_QUERY = (appCI: string) => `fetch dt.entity.service
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup id
| fields id
| lookup [
    load "/lookups/critical_services"
    | filter lower(appci) == lower("${appCI}")
    | filter entity_ids != "-"
    | fieldsAdd idList = splitString(entity_ids, " ")
    | expand idList
    | fields idList, severity
  ], sourceField:id, lookupField:idList, fields:{critSeverity = severity}
| lookup [
    fetch dt.davis.problems, from:now()-30d
    | filter event.status == "ACTIVE"
    | expand affected_entity_ids
    | fields affected_entity_ids
    | dedup affected_entity_ids
  ], sourceField:id, lookupField:affected_entity_ids, fields:{hasProblem = affected_entity_ids}
| fieldsAdd hasProblem = isNotNull(hasProblem)
| summarize
    total = count(),
    high = countIf(lower(critSeverity) == "high"),
    medium = countIf(startsWith(lower(critSeverity), "med")),
    low = countIf(lower(critSeverity) == "low"),
    activeProblems = countIf(hasProblem)`;

function SummaryChip({ label, value, valueColor }: { label: string; value: string | number; valueColor?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 5, flexShrink: 0 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: "rgba(255,255,255,.42)", textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: valueColor ?? "rgba(255,255,255,.9)" }}>{value}</span>
    </div>
  );
}

const SEVERITY_OPTIONS: { key: SeverityFilterValue; label: string; color: string }[] = [
  { key: "high", label: "High", color: "#dc3545" },
  { key: "medium", label: "Medium", color: "#f0ad4e" },
  { key: "low", label: "Low", color: "#3BACF0" },
  { key: "none", label: "None", color: "var(--sre-text-secondary)" },
];

function SeverityFilterToggle({ active, onToggle }: { active: Set<SeverityFilterValue>; onToggle: (v: SeverityFilterValue) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ fontSize: 11, color: "var(--sre-text-secondary)", fontWeight: 600 }}>Critical severity:</span>
      {SEVERITY_OPTIONS.map((opt) => {
        const isActive = active.has(opt.key);
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onToggle(opt.key)}
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: 12,
              cursor: "pointer",
              border: `1px solid ${opt.color}`,
              background: isActive ? opt.color : "transparent",
              color: isActive ? "#fff" : opt.color,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

interface Props {
  appCI: string;
}

export const UpstreamDownstreamPage = ({ appCI }: Props) => {
  // Set by CheckDetailModal's "4. Smartscape Discovery" row click (see
  // dependenciesRowClick) via navigate("/upstream-downstream", {state}) — a
  // one-time handoff for the initial service, read only on first mount.
  // The ApplicationCI itself needs no handoff: it's shared App.tsx state
  // already showing this app before, during, and after the navigation.
  const location = useLocation();
  const initialSelection = location.state as { initialServiceId?: string; initialServiceName?: string } | null;
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(() => initialSelection?.initialServiceId ?? null);
  const [selectedServiceName, setSelectedServiceName] = useState<string>(() => initialSelection?.initialServiceName ?? "");
  const [upstreamLevels, setUpstreamLevels] = useState(1);
  const [downstreamLevels, setDownstreamLevels] = useState(1);
  const [severityFilter, setSeverityFilter] = useState<Set<SeverityFilterValue>>(new Set());

  const toggleSeverity = (v: SeverityFilterValue) => {
    setSeverityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  };

  const { data: statusData, isLoading: statusLoading } = useDql({ query: STATUS_QUERY(appCI) });
  const status = String(statusData?.records?.[0]?.operational_status || "");
  const isInProduction = !statusLoading && status === "In Production";

  const { data: summaryData } = useDql({ query: isInProduction ? SUMMARY_QUERY(appCI) : "data record(skip = true) | limit 0" });
  const summary = summaryData?.records?.[0] as Record<string, unknown> | undefined;

  const upstreamChain = useDependencyChain(selectedServiceId, "backward", upstreamLevels);
  const downstreamChain = useDependencyChain(selectedServiceId, "forward", downstreamLevels);

  const { data: rootProblemData } = useDql({
    query: selectedServiceId ? ROOT_PROBLEM_QUERY(selectedServiceId) : "data record(skip = true) | limit 0",
  });
  const rootProblemRow = rootProblemData?.records?.[0] as Record<string, unknown> | undefined;
  const rootProblem: ActiveProblemLink | null = rootProblemRow
    ? { role: String(rootProblemRow.role || ""), problemId: String(rootProblemRow.problemId || "") }
    : null;

  const { data: rootMetricsData } = useDql({
    query: selectedServiceId ? ROOT_METRICS_QUERY(selectedServiceId) : "data record(skip = true) | limit 0",
  });
  const rootMetricsRow = rootMetricsData?.records?.[0] as Record<string, unknown> | undefined;
  const rootMetrics: NodeMetrics | null = rootMetricsRow
    ? { requestCount: rootMetricsRow.reqCount != null ? Number(rootMetricsRow.reqCount) : null, p95Us: rootMetricsRow.p95Us != null ? Number(rootMetricsRow.p95Us) : null }
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

      <div style={{ background: SPINE_BACKGROUND, borderRadius: 16, padding: "16px 24px 20px", boxShadow: "0 4px 24px rgba(0,0,0,0.12)" }}>
        <AppIdentityBar appCI={appCI} />
        <div style={{ borderTop: "1px solid rgba(255,255,255,.12)", marginTop: 14, paddingTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.5)", letterSpacing: 2, marginBottom: 10 }}>
            SERVICE OVERVIEW
          </div>
          {summary ? (
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <SummaryChip label="Services" value={Number(summary.total || 0)} />
              <SummaryChip label="High" value={Number(summary.high || 0)} valueColor="#FF6B6B" />
              <SummaryChip label="Medium" value={Number(summary.medium || 0)} valueColor="#FBBF24" />
              <SummaryChip label="Low" value={Number(summary.low || 0)} valueColor="#7DD3FC" />
              <SummaryChip label="Active problems" value={Number(summary.activeProblems || 0)} valueColor={Number(summary.activeProblems || 0) > 0 ? "#FF6B6B" : undefined} />
            </div>
          ) : (
            <Paragraph style={{ color: "rgba(255,255,255,.5)", fontSize: 12 }}>
              {isInProduction ? "Loading service overview…" : "Not available until an In-Production AppCI is selected."}
            </Paragraph>
          )}
        </div>
      </div>

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
            <Flex justifyContent="space-between" alignItems="center" style={{ marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
              <Heading level={5}>Services</Heading>
              <SeverityFilterToggle active={severityFilter} onToggle={toggleSeverity} />
            </Flex>
            <div style={{ marginBottom: 8 }}>
              <SeverityLegend />
            </div>
            <ServiceGoldenSignalsTable appCI={appCI} selectedServiceId={selectedServiceId} onSelect={handleSelect} severityFilter={severityFilter} />
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
                <ChainShapeSummary direction="upstream" chain={upstreamChain} selectedLevel={upstreamLevels} onLevelClick={setUpstreamLevels} />
                <DependencyGraphPanel
                  direction="backward"
                  originId={selectedServiceId}
                  originName={selectedServiceName}
                  chain={upstreamChain}
                  levels={upstreamLevels}
                  maxLevels={MAX_LEVELS}
                  onLevelsChange={setUpstreamLevels}
                  rootProblem={rootProblem}
                  rootMetrics={rootMetrics}
                />
                <div style={{ marginTop: 12 }}>
                  <DependencySummaryPanel direction="upstream" chain={upstreamChain} levels={upstreamLevels} onSelectService={handleSelect} />
                </div>
              </div>

              <div>
                <Heading level={5} style={{ marginBottom: 8 }}>
                  Downstream — {selectedServiceName}
                </Heading>
                <ChainShapeSummary direction="downstream" chain={downstreamChain} selectedLevel={downstreamLevels} onLevelClick={setDownstreamLevels} />
                <DependencyGraphPanel
                  direction="forward"
                  originId={selectedServiceId}
                  originName={selectedServiceName}
                  chain={downstreamChain}
                  levels={downstreamLevels}
                  maxLevels={MAX_LEVELS}
                  onLevelsChange={setDownstreamLevels}
                  rootProblem={rootProblem}
                  rootMetrics={rootMetrics}
                />
                <div style={{ marginTop: 12 }}>
                  <DependencySummaryPanel direction="downstream" chain={downstreamChain} levels={downstreamLevels} onSelectService={handleSelect} />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </Flex>
  );
};
