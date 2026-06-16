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

export const AiOpsPage = ({ appCI, timeframe }: Props) => {
  const tf = `from:${timeframe.from}, to:${timeframe.to}`;

  // Strategy: join events with entity IDs for this AppCI
  // Step 1 in each query: get events
  // Step 2: lookup against service entities tagged with this AppCI
  // If affected_entity_ids matches a service for this AppCI, it's relevant

  const eventFilter = `fetch events, ${tf}
| filter event.kind == "DAVIS_EVENT"
| expand affected_entity_ids
| filter isNotNull(affected_entity_ids)
| lookup [
    fetch dt.entity.service
    | expand tags
    | parse tags, "'applicationci:' LD:appci"
    | filter lower(appci) == lower("${appCI}")
    | dedup id
    | fieldsAdd idStr = toString(id)
    | fields idStr
  ], sourceField:affected_entity_ids, lookupField:idStr, prefix:"app."
| filter isNotNull(\`app.idStr\`)`;

  // ── KPI queries ──
  const totalEventsQuery = `${eventFilter}
| summarize \`Total\` = countDistinct(event.id)`;

  const availabilityQuery = `${eventFilter}
| filter event.category == "AVAILABILITY"
| summarize \`Count\` = countDistinct(event.id)`;

  const errorEventsQuery = `${eventFilter}
| filter event.category == "ERROR"
| summarize \`Count\` = countDistinct(event.id)`;

  const slowdownQuery = `${eventFilter}
| filter event.category == "SLOWDOWN"
| summarize \`Count\` = countDistinct(event.id)`;

  const resourceQuery = `${eventFilter}
| filter event.category == "RESOURCE_CONTENTION"
| summarize \`Count\` = countDistinct(event.id)`;

  const customAlertQuery = `${eventFilter}
| filter event.category == "CUSTOM_ALERT"
| summarize \`Count\` = countDistinct(event.id)`;

  // ── Chart queries ──
  const eventTrendQuery = `${eventFilter}
| dedup event.id, event.category
| makeTimeseries Events = count(),
    by:{event.category}`;

  const eventTrendTotalQuery = `${eventFilter}
| dedup event.id
| makeTimeseries Events = count()`;

  // ── Table queries ──
  const topNoisyServicesQuery = `${eventFilter}
| lookup [
    fetch dt.entity.service
    | fields id, serviceName = entity.name
  ], sourceField:affected_entity_ids, lookupField:id, prefix:"svc."
| filter isNotNull(\`svc.serviceName\`)
| summarize Events = countDistinct(event.id), by:{serviceName = \`svc.serviceName\`}
| sort Events desc
| limit 20`;

  const eventsByCategoryQuery = `${eventFilter}
| summarize Events = countDistinct(event.id),
    by:{event.category}
| sort Events desc`;

  const topEventTypesQuery = `${eventFilter}
| summarize Events = countDistinct(event.id),
    by:{event.type}
| sort Events desc
| limit 15`;

  return (
    <Flex flexDirection="column" gap={20} padding={16}>
      <Heading level={3}>L3 — AI-Assisted Operations</Heading>

      {/* KPI Summary */}
      <div style={{
        background: "linear-gradient(135deg, #1A2440 0%, #1A2440 100%)",
        borderRadius: 16, padding: "18px 24px 20px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 2, marginBottom: 14 }}>
          DAVIS EVENT INTELLIGENCE
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <KpiCard icon="&#9888;" label="TOTAL EVENTS" query={totalEventsQuery} color="#5E28E5" />
          <KpiCard icon="&#128683;" label="AVAILABILITY" query={availabilityQuery} color="#dc3545" />
          <KpiCard icon="&#10060;" label="ERRORS" query={errorEventsQuery} color="#8D1CDC" />
          <KpiCard icon="&#128034;" label="SLOWDOWNS" query={slowdownQuery} color="#8D1CDC" />
          <KpiCard icon="&#128200;" label="RESOURCE CONTENTION" query={resourceQuery} color="#5E28E5" />
          <KpiCard icon="&#128276;" label="CUSTOM ALERTS" query={customAlertQuery} color="#C93FDB" />
        </div>
      </div>

      {/* Event trend charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <ChartCard
          title="Event Trend by Category"
          subtitle="Davis events over time grouped by category"
          icon="&#128202;"
          color="#5E28E5"
          query={eventTrendQuery}
        />
        <ChartCard
          title="Total Event Volume"
          subtitle="Aggregate Davis event count over time"
          icon="&#128200;"
          color="#1966FF"
          query={eventTrendTotalQuery}
        />
      </div>

      {/* Detail tables */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <TableCard
          title="Events by Category"
          color="#5E28E5"
          query={eventsByCategoryQuery}
          columns={[
            { name: "event.category", label: "Category" },
            { name: "Events", label: "Events" },
          ]}
        />
        <TableCard
          title="Top Noisy Services"
          color="#dc3545"
          query={topNoisyServicesQuery}
          columns={[
            { name: "serviceName", label: "Service" },
            { name: "Events", label: "Events" },
          ]}
          maxHeight={300}
        />
        <TableCard
          title="Top Event Types"
          color="#1966FF"
          query={topEventTypesQuery}
          columns={[
            { name: "event.type", label: "Event Type" },
            { name: "Events", label: "Events" },
          ]}
          maxHeight={300}
        />
      </div>
    </Flex>
  );
};
