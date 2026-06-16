import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading } from "@dynatrace/strato-components/typography";
import { KpiCard } from "../components/KpiCard";
import { ChartCard } from "../components/ChartCard";
import { TableCard } from "../components/TableCard";

interface Props {
  appCI: string;
  timeframe: { from: string; to: string };
}


export const ProactivePage = ({ appCI, timeframe }: Props) => {
  const tf = `from:${timeframe.from}, to:${timeframe.to}`;

  const eventFilter = `fetch events, ${tf}
| filter event.kind == "DAVIS_EVENT"
| expand affected_entity_tags
| parse affected_entity_tags, "'applicationci:' LD:appci"
| filter isNotNull(appci)
| filter lower(appci) == lower("${appCI}")`;

  // ── KPI queries ──
  const deploymentsQuery = `fetch events, ${tf}
| filter event.kind == "DAVIS_EVENT"
| filter event.type == "CUSTOM_DEPLOYMENT"
| expand affected_entity_tags
| parse affected_entity_tags, "'applicationci:' LD:appci"
| filter isNotNull(appci)
| filter lower(appci) == lower("${appCI}")
| summarize \`Count\` = count()`;

  const resourceContentionCountQuery = `${eventFilter}
| filter event.category == "RESOURCE_CONTENTION"
| summarize \`Count\` = count()`;

  const customAlertCountQuery = `${eventFilter}
| filter event.category == "CUSTOM_ALERT"
| summarize \`Count\` = count()`;

  const serviceCountQuery = `fetch dt.entity.service
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup id
| summarize \`Count\` = count()`;

  const k8sCountQuery = `fetch dt.entity.cloud_application
| expand tags
| filter contains(lower(tags), "applicationci")
| parse tags, "LD:key ':' LD:value"
| filter contains(lower(key), "applicationci")
| filter lower(value) == lower("${appCI}")
| dedup id
| summarize \`Count\` = count()`;

  const awsCountQuery = `fetch bizevents, from:now()-24h
| filter event.type=="workflow.summary.cloud.aws" and lower(applicationci)==lower("${appCI}")
| filter type != "RUM_APPLICATION"
| summarize \`Count\` = count()`;

  // ── Chart queries ──
  const deploymentTrendQuery = `fetch events, ${tf}
| filter event.kind == "DAVIS_EVENT"
| filter event.type == "CUSTOM_DEPLOYMENT"
| expand affected_entity_tags
| parse affected_entity_tags, "'applicationci:' LD:appci"
| filter isNotNull(appci)
| filter lower(appci) == lower("${appCI}")
| makeTimeseries Deployments = count()`;

  const resourceTrendQuery = `${eventFilter}
| filter event.category == "RESOURCE_CONTENTION"
| makeTimeseries Events = count()`;

  const alertNoiseTrendQuery = `${eventFilter}
| filter event.category == "CUSTOM_ALERT"
| makeTimeseries Alerts = count()`;

  // ── Table queries ──
  const serviceListQuery = `fetch dt.entity.service
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup entity.name
| fields Service = entity.name
| sort Service asc
| limit 50`;

  const k8sListQuery = `fetch dt.entity.cloud_application
| expand tags
| filter contains(lower(tags), "applicationci")
| parse tags, "LD:key ':' LD:value"
| filter contains(lower(key), "applicationci")
| filter lower(value) == lower("${appCI}")
| dedup id
| fields Workload = entity.name
| sort Workload asc
| limit 50`;

  const awsDevicesQuery = `fetch bizevents, from:now()-24h
| filter event.type=="workflow.summary.cloud.aws" and lower(applicationci)==lower("${appCI}")
| filter type != "RUM_APPLICATION"
| summarize Count = count(), by:{type}
| sort Count desc`;

  return (
    <Flex flexDirection="column" gap={20} padding={16}>
      <Heading level={3}>L4 — Proactive Reliability</Heading>

      {/* KPI Summary */}
      <div style={{
        background: "linear-gradient(135deg, #1A2440 0%, #1A2440 100%)",
        borderRadius: 16, padding: "18px 24px 20px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 2, marginBottom: 14 }}>
          PROACTIVE RELIABILITY SIGNALS
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <KpiCard icon="&#128640;" label="DEPLOYMENTS" query={deploymentsQuery} color="#49C2B3" />
          <KpiCard icon="&#128200;" label="RESOURCE CONTENTION" query={resourceContentionCountQuery} color="#5E28E5" />
          <KpiCard icon="&#128276;" label="CUSTOM ALERTS" query={customAlertCountQuery} color="#8D1CDC" />
          <KpiCard icon="&#128300;" label="SERVICES MONITORED" query={serviceCountQuery} color="#3BACF0" />
          <KpiCard icon="&#9784;" label="K8S WORKLOADS" query={k8sCountQuery} color="#5E28E5" />
          <KpiCard icon="&#9729;" label="AWS RESOURCES" query={awsCountQuery} color="#1966FF" />
        </div>
      </div>

      {/* Trend charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <ChartCard
          title="Deployment Frequency"
          subtitle="Deployment events over time"
          icon="&#128640;"
          color="#49C2B3"
          query={deploymentTrendQuery}
        />
        <ChartCard
          title="Resource Contention"
          subtitle="Resource saturation events over time"
          icon="&#128200;"
          color="#5E28E5"
          query={resourceTrendQuery}
        />
        <ChartCard
          title="Alert Noise"
          subtitle="Custom alert volume over time"
          icon="&#128276;"
          color="#8D1CDC"
          query={alertNoiseTrendQuery}
        />
      </div>

      {/* Detail tables */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <TableCard
          title="Services"
          color="#3BACF0"
          query={serviceListQuery}
          columns={[{ name: "Service", label: "Service Name" }]}
          maxHeight={350}
        />
        <TableCard
          title="Kubernetes Workloads"
          color="#5E28E5"
          query={k8sListQuery}
          columns={[{ name: "Workload", label: "Workload Name" }]}
          maxHeight={350}
        />
        <TableCard
          title="AWS Resources by Type"
          color="#1966FF"
          query={awsDevicesQuery}
          columns={[
            { name: "type", label: "Resource Type" },
            { name: "Count", label: "Count" },
          ]}
          maxHeight={350}
        />
      </div>
    </Flex>
  );
};
