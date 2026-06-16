import React from "react";
import {
  Flex,
  Grid,
  Text,
  Surface,
  DataTable,
  ProgressCircle,
} from "@dynatrace/strato-components-preview";
import { useDqlQuery } from "../hooks/useDqlQuery";

interface Props {
  appCI: string;
}

function StatCard({ label, query }: { label: string; query: string }) {
  const { records, loading, error } = useDqlQuery(query);
  const value = records?.[0] ? Object.values(records[0])[0] : "—";

  return (
    <Surface>
      <Flex flexDirection="column" alignItems="center" padding={16} gap={4}>
        <Text textStyle="label">{label}</Text>
        {loading ? (
          <ProgressCircle size="small" />
        ) : error ? (
          <Text css={{ color: "var(--dt-colors-text-critical-default)" }}>Error</Text>
        ) : (
          <Text textStyle="heading-level-2">{String(value)}</Text>
        )}
      </Flex>
    </Surface>
  );
}

function QuerySection({ title, query }: { title: string; query: string }) {
  const { records, loading, error } = useDqlQuery(query);

  return (
    <Surface>
      <Flex flexDirection="column" gap={8} padding={16}>
        <Text textStyle="heading-level-4">{title}</Text>
        {loading ? (
          <ProgressCircle />
        ) : error ? (
          <Text css={{ color: "var(--dt-colors-text-critical-default)" }}>{error}</Text>
        ) : records && records.length > 0 ? (
          <DataTable data={records} />
        ) : (
          <Text>No data available</Text>
        )}
      </Flex>
    </Surface>
  );
}

export const AiOpsPage: React.FC<Props> = ({ appCI }) => {
  const problemFilter = `fetch dt.davis.problems
| fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
| filter lower(appci) == lower("${appCI}")
| filter dt.davis.is_duplicate == false`;

  const problemsByCategoryQuery = `${problemFilter}
| summarize Problems = count(),
    by:{event.category}
| sort Problems desc`;

  const avgDurationQuery = `${problemFilter}
| filter event.status == "CLOSED"
| summarize \`Avg Duration (min)\` = round(
    avg(toDouble(resolved_problem_duration) / 60000000000.0),
    decimals:1
  )`;

  const topNoisyServicesQuery = `fetch dt.davis.problems
| fieldsAdd service=if(contains(affected_entity_ids[], "SERVICE"), 1)
| filter arraySum(service) > 0
| fieldsAdd dt.entity.service = if(startsWith(affected_entity_ids[0],"SERVICE"), affected_entity_ids[0])
| fieldsAdd Service = entityName(dt.entity.service)
| filter isNotNull(Service)
| fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
| filter lower(appci) == lower("${appCI}")
| fieldsAdd usersAreAffected = if(isNotNull(dt.davis.affected_users_count),"YES", else: "NO")
| summarize Problems = count(), by:{Service, dt.entity.service}
| sort Problems desc`;

  const topRootCausesQuery = `${problemFilter}
| filter isNotNull(root_cause_entity)
| fieldsAdd rcName = root_cause_entity[entity_name]
| filter isNotNull(rcName)
| summarize Problems = count(),
    by:{rcName}
| sort Problems desc
| limit 10`;

  const problemTrendQuery = `${problemFilter}
| makeTimeseries Problems = count(),
    by:{event.category}`;

  return (
    <Flex flexDirection="column" gap={16} padding={16}>
      <Text textStyle="heading-level-3">L3 - AI-Assisted Operations</Text>

      <Grid gridTemplateColumns="1fr 1fr 1fr" gap={16}>
        <QuerySection title="Problems by Category" query={problemsByCategoryQuery} />
        <StatCard label="AVG PROBLEM DURATION (MIN)" query={avgDurationQuery} />
        <QuerySection title="Top Noisy Services" query={topNoisyServicesQuery} />
      </Grid>

      <Grid gridTemplateColumns="1fr 1fr" gap={16}>
        <QuerySection title="Top 10 Root Cause Entities" query={topRootCausesQuery} />
        <QuerySection title="Problem Trend" query={problemTrendQuery} />
      </Grid>
    </Flex>
  );
};
