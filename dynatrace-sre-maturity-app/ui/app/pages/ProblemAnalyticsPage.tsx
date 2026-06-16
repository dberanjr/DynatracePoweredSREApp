import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading } from "@dynatrace/strato-components/typography";
import { KpiCard } from "../components/KpiCard";
import { ChartCard } from "../components/ChartCard";
import { TableCard } from "../components/TableCard";
import { InfographicList } from "../components/InfographicList";
import { SparklineCard } from "../components/SparklineCard";

interface Props {
  appCI: string;
  timeframe: { from: string; to: string };
}

export const ProblemAnalyticsPage = ({ appCI, timeframe }: Props) => {
  const tf = `from:${timeframe.from}, to:${timeframe.to}`;

  // Link to the new Davis Problems app filtered to this AppCI
  const problemsAppBase = "https://YOUR_TENANT.apps.dynatrace.com/ui/apps/dynatrace.davis.problems/";
  const tagFilter = encodeURIComponent(`"Entity tags" = "applicationci:${appCI.toLowerCase()}"`);
  const fromParam = encodeURIComponent(timeframe.from);
  const toParam = encodeURIComponent(timeframe.to);
  const allProblemsUrl = `${problemsAppBase}?from=${fromParam}&to=${toParam}&filters=${tagFilter}`;
  const activeProblemsUrl = `${problemsAppBase}?from=${fromParam}&to=${toParam}&filters=${tagFilter}+AND+${encodeURIComponent('"Status" = "Active"')}`;
  const closedProblemsUrl = `${problemsAppBase}?from=${fromParam}&to=${toParam}&filters=${tagFilter}+AND+${encodeURIComponent('"Status" = "Closed"')}`;
  // User-impacting link uses AppCI + Active status filter
  // The tile count is derived from the DQL query which filters by isNotNull(dt.davis.affected_users_count)
  const userImpactingUrl = `${problemsAppBase}?from=${fromParam}&to=${toParam}&filters=${tagFilter}+AND+${encodeURIComponent('"Status" = "Active"')}`;

  // Common filter — joins davis problems with the AppCI tag
  const problemBase = `fetch dt.davis.problems, ${tf}
| fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
| filter event.kind == "DAVIS_PROBLEM" and dt.davis.is_duplicate == false
| filter lower(appci) == lower("${appCI}")`;

  // ── KPI queries ──
  const totalProblemsQuery = `${problemBase}
| summarize \`Total\` = count()`;

  const activeProblemsQuery = `${problemBase}
| filter event.status == "ACTIVE"
| summarize \`Active\` = count()`;

  const closedProblemsQuery = `${problemBase}
| filter event.status == "CLOSED"
| summarize \`Closed\` = count()`;

  const userImpactingQuery = `${problemBase}
| filter isNotNull(dt.davis.affected_users_count)
| summarize \`User-impacting\` = count()`;

  const avgMttrQuery = `${problemBase}
| filter event.status == "CLOSED"
| filter isNotNull(resolved_problem_duration)
| summarize \`Avg MTTR (min)\` = round(avg(toDouble(resolved_problem_duration) / 60000000000.0), decimals:1)`;

  const noisyAlertsQuery = `${problemBase}
| filter event.category == "CUSTOM_ALERT"
| summarize \`Noisy Alerts\` = count()`;

  // ── Chart queries ──
  const activeVsClosedQuery = `${problemBase}
| makeTimeseries Problems = count(), by:{event.status}`;

  const problemsByCategoryTrendQuery = `${problemBase}
| makeTimeseries Problems = count(), by:{event.category}`;

  const mttrByDayQuery = `${problemBase}
| filter event.status == "CLOSED"
| filter isNotNull(resolved_problem_duration)
| fieldsAdd durationMin = toDouble(resolved_problem_duration) / 60000000000.0
| makeTimeseries \`MTTR (min)\` = avg(durationMin)`;

  const medianDurationByCategoryQuery = `${problemBase}
| filter event.status == "CLOSED"
| filter isNotNull(resolved_problem_duration)
| fieldsAdd durationMin = toDouble(resolved_problem_duration) / 60000000000.0
| makeTimeseries \`Median Duration\` = median(durationMin), by:{event.category}`;

  // ── Table queries ──
  const problemsByCategoryQuery = `${problemBase}
| summarize Problems = count(), by:{event.category}
| sort Problems desc`;

  const topProblemsByEventQuery = `${problemBase}
| summarize Problems = count(), by:{event.name}
| sort Problems desc
| limit 20`;

  const topRootCausesQuery = `${problemBase}
| filter isNotNull(root_cause_entity_name)
| expand root_cause_entity_name
| summarize Problems = countDistinct(event.id), by:{rcName = root_cause_entity_name}
| sort Problems desc
| limit 15`;

  const topAlertingServicesQuery = `fetch dt.davis.problems, ${tf}
| fieldsAdd service = if(contains(affected_entity_ids[], "SERVICE"), 1)
| filter arraySum(service) > 0
| fieldsAdd dt.entity.service = if(startsWith(affected_entity_ids[0],"SERVICE"), affected_entity_ids[0])
| fieldsAdd Service = entityName(dt.entity.service)
| filter isNotNull(Service)
| fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
| filter lower(appci) == lower("${appCI}")
| summarize Problems = count(), by:{Service}
| sort Problems desc
| limit 15`;

  const noisyByCategoryQuery = `${problemBase}
| filter event.category == "CUSTOM_ALERT"
| fieldsAdd alertName = if(isNotNull(title), title, else: event.name)
| filter isNotNull(alertName)
| summarize \`Count\` = countDistinct(event.id), by:{alertName}
| sort \`Count\` desc
| limit 15`;

  const mttrByEventTypeQuery = `${problemBase}
| filter event.status == "CLOSED"
| filter isNotNull(resolved_problem_duration)
| fieldsAdd durationMin = toDouble(resolved_problem_duration) / 60000000000.0
| summarize \`Avg MTTR (min)\` = round(avg(durationMin), decimals:1), by:{event.type}
| sort \`Avg MTTR (min)\` desc
| limit 15`;

  return (
    <Flex flexDirection="column" gap={12} padding={16}>
      <Heading level={3}>Problem Triage & Analytics</Heading>

      {/* KPI Summary */}
      <div style={{
        background: "linear-gradient(135deg, #1A2440 0%, #1A2440 100%)",
        borderRadius: 16, padding: "16px 24px 18px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 2, marginBottom: 12 }}>
          PROBLEM INTELLIGENCE
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
          <KpiCard label="TOTAL PROBLEMS" query={totalProblemsQuery} color="#5E28E5" href={allProblemsUrl} />
          <KpiCard label="ACTIVE" query={activeProblemsQuery} color="#dc3545" href={activeProblemsUrl} />
          <KpiCard label="CLOSED" query={closedProblemsQuery} color="#49C2B3" href={closedProblemsUrl} />
          <KpiCard label="USER-IMPACTING" query={userImpactingQuery} color="#8D1CDC" />
          <KpiCard label="AVG MTTR" query={avgMttrQuery} color="#1966FF" unit="min" />
          <KpiCard label="NOISY ALERTS" query={noisyAlertsQuery} color="#C93FDB" />
        </div>
      </div>

      {/* Trend sparkline cards — all 4 in one row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
        <SparklineCard
          title="Active vs Closed"
          icon="&#128202;"
          color="#5E28E5"
          query={activeVsClosedQuery}
          aggregation="sum"
        />
        <SparklineCard
          title="Problems by Category"
          icon="&#128200;"
          color="#1966FF"
          query={problemsByCategoryTrendQuery}
          aggregation="sum"
        />
        <SparklineCard
          title="Avg MTTR Trend"
          icon="&#9201;"
          color="#8D1CDC"
          query={mttrByDayQuery}
          aggregation="avg"
          unit="min"
        />
        <SparklineCard
          title="Median Duration"
          icon="&#128104;"
          color="#C93FDB"
          query={medianDurationByCategoryQuery}
          aggregation="avg"
          unit="min"
        />
      </div>

      {/* Infographic lists row 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <InfographicList
          title="Problems by Category"
          icon="&#128260;"
          color="#5E28E5"
          query={problemsByCategoryQuery}
          labelField="event.category"
          valueField="Problems"
        />
        <InfographicList
          title="Top Problems by Event"
          icon="&#9888;"
          color="#1966FF"
          query={topProblemsByEventQuery}
          labelField="event.name"
          valueField="Problems"
        />
        <InfographicList
          title="MTTR by Event Type"
          icon="&#9201;"
          color="#3BACF0"
          query={mttrByEventTypeQuery}
          labelField="event.type"
          valueField="Avg MTTR (min)"
          unit="min"
        />
      </div>

      {/* Infographic lists row 2 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <InfographicList
          title="Top Alerting Services"
          icon="&#128293;"
          color="#dc3545"
          query={topAlertingServicesQuery}
          labelField="Service"
          valueField="Problems"
        />
        <InfographicList
          title="Noisiest Custom Alerts"
          icon="&#128276;"
          color="#C93FDB"
          query={noisyByCategoryQuery}
          labelField="alertName"
          valueField="Count"
        />
        <InfographicList
          title="Top Root Cause Entities"
          icon="&#127919;"
          color="#8D1CDC"
          query={topRootCausesQuery}
          labelField="rcName"
          valueField="Problems"
        />
      </div>
    </Flex>
  );
};
