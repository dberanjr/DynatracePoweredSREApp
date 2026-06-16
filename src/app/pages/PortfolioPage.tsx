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
| parse tags, "'applicationci:' LD:appci"
| filter isNotNull(appci)
| fieldsAdd appci = upper(appci)
| dedup appci, id
| summarize serviceCount = count(),
    by:{appci}
| lookup [
    load "/lookups/dynatrace/cmdb_appci_owner_mapping"
  ], sourceField:appci, lookupField:applicationci, prefix:"cmdb."
| filter isNotNull(\`cmdb.name\`)
| filter \`cmdb.operational_status\` != "Retired"
| fields
    appci,
    \`cmdb.name\`,
    \`cmdb.business_criticality\`,
    \`cmdb.managed_by.u_managing_director\`,
    serviceCount
| sort \`cmdb.business_criticality\` asc, serviceCount desc
| limit 50`;

  const appsByTierQuery = `fetch dt.entity.service
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter isNotNull(appci)
| fieldsAdd appci = upper(appci)
| dedup appci
| lookup [
    load "/lookups/dynatrace/cmdb_appci_owner_mapping"
  ], sourceField:appci, lookupField:applicationci, prefix:"cmdb."
| filter isNotNull(\`cmdb.name\`)
| filter \`cmdb.operational_status\` != "Retired"
| summarize appCount = count(),
    by:{\`cmdb.business_criticality\`}
| sort \`cmdb.business_criticality\` asc`;

  const topAppsByServiceQuery = `fetch dt.entity.service
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter isNotNull(appci)
| fieldsAdd appci = upper(appci)
| summarize serviceCount = count(),
    by:{appci}
| lookup [
    load "/lookups/dynatrace/cmdb_appci_owner_mapping"
  ], sourceField:appci, lookupField:applicationci, prefix:"cmdb."
| filter isNotNull(\`cmdb.name\`)
| filter \`cmdb.operational_status\` != "Retired"
| filter serviceCount > 100
| fields \`cmdb.name\`, serviceCount
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
