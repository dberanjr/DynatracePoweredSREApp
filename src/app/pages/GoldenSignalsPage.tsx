import React from "react";
import {
  Flex,
  Text,
  DataTable,
  ProgressCircle,
  Surface,
} from "@dynatrace/strato-components-preview";
import { useDqlQuery } from "../hooks/useDqlQuery";

interface Props {
  appCI: string;
}

function QueryTable({ title, query }: { title: string; query: string }) {
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

export const GoldenSignalsPage: React.FC<Props> = ({ appCI }) => {
  const svcLookup = `| fieldsAdd svcIdStr = toString(dt.smartscape.service)
| lookup [
    fetch dt.entity.service
    | expand tags
    | parse tags, "'applicationci:' LD:appci"
    | filter lower(appci) == lower("${appCI}")
    | dedup id
    | fieldsAdd idStr = toString(id)
    | fields idStr
  ], sourceField:svcIdStr, lookupField:idStr, prefix:"app."
| filter isNotNull(\`app.idStr\`)
| fieldsAdd serviceName = getNodeName(dt.smartscape.service)`;

  const requestRateQuery = `timeseries requestRate = sum(dt.service.request.count),
  interval:5m,
  by:{dt.smartscape.service}
${svcLookup}
| fields timeframe, interval, serviceName, requestRate, arrayAvg(requestRate)`;

  const errorRateQuery = `timeseries errorRate = sum(dt.service.request.failure_count),
  interval:5m,
  by:{dt.smartscape.service}
${svcLookup}
| fields timeframe, interval, serviceName, errorRate, arrayAvg(errorRate)
| sort \`arrayAvg(errorRate)\` desc`;

  const responseTimeQuery = `timeseries {
    p50 = percentile(dt.service.request.response_time, 50),
    p90 = percentile(dt.service.request.response_time, 90),
    p99 = percentile(dt.service.request.response_time, 99)
  },
  interval:5m,
  by:{dt.smartscape.service}
${svcLookup}
| fields timeframe, interval, serviceName, p50, p90, p99, arrayAvg(p50), arrayAvg(p90), arrayAvg(p99)`;

  return (
    <Flex flexDirection="column" gap={16} padding={16}>
      <Text textStyle="heading-level-3">L2 - Measured Reliability (Golden Signals)</Text>
      <Flex gap={16}>
        <Flex flexDirection="column" flex={1}>
          <QueryTable title="Request Rate by Service" query={requestRateQuery} />
        </Flex>
        <Flex flexDirection="column" flex={1}>
          <QueryTable title="Error Rate by Service" query={errorRateQuery} />
        </Flex>
        <Flex flexDirection="column" flex={1}>
          <QueryTable title="Response Time P50 / P90 / P99" query={responseTimeQuery} />
        </Flex>
      </Flex>
    </Flex>
  );
};
