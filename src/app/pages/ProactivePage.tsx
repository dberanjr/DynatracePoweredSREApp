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

export const ProactivePage: React.FC<Props> = ({ appCI }) => {
  const problemFilter = `fetch dt.davis.problems
| fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
| filter lower(appci) == lower("${appCI}")
| filter dt.davis.is_duplicate == false`;

  const deploymentTrendQuery = `fetch events, from:now()-7d
| filter event.kind == "DAVIS_EVENT"
| filter event.type == "CUSTOM_DEPLOYMENT"
| expand affected_entity_tags
| parse affected_entity_tags, "'applicationci:' LD:appci"
| filter isNotNull(appci)
| filter lower(appci) == lower("${appCI}")
| makeTimeseries Deployments = count()`;

  const resourceContentionQuery = `${problemFilter}
| filter event.category == "RESOURCE_CONTENTION"
| makeTimeseries Problems = count()`;

  const alertNoiseQuery = `${problemFilter}
| filter event.category == "CUSTOM_ALERT"
| makeTimeseries Alerts = count()`;

  const serviceListQuery = `fetch dt.entity.service
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup entity.name
| fields entity.name
| sort entity.name asc
| limit 50`;

  return (
    <Flex flexDirection="column" gap={16} padding={16}>
      <Text textStyle="heading-level-3">L4 - Proactive Reliability</Text>

      <Grid gridTemplateColumns="1fr 1fr 1fr" gap={16}>
        <QuerySection title="Deployment Events Trend (7d)" query={deploymentTrendQuery} />
        <QuerySection title="Resource Contention Problems" query={resourceContentionQuery} />
        <QuerySection title="Custom Alert Noise Trend" query={alertNoiseQuery} />
      </Grid>

      <QuerySection title="Service List" query={serviceListQuery} />
    </Flex>
  );
};
