import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { useDqlWithCache } from "../hooks/useDqlWithCache";
import { RefreshOverlay } from "../components/RefreshOverlay";
import { AppContextBanner } from "../components/AppContextBanner";
import { SimpleTable } from "../components/SimpleTable";

interface Props {
  appCI: string;
  timeframe: { from: string; to: string };
}

// ── Signal card — style #4: big number hero card ──

function SignalCard({
  icon,
  label,
  query,
  color,
}: {
  icon: string;
  label: string;
  query: string;
  color: string;
}) {
  const { data, isLoading, isRefreshing, error } = useDqlWithCache({ query });
  const value = data?.records?.[0] ? Number(Object.values(data.records[0])[0]) : 0;
  const hasData = !isLoading && !error && value > 0;

  return (
    <RefreshOverlay isRefreshing={isRefreshing}>
    <div style={{
      borderRadius: 14,
      padding: "14px 16px 12px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 2,
      position: "relative",
      overflow: "hidden",
      background: `radial-gradient(ellipse at 50% 0%, ${color}20, transparent 70%), rgba(255,255,255,0.03)`,
      border: `1px solid ${hasData ? color + "35" : "rgba(255,255,255,0.06)"}`,
      transition: "all 0.3s",
    }}>
      {/* Big number */}
      {isLoading ? (
        <div style={{ padding: 8 }}><ProgressCircle size="small" /></div>
      ) : error ? (
        <span style={{ fontSize: 16, color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>N/A</span>
      ) : (
        <span style={{
          fontSize: 38, fontWeight: 900, lineHeight: 1, letterSpacing: -1,
          color: hasData ? "#fff" : "rgba(255,255,255,0.1)",
          textShadow: hasData ? `0 2px 24px ${color}50, 0 0 60px ${color}20` : "none",
        }}>
          {value.toLocaleString()}
        </span>
      )}

      {/* Label */}
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textAlign: "center",
        color: hasData ? color : "rgba(255,255,255,0.2)",
        marginTop: 2,
      }}>
        {label}
      </div>

      {/* Bottom accent bar */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 3,
        background: hasData
          ? `linear-gradient(90deg, transparent, ${color}, transparent)`
          : "transparent",
        transition: "all 0.5s",
      }} />
    </div>
    </RefreshOverlay>
  );
}

// ── Section with colored header ──

function SectionCard({
  title,
  color,
  children,
}: {
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: "var(--sre-surface, #fff)",
      borderRadius: 12,
      border: "1px solid var(--sre-border, rgba(0,0,0,0.06))",
      overflow: "hidden",
      boxShadow: "0 1px 3px var(--sre-card-shadow)",
    }}>
      <div style={{
        background: `linear-gradient(135deg, ${color}, ${color}dd)`,
        padding: "10px 20px",
      }}>
        <Heading level={5} style={{ color: "#fff", margin: 0 }}>{title}</Heading>
      </div>
      <div style={{ padding: 20 }}>
        {children}
      </div>
    </div>
  );
}

// ── Table section with query ──

function QueryTable({
  query,
  columns,
  maxHeight,
}: {
  query: string;
  columns: { name: string; label: string }[];
  maxHeight?: number;
}) {
  const { data, isLoading, isRefreshing, error } = useDqlWithCache({ query });

  if (isLoading) return <ProgressCircle />;
  if (error) return <Paragraph style={{ fontSize: 12, color: "var(--dt-colors-text-critical-default)" }}>{error.message}</Paragraph>;
  if (!data?.records || data.records.length === 0) return <Paragraph style={{ opacity: 0.5 }}>No data</Paragraph>;

  return (
    <RefreshOverlay isRefreshing={isRefreshing}>
      <div style={{ maxHeight, overflowY: maxHeight ? "auto" : undefined, borderRadius: 6 }}>
        <SimpleTable data={data.records as Record<string, unknown>[]} columns={columns} stickyHeader={!!maxHeight} />
      </div>
    </RefreshOverlay>
  );
}

export const Home = ({ appCI, timeframe }: Props) => {
  const tf = `from:${timeframe.from}, to:${timeframe.to}`;

  // ── Signal queries ──
  const servicesQuery = `fetch dt.entity.service
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup id
| summarize Count = count()`;

  const hostsQuery = `fetch dt.entity.host
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup id
| summarize Count = count()`;

  const processGroupsQuery = `fetch dt.entity.process_group
| fieldsAdd applicationci=splitString(arrayRemoveNulls(iCollectArray(if(matchesValue(tags[], "*applicationci*"), lower(tags[]))))[0], ":")[1]
| filter in(applicationci, {lower("${appCI}")})
| dedup id
| summarize Count = count()`;

  const k8sQuery = `fetch dt.entity.cloud_application
| expand tags
| filter contains(lower(tags), "applicationci")
| parse tags, "LD:key ':' LD:value"
| filter contains(lower(key), "applicationci")
| filter lower(value) == lower("${appCI}")
| dedup id
| summarize Count = count()`;

  const logsQuery = `fetch logs, samplingRatio:100
| filter applicationci == lower("${appCI}")
| limit 1
| summarize Count = count()`;

  const rumQuery = `fetch dt.entity.application, from:now()-1000d
| fieldsAdd applicationci=splitString(arrayRemoveNulls(iCollectArray(if(matchesValue(tags[], "*applicationci*"), lower(tags[]))))[0], ":")[1]
| filter in(applicationci, {lower("${appCI}")})
| summarize Count = count()`;

  const awsQuery = `fetch bizevents, from:now()-24h
| filter event.type=="workflow.summary.cloud.aws" and lower(applicationci)==lower("${appCI}")
| filter type != "RUM_APPLICATION"
| summarize Count = count()`;

  const deploysQuery = `fetch events, ${tf}
| filter event.kind == "DAVIS_EVENT"
| filter event.type == "CUSTOM_DEPLOYMENT"
| expand affected_entity_tags
| parse affected_entity_tags, "'applicationci:' LD:appci"
| filter isNotNull(appci)
| filter lower(appci) == lower("${appCI}")
| summarize Count = count()`;

  // ── Detail table queries ──
  const serviceListQuery = `fetch dt.entity.service
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup id
| fields Service = entity.name
| sort Service asc
| limit 25`;

  const hostListQuery = `fetch dt.entity.host
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup id
| fields Host = entity.name, monitoringMode
| sort Host asc
| limit 25`;

  const k8sListQuery = `fetch dt.entity.cloud_application
| expand tags
| filter contains(lower(tags), "applicationci")
| parse tags, "LD:key ':' LD:value"
| filter contains(lower(key), "applicationci")
| filter lower(value) == lower("${appCI}")
| dedup id
| fields Workload = entity.name
| sort Workload asc
| limit 25`;

  return (
    <Flex flexDirection="column" gap={20} padding={16}>
      {/* App context banner */}
      <AppContextBanner appCI={appCI} />

      {/* Observability signals overview */}
      <div style={{
        background: "linear-gradient(135deg, #1A2440 0%, #1A2440 100%)",
        borderRadius: 16, padding: "18px 24px 20px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 2, marginBottom: 14 }}>
          OBSERVABILITY SIGNALS
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <SignalCard icon="&#128300;" label="SERVICES" query={servicesQuery} color="#3BACF0" />
          <SignalCard icon="&#128421;" label="HOSTS" query={hostsQuery} color="#1966FF" />
          <SignalCard icon="&#9881;" label="PROCESS GROUPS" query={processGroupsQuery} color="#5E28E5" />
          <SignalCard icon="&#9784;" label="K8S WORKLOADS" query={k8sQuery} color="#5E28E5" />
          <SignalCard icon="&#128220;" label="LOGS" query={logsQuery} color="#8D1CDC" />
          <SignalCard icon="&#127760;" label="RUM APPS" query={rumQuery} color="#49C2B3" />
          <SignalCard icon="&#9729;" label="AWS RESOURCES" query={awsQuery} color="#5E28E5" />
          <SignalCard icon="&#128640;" label="DEPLOYMENTS" query={deploysQuery} color="#dc3545" />
        </div>
      </div>

      {/* Detail tables */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <SectionCard title="Services" color="#3BACF0">
          <QueryTable
            query={serviceListQuery}
            columns={[{ name: "Service", label: "Service Name" }]}
            maxHeight={300}
          />
        </SectionCard>

        <SectionCard title="Hosts" color="#1966FF">
          <QueryTable
            query={hostListQuery}
            columns={[
              { name: "Host", label: "Host Name" },
              { name: "monitoringMode", label: "Mode" },
            ]}
            maxHeight={300}
          />
        </SectionCard>

        <SectionCard title="Kubernetes Workloads" color="#5E28E5">
          <QueryTable
            query={k8sListQuery}
            columns={[{ name: "Workload", label: "Workload Name" }]}
            maxHeight={300}
          />
        </SectionCard>
      </div>
    </Flex>
  );
};
