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

function StatCard({ title, label, query }: { title: string; label: string; query: string }) {
  const { records, loading, error } = useDqlQuery(query);
  const value = records?.[0] ? Object.values(records[0])[0] : "—";

  return (
    <Surface>
      <Flex flexDirection="column" alignItems="center" padding={16} gap={4}>
        <Text textStyle="label">{label}</Text>
        {loading ? (
          <ProgressCircle size="small" />
        ) : error ? (
          <Text textStyle="base-emphasized" css={{ color: "var(--dt-colors-text-critical-default)" }}>Error</Text>
        ) : (
          <Text textStyle="heading-level-2">{String(value)}</Text>
        )}
      </Flex>
    </Surface>
  );
}

export const OverviewPage: React.FC<Props> = ({ appCI }) => {
  const profileQuery = `load "/lookups/dynatrace/cmdb_appci_owner_mapping"
| filter lower(applicationci) == lower("${appCI}")
| fields
    name,
    applicationci,
    business_criticality,
    operational_status,
    \`managed_by.u_managing_director\`,
    owned_by,
    support_group`;

  const { records: profileRecords, loading: profileLoading } = useDqlQuery(profileQuery);

  const stats = [
    {
      label: "SERVICES",
      query: `fetch dt.entity.service
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup id
| summarize Services = count()`,
    },
    {
      label: "HOSTS",
      query: `fetch dt.entity.host
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup id
| summarize Hosts = count()`,
    },
    {
      label: "K8S WORKLOADS",
      query: `fetch dt.entity.cloud_application
| expand tags
| filter contains(lower(tags), "applicationci")
| parse tags, "LD:key ':' LD:value"
| filter contains(lower(key), "applicationci")
| filter lower(value) == lower("${appCI}")
| dedup id
| summarize Workloads = count()`,
    },
    {
      label: "UPSTREAM DEPS",
      query: `smartscapeNodes "SERVICE"
| fieldsAdd idStr = toString(id)
| lookup [
    fetch dt.entity.service
    | expand tags
    | parse tags, "'applicationci:' LD:appci"
    | filter lower(appci) == lower("${appCI}")
    | dedup id
    | fieldsAdd idStr = toString(id)
    | fields idStr
  ], sourceField:idStr, lookupField:idStr, prefix:"app."
| filter isNotNull(\`app.idStr\`)
| traverse calledBy, targetTypes: "SERVICE"
| dedup id
| summarize Upstream = count()`,
    },
    {
      label: "DOWNSTREAM DEPS",
      query: `smartscapeNodes "SERVICE"
| fieldsAdd idStr = toString(id)
| lookup [
    fetch dt.entity.service
    | expand tags
    | parse tags, "'applicationci:' LD:appci"
    | filter lower(appci) == lower("${appCI}")
    | dedup id
    | fieldsAdd idStr = toString(id)
    | fields idStr
  ], sourceField:idStr, lookupField:idStr, prefix:"app."
| filter isNotNull(\`app.idStr\`)
| traverse calls, targetTypes: "SERVICE"
| dedup id
| summarize Downstream = count()`,
    },
    {
      label: "DEPLOYMENTS (7D)",
      query: `fetch events, from:now()-7d
| filter event.kind == "DAVIS_EVENT"
| filter event.type == "CUSTOM_DEPLOYMENT"
| expand affected_entity_tags
| parse affected_entity_tags, "'applicationci:' LD:appci"
| filter isNotNull(appci)
| filter lower(appci) == lower("${appCI}")
| summarize Deploys = count()`,
    },
  ];

  return (
    <Flex flexDirection="column" gap={16} padding={16}>
      <Text textStyle="heading-level-3">Application Context</Text>
      {profileLoading ? (
        <ProgressCircle />
      ) : (
        profileRecords && profileRecords.length > 0 && (
          <DataTable data={profileRecords} />
        )
      )}

      <Text textStyle="heading-level-3">L1 - Full Observability</Text>
      <Grid gridTemplateColumns="repeat(6, 1fr)" gap={12}>
        {stats.map((s) => (
          <StatCard key={s.label} title={s.label} label={s.label} query={s.query} />
        ))}
      </Grid>
    </Flex>
  );
};
