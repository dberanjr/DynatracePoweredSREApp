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

export const PortfolioPage: React.FC = () => {
  const appInventoryQuery = `fetch dt.entity.service
| expand tags
| parse tags, "'utan:' LD:utan"
| filter isNotNull(utan)
| fieldsAdd utan = upper(utan)
| dedup utan, id
| summarize serviceCount = count(),
    by:{utan}
| lookup [
    load "/lookups/utan_data"
  ], sourceField:utan, lookupField:utan, prefix:"cmdb."
| filter isNotNull(\`cmdb.SNOW_app_name\`)
| fields
    utan,
    \`cmdb.SNOW_app_name\`,
    \`cmdb.top_tier\`,
    \`cmdb.managed_by\`,
    serviceCount
| sort \`cmdb.top_tier\` asc, serviceCount desc
| limit 50`;

  const appsByTierQuery = `fetch dt.entity.service
| expand tags
| parse tags, "'utan:' LD:utan"
| filter isNotNull(utan)
| fieldsAdd utan = upper(utan)
| dedup utan
| lookup [
    load "/lookups/utan_data"
  ], sourceField:utan, lookupField:utan, prefix:"cmdb."
| filter isNotNull(\`cmdb.SNOW_app_name\`)
| summarize appCount = count(),
    by:{\`cmdb.top_tier\`}
| sort \`cmdb.top_tier\` asc`;

  const topAppsByServiceQuery = `fetch dt.entity.service
| expand tags
| parse tags, "'utan:' LD:utan"
| filter isNotNull(utan)
| fieldsAdd utan = upper(utan)
| summarize serviceCount = count(),
    by:{utan}
| lookup [
    load "/lookups/utan_data"
  ], sourceField:utan, lookupField:utan, prefix:"cmdb."
| filter isNotNull(\`cmdb.SNOW_app_name\`)
| filter serviceCount > 100
| fields \`cmdb.SNOW_app_name\`, serviceCount
| sort serviceCount desc
| limit 20`;

  return (
    <Flex flexDirection="column" gap={16} padding={16}>
      <Text textStyle="heading-level-3">Portfolio View - All Applications</Text>

      <Grid gridTemplateColumns="1fr 3fr" gap={16}>
        <QuerySection title="Apps by Tier" query={appsByTierQuery} />
        <QuerySection title="App Inventory with Service Counts" query={appInventoryQuery} />
      </Grid>

      <QuerySection title="Top Apps by Service Count" query={topAppsByServiceQuery} />
    </Flex>
  );
};
