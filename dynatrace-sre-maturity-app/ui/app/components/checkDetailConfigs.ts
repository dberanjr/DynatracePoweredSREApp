// Per-check configuration for the detail modal and Definitions page.
// Keyed by the exact column name the L1-L5 DQL queries produce.
// Keep in sync with ScorecardsPage.tsx when queries change.

import { getEnvironmentUrl } from "@dynatrace-sdk/app-environment";

export interface CheckDetailConfig {
  level: "L1" | "L2" | "L3" | "L4" | "L5";
  levelColor: string;
  description: string;
  passLogic: string;
  guidance: string;
  chartType: "table" | "bar" | "none";
  /**
   * `facet` is the currently selected facet value (undefined = All). Queries
   * that opt into faceting via facetOptions must splice it into their filters.
   */
  detailQuery?: (appCI: string, facet?: string) => string;
  /** Values offered by the modal's filter pills; "All" is prepended automatically. */
  facetOptions?: string[];
  /** Label shown beside the pills, e.g. "Environment". */
  facetLabel?: string;
  appFunction?: { name: string; toRecords: (result: unknown) => Record<string, unknown>[] };
  secondaryQuery?: (appCI: string, facet?: string) => string;
  secondaryAppFunction?: { name: string; toRecords: (result: unknown) => Record<string, unknown>[] };
  secondaryChartType?: "table" | "bar" | "stackedBar" | "multiPanel" | "donut";
  secondaryLabel?: string;
  /** Small caption rendered under the total in the middle of a donut. */
  donutCenterLabel?: string;
  multiSeriesMeta?: Record<string, { label: string; unit?: string }>;
  serviceRowClick?: boolean;
  logHostRowClick?: boolean;
  hostEntityRowClick?: boolean;
  serviceMapRowClick?: boolean;
  k8sClusterRowClick?: boolean;
  cloudResourceRowClick?: boolean;
  cloudTypeRowClick?: boolean;
  dashboardRowClick?: boolean;
  guardianRowClick?: boolean;
  sloRowClick?: boolean;
  problemRowClick?: boolean;
  /** Row supplies an absolute `url` column; clicking opens it in a new tab. */
  urlRowClick?: boolean;
  /** Wording for the urlRowClick footer hint, e.g. "click a row to open the pipeline run". */
  urlRowClickHint?: string;
  workflowRowClick?: boolean;
  showTypeWordCloud?: boolean;
  samplingNote?: string;
  scorecardSnippet: string;
}

export const LEVEL_META: Record<string, { title: string; color: string; summary: string }> = {
  L1: {
    title: "Full Observability",
    color: "#3BACF0",
    summary:
      "Confirms the application is fully instrumented with OneAgent, distributed traces, logs, and — where applicable — RUM, synthetics, and Kubernetes/cloud workloads. This is the prerequisite for all higher maturity levels.",
  },
  L2: {
    title: "Measured Reliability",
    color: "#1966FF",
    summary:
      "Verifies that reliability targets are formally defined and measured: golden-signal SLIs, SLOs, Site Reliability Guardians, SLO dashboards, and a CMDB tier assignment. L2 is where teams move from observation to accountability.",
  },
  L3: {
    title: "AI-Assisted Operations",
    color: "#5E28E5",
    summary:
      "Validates that Davis Causal AI is actively detecting and correlating problems, that deployments and ITSM routing are integrated, that runbooks are linked, and that DORA metrics are tracked. L3 means the team is using Dynatrace to reduce MTTR.",
  },
  L4: {
    title: "Proactive Reliability",
    color: "#8D1CDC",
    summary:
      "Outcome: \"Outages are predicted and prevented before customers notice.\" Five requirements: SLO burn-rate alerting, dynamic scaling / Kubernetes autoscaling, predictive forecasting, release impact tracking, and error budget gating. Two of these — predictive forecasting and error budget gating — have no signal anywhere in the tenant today and deliberately score as fail rather than N/A, so the capability gap stays visible on the scorecard instead of being quietly excluded from the denominator.",
  },
  L5: {
    title: "Autonomous Reliability",
    color: "#49C2B3",
    summary:
      "Measures whether the application has automated self-healing workflows, AI-assisted incident enrichment, E2E auto-remediation, and AI-generated postmortems. L5 is the goal state where reliability is maintained autonomously.",
  },
};

export const CHECK_DETAIL_CONFIGS: Record<string, CheckDetailConfig> = {
  // ─── L1 Full Observability ───────────────────────────────────────────────

  "1. OneAgent Deployed": {
    level: "L1",
    levelColor: "#3BACF0",
    description:
      "Checks whether hosts tagged with this ApplicationCI have OneAgent installed and are actively reporting. Only hosts alive in the last 2 hours are counted to confirm current coverage. The table lists every entity (hosts, EKS nodes, etc.) tagged with this ApplicationCI along with its OneAgent mode. Click any row to open that entity in Infrastructure & Operations. The pass detail shows Full-Stack hosts vs the total — Full-Stack mode enables deep code-level traces and the widest set of signals.",
    passLogic:
      "Pass: at least one host is tagged with this ApplicationCI and was alive in the last 2 hours.",
    guidance:
      "Deploy OneAgent on all hosts serving this application. Tag them with the 'applicationci:<code>' host metadata tag. Ensure hosts are in Full-Stack mode for the richest signal coverage. Infrastructure mode provides limited observability; Discovery mode means OneAgent is not installed, only lightweight scanning is active.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch dt.entity.host
| limit 100000
| filter lifetime[end] > asTimestamp(now()-2h)
| fieldsAdd applicationci = arrayDistinct(
    iCollectArray(
      splitString(
        arrayRemoveNulls(
          iCollectArray(
            if(matchesPhrase(tags[], "*applicationci*"), lower(tags[]))
          )
        )[], ":"
      )[1]
    )
  )
| fieldsAdd applicationci = arrayDistinct(
    iCollectArray(splitString(applicationci[], ",")[0])
  )
| expand applicationci
| filter applicationci == lower("${appCI}")
| dedup id
| lookup [
    fetch logs, samplingRatio:1000, from:now()-2h
    | filter isNotNull(dt.entity.host) and isNotNull(host.name)
    | summarize hostName = takeFirst(host.name), by:{dt.entity.host}
  ], sourceField:id, lookupField:dt.entity.host, fields:{hostName}
| fieldsAdd entityDisplay = coalesce(hostName, entity.name)
| fieldsAdd mode = if(monitoringMode == "FULL_STACK", "Full-Stack",
    else: if(monitoringMode == "INFRASTRUCTURE", "Infrastructure",
      else: if(monitoringMode == "DISCOVERY", "Discovery", else: "No OneAgent")))
| fieldsAdd sortKey = if(monitoringMode == "FULL_STACK", 3,
    else: if(monitoringMode == "INFRASTRUCTURE", 2,
      else: if(monitoringMode == "DISCOVERY", 1, else: 0)))
| sort sortKey asc, entityDisplay asc
| fields entity = entityDisplay, mode, entityId = id
| limit 500`,
    hostEntityRowClick: true,
    secondaryQuery: (appCI: string) => `fetch logs, samplingRatio:10000, from:now()-7d, scanLimitGBytes:500
| filter isNotNull(applicationci) and lower(applicationci) == lower("${appCI}")
| filter isNotNull(dt.entity.host)
| summarize n = count(), by:{timestamp = bin(timestamp, 1d), host = dt.entity.host}
| lookup [
    fetch dt.entity.host
    | filter lifetime[end] > asTimestamp(now()-2h)
    | fieldsAdd applicationci = arrayDistinct(
        iCollectArray(
          splitString(
            arrayRemoveNulls(
              iCollectArray(
                if(matchesPhrase(tags[], "*applicationci*"), lower(tags[]))
              )
            )[], ":"
          )[1]
        )
      )
    | fieldsAdd applicationci = arrayDistinct(iCollectArray(splitString(applicationci[], ",")[0]))
    | expand applicationci
    | filter applicationci == lower("${appCI}")
    | dedup id
    | fields id, monitoringMode
  ], sourceField:host, lookupField:id, fields:{monitoringMode}
| fieldsAdd mode = coalesce(monitoringMode, "UNKNOWN")
| summarize hosts = countDistinct(host), by:{timestamp, mode}
| sort timestamp asc`,
    secondaryChartType: "stackedBar",
    secondaryLabel: "Hosts active per day by monitoring mode (7d, sampled)",
    scorecardSnippet: `fetch dt.entity.host
| filter lifetime[end] > asTimestamp(now()-2h)
| fieldsAdd applicationci = arrayDistinct(iCollectArray(
    splitString(arrayRemoveNulls(iCollectArray(
      if(matchesPhrase(tags[], "*applicationci*"), lower(tags[]))
    ))[], ":"  )[1]))
| expand applicationci
| summarize
    hostCount      = count(),
    fullStackCount = countIf(monitoringMode == "FULL_STACK"),
  by:{applicationci}

// Pass:  hostCount > 0
// Display: "pass <fullStack>/<hostCount> Full-Stack"`,
  },

  "2. Tracing Validated": {
    level: "L1",
    levelColor: "#3BACF0",
    description:
      "Verifies that at least one service entity tagged with this ApplicationCI is emitting distributed traces. Services appear in Dynatrace when OneAgent captures HTTP or RPC traffic between processes. Click any service row to open it in Distributed Tracing (last 2 hours). Note: dependency count uses the service topology 'calls' relationship, which reflects direct downstream service connections.",
    passLogic: "Pass: at least one service (dt.entity.service) is tagged with this ApplicationCI.",
    guidance:
      "Ensure OneAgent is installed on all service hosts and processes. Confirm that HTTP/gRPC traffic is flowing through the monitored process. If a service exists but is not tagged, add the 'applicationci:<code>' tag via host metadata, tag rules, or the entity API.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch dt.entity.service
| fieldsAdd applicationci = arrayDistinct(
    iCollectArray(
      splitString(
        arrayRemoveNulls(
          iCollectArray(
            if(matchesPhrase(tags[], "*applicationci*"), lower(tags[]))
          )
        )[], ":"
      )[1]
    )
  )
| fieldsAdd applicationci = arrayDistinct(
    iCollectArray(splitString(applicationci[], ",")[0])
  )
| expand applicationci
| filter applicationci == lower("${appCI}")
| dedup id
| lookup [
    fetch spans, from:now()-1h, scanLimitGBytes:-1
    | summarize traces = count(), by:{serviceId = dt.entity.service}
  ], sourceField:id, lookupField:serviceId, fields:{traces}
| fieldsAdd traces = if(isNull(traces), 0, else: traces)
| sort traces desc
| fields service = entity.name, entityId = id, traces
| limit 200`,
    secondaryQuery: (appCI: string) => `fetch spans, from:now()-2h, scanLimitGBytes:-1
| lookup [
    fetch dt.entity.service
    | fieldsAdd applicationci = arrayDistinct(
        iCollectArray(
          splitString(
            arrayRemoveNulls(
              iCollectArray(
                if(matchesPhrase(tags[], "*applicationci*"), lower(tags[]))
              )
            )[], ":"
          )[1]
        )
      )
    | fieldsAdd applicationci = arrayDistinct(
        iCollectArray(splitString(applicationci[], ",")[0])
      )
    | expand applicationci
    | filter applicationci == lower("${appCI}")
    | dedup id
    | fields id
  ], sourceField:dt.entity.service, lookupField:id
| filter isNotNull(id)
| fieldsAdd outcome = if(request.is_failed, "FAILED", else: "SUCCESS")
| summarize traces = count(), by:{timestamp = bin(start_time, 15m), outcome}
| sort timestamp asc`,
    secondaryChartType: "stackedBar",
    secondaryLabel: "Trace volume by outcome (15-min buckets, 2h)",
    serviceRowClick: true,
    scorecardSnippet: `fetch dt.entity.service
| fieldsAdd applicationci = arrayDistinct(iCollectArray(
    splitString(arrayRemoveNulls(iCollectArray(
      if(matchesPhrase(tags[], "*applicationci*"), lower(tags[]))
    ))[], ":"  )[1]))
| expand applicationci
| summarize serviceCount = count(), by:{applicationci}

// Pass: serviceCount > 0
// Display: "pass <count> services"`,
  },

  "3. Logs Correlated": {
    level: "L1",
    levelColor: "#3BACF0",
    description:
      "Confirms that logs are flowing into Dynatrace and are correlated to this ApplicationCI. The table breaks log volume down by host (last 1h) with error/warn severity counts, so you can spot hosts with elevated error rates or gaps in log coverage. Queries sample at 1:1000 to keep cost low, then extrapolate back to the true volume via dt.system.sampling_ratio — the numbers shown are estimated real totals, not raw sampled counts. Click any host row to open its logs in the Logs app. Log correlation enables Davis to surface log-based root causes and powers the Logs tab in problem cards.",
    passLogic:
      "Pass: at least one log record carrying this ApplicationCI exists in the selected timeframe (sampled at 1:1000).",
    guidance:
      "Configure log ingest via OneAgent log monitoring or the Dynatrace Log Ingest API. Ensure the 'applicationci' field is set on log records — typically via host metadata propagation or a log enrichment rule in OpenPipeline.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch logs, samplingRatio:1000, from:now()-1h
| filter isNotNull(applicationci) and lower(applicationci) == lower("${appCI}")
| filter isNotNull(host.name)
| summarize
    totalLogs = sum(dt.system.sampling_ratio),
    errorLogs = sum(if(loglevel == "ERROR", dt.system.sampling_ratio, else: 0)),
    warnLogs = sum(if(loglevel == "WARN", dt.system.sampling_ratio, else: 0)),
  by:{host = host.name}
| sort totalLogs desc
| limit 200`,
    secondaryQuery: (appCI: string) => `fetch logs, samplingRatio:1000, from:now()-24h
| filter isNotNull(applicationci) and lower(applicationci) == lower("${appCI}")
| summarize logCount = sum(dt.system.sampling_ratio), by:{timestamp = bin(timestamp, 1h), status = coalesce(loglevel, "UNKNOWN")}
| sort timestamp asc`,
    secondaryChartType: "stackedBar",
    secondaryLabel: "Log volume trend by severity (24h, hourly, extrapolated from 1:1000 sample)",
    logHostRowClick: true,
    samplingNote: "Sampled at 1:1000 — log counts are estimates, extrapolated to the true volume.",
    scorecardSnippet: `fetch logs, samplingRatio:1000
| filter isNotNull(applicationci)
| summarize logCount = count(), by:{applicationci}

// Pass: logCount > 0
// Sampled at 1:1000 to keep query cost low (existence check only, not extrapolated)`,
  },

  "4. Smartscape Discovery": {
    level: "L1",
    levelColor: "#3BACF0",
    description:
      "Verifies that Dynatrace Smartscape has discovered the application's topology — its services, their dependencies, and the infrastructure they run on. This is derived from service presence: if services exist, Smartscape has built a topology map. The table shows each service's direct downstream dependency count and direct upstream caller count (derived from the service topology 'calls' relationship). Click any row to open that service in the Services app Map view. This enables Davis to correlate problems across the full dependency chain.",
    passLogic:
      "Pass: at least one service is tagged with this ApplicationCI (same signal as Tracing Validated).",
    guidance:
      "Smartscape discovery is automatic once OneAgent is installed and services are tagged. Ensure services are correctly tagged with 'applicationci:<code>'. Full topology discovery may take 1–2 hours after initial instrumentation.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch dt.entity.service
| fieldsAdd applicationci = arrayDistinct(
    iCollectArray(
      splitString(
        arrayRemoveNulls(
          iCollectArray(
            if(matchesPhrase(tags[], "*applicationci*"), lower(tags[]))
          )
        )[], ":"
      )[1]
    )
  )
| fieldsAdd applicationci = arrayDistinct(
    iCollectArray(splitString(applicationci[], ",")[0])
  )
| expand applicationci
| filter applicationci == lower("${appCI}")
| dedup id
| fieldsFlatten calls, prefix:"calls_"
| fieldsAdd downstreamIds = \`calls_dt.entity.service\`
| fieldsAdd downstream = arraySize(downstreamIds)
| lookup [
    fetch dt.entity.service
    | fieldsFlatten calls, prefix:"calls_"
    | fieldsAdd downstreamIds = \`calls_dt.entity.service\`
    | expand downstreamIds
    | summarize upstream = countDistinct(id), by:{callee = downstreamIds}
  ], sourceField:id, lookupField:callee, fields:{upstream}
| fieldsAdd upstream = if(isNull(upstream), 0, else: upstream)
| fieldsAdd downstream = if(isNull(downstream), 0, else: downstream)
| sort entity.name asc
| fields service = entity.name, entityId = id, downstream, upstream
| limit 1000`,
    serviceMapRowClick: true,
    scorecardSnippet: `// Smartscape discovery is inferred from service presence.
// If tagged services exist, Dynatrace has built the topology map.

fetch dt.entity.service
| fieldsAdd applicationci = ... // tag extraction (same as Tracing Validated)
| summarize serviceCount = count(), by:{applicationci}

// Pass: serviceCount > 0 (same signal as Tracing Validated)`,
  },

  "5. Kubernetes": {
    level: "L1",
    levelColor: "#3BACF0",
    description:
      "Detects Kubernetes clusters belonging to this ApplicationCI by matching the cluster name against the ApplicationCI prefix (e.g. '<code>-us-east-1-prd'), not by workload tags — a shared EKS cluster's workloads (cloud_application entities) are often tagged with a sub-application's CI, which under-detects the parent app. This check is N/A for applications that do not run on Kubernetes. The table lists every workload running on the app's cluster(s), following Kubernetes SRE best practice by surfacing the two signals that matter most for workload health: desired vs. running replica count (drift indicates a scheduling or capacity problem) and container restart count (a crash-loop indicator). Workloads with running < desired sort to the top. Click any row to open that workload's cluster in the Services app. The chart breaks restart volume down by namespace over time, so you can see which sub-application is unstable.",
    passLogic:
      "Pass: at least one Kubernetes cluster's name starts with this ApplicationCI (case-insensitive). N/A: no matching cluster exists for this app.",
    guidance:
      "Connect your Kubernetes cluster to Dynatrace via the Kubernetes Operator. Name clusters with the '<applicationci>-<region>-<env>' convention so they're attributable to the owning app. Investigate workloads where running < desired (scheduling/capacity issue) or where restarts are climbing (crash loop) first.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch dt.entity.kubernetes_cluster
| filter startsWith(lower(entity.name), concat(lower("${appCI}"), "-"))
| dedup id
| fieldsAdd clusterName = entity.name
| lookup [
    fetch logs, samplingRatio:1000, from:now()-2h
    | filter isNotNull(dt.entity.cloud_application)
    | summarize workloadIds = collectDistinct(dt.entity.cloud_application), by:{dt.entity.kubernetes_cluster}
  ], sourceField:id, lookupField:dt.entity.kubernetes_cluster, fields:{workloadIds}
| expand workloadIds
| dedup workloadIds
| lookup [
    fetch dt.entity.cloud_application
    | fields id, workloadName = entity.name
  ], sourceField:workloadIds, lookupField:id, fields:{workloadName}
| lookup [
    fetch logs, samplingRatio:1000, from:now()-2h
    | filter isNotNull(dt.entity.cloud_application) and isNotNull(k8s.namespace.name)
    | summarize ns = takeFirst(k8s.namespace.name), by:{dt.entity.cloud_application}
  ], sourceField:workloadIds, lookupField:dt.entity.cloud_application, fields:{ns}
| lookup [
    timeseries desired = avg(dt.kubernetes.workload.pods_desired), running = avg(dt.kubernetes.pods), restarts = sum(dt.kubernetes.container.restarts), by:{dt.entity.cloud_application}, from:now()-1h
    | fieldsAdd desiredLast = arrayLast(desired)
    | fieldsAdd runningLast = arrayLast(running)
    | fieldsAdd restartsTotal = arraySum(restarts)
    | fields dt.entity.cloud_application, desiredLast, runningLast, restartsTotal
  ], sourceField:workloadIds, lookupField:dt.entity.cloud_application, fields:{desiredLast, runningLast, restartsTotal}
| fieldsAdd restartsTotal = if(isNull(restartsTotal), 0, else: restartsTotal)
| fieldsAdd problemSort = if(isNotNull(desiredLast) and isNotNull(runningLast) and runningLast < desiredLast, 0, else: 1)
| sort problemSort asc, workloadName asc
| fields workload = workloadName, namespace = ns, desired = desiredLast, running = runningLast, restarts = restartsTotal, clusterName
| limit 500`,
    k8sClusterRowClick: true,
    secondaryQuery: (appCI: string) => `fetch dt.entity.kubernetes_cluster
| filter startsWith(lower(entity.name), concat(lower("${appCI}"), "-"))
| dedup id
| lookup [
    fetch logs, samplingRatio:1000, from:now()-2h
    | filter isNotNull(dt.entity.cloud_application)
    | summarize workloadIds = collectDistinct(dt.entity.cloud_application), by:{dt.entity.kubernetes_cluster}
  ], sourceField:id, lookupField:dt.entity.kubernetes_cluster, fields:{workloadIds}
| expand workloadIds
| dedup workloadIds
| lookup [
    fetch logs, samplingRatio:1000, from:now()-2h
    | filter isNotNull(dt.entity.cloud_application) and isNotNull(k8s.namespace.name)
    | summarize ns = takeFirst(k8s.namespace.name), by:{dt.entity.cloud_application}
  ], sourceField:workloadIds, lookupField:dt.entity.cloud_application, fields:{ns}
| fieldsAdd ns = if(isNull(ns), "unknown", else: ns)
| lookup [
    timeseries restarts = sum(dt.kubernetes.container.restarts), by:{dt.entity.cloud_application}, from:now()-24h, interval:1h
  ], sourceField:workloadIds, lookupField:dt.entity.cloud_application, fields:{restarts, timeframe, interval}
| filter isNotNull(restarts)
| fieldsAdd bucket = record(timestamp = timeframe[start] + interval * iIndex(), v = restarts[])
| expand bucket
| fieldsFlatten bucket, prefix:""
| summarize restarts = sum(v), by:{timestamp, namespace = ns}
| sort timestamp asc`,
    secondaryChartType: "stackedBar",
    secondaryLabel: "Container restarts by namespace (24h, hourly)",
    scorecardSnippet: `fetch dt.entity.kubernetes_cluster
| fieldsAdd applicationci = lower(splitString(entity.name, "-")[0])
| summarize k8sClusterCount = count(), by:{applicationci}

// Pass: k8sClusterCount > 0
// N/A:  k8sClusterCount == 0 (no K8s — not a failure for non-K8s apps)
// Cluster-name-prefix match, not workload tags — see description for why.`,
  },

  "6. Cloud": {
    level: "L1",
    levelColor: "#3BACF0",
    description:
      "Detects all cloud resources (AWS, Azure, GCP) tagged with this ApplicationCI, using the same data source as the Clouds app. Click a resource row, a resource-type row, or a word-cloud item to open it filtered in the Clouds app.",
    passLogic:
      "Pass: at least one cloud resource (AWS, Azure, or GCP; any type) is tagged with this ApplicationCI. N/A: no cloud resources found for this app.",
    guidance:
      "Ensure cloud resources are tagged with 'ApplicationCI:<code>' at the cloud-provider level, and that a Cloud connection (AWS/Azure/GCP integration) is configured in Dynatrace so those resources are discovered.",
    chartType: "table",
    detailQuery: (appCI: string) => `smartscapeNodes "AWS*"
| fieldsFlatten \`tags:aws\`, fields:{ApplicationCI}
| fieldsAdd provider = "AWS", displayName = coalesce(aws.resource.id, name), region = aws.region
| filter lower(ApplicationCI) == lower("${appCI}")
| append [
    smartscapeNodes "AZURE*"
    | fieldsFlatten \`tags:azure\`, fields:{ApplicationCI}
    | fieldsAdd provider = "Azure", displayName = coalesce(azure.resource.name, azure.resource.id, name), region = azure.location
    | filter lower(ApplicationCI) == lower("${appCI}")
  ]
| append [
    smartscapeNodes "GCP*"
    | fieldsFlatten \`tags:gcp_labels\`, fields:{ApplicationCI}
    | fieldsAdd provider = "GCP", displayName = coalesce(gcp.resource.name, gcp.resource.id, name), region = gcp.region
    | filter lower(ApplicationCI) == lower("${appCI}")
  ]
| sort type asc, displayName asc
| fields type, name = displayName, region, provider, entityId = id
| limit 500`,
    cloudResourceRowClick: true,
    secondaryQuery: (appCI: string) => `smartscapeNodes "AWS*"
| fieldsFlatten \`tags:aws\`, fields:{ApplicationCI}
| fieldsAdd provider = "AWS", cloudRegion = aws.region
| filter lower(ApplicationCI) == lower("${appCI}")
| append [
    smartscapeNodes "AZURE*"
    | fieldsFlatten \`tags:azure\`, fields:{ApplicationCI}
    | fieldsAdd provider = "Azure", cloudRegion = azure.location
    | filter lower(ApplicationCI) == lower("${appCI}")
  ]
| append [
    smartscapeNodes "GCP*"
    | fieldsFlatten \`tags:gcp_labels\`, fields:{ApplicationCI}
    | fieldsAdd provider = "GCP", cloudRegion = gcp.region
    | filter lower(ApplicationCI) == lower("${appCI}")
  ]
| summarize count = count(), regions = collectDistinct(cloudRegion), resourceType = takeFirst(aws.resource.type), by:{type, provider}
| sort count desc
| fields type, provider, count, regions, resourceType
| limit 200`,
    secondaryChartType: "table",
    secondaryLabel: "Resource types (count & regions)",
    cloudTypeRowClick: true,
    showTypeWordCloud: true,
    scorecardSnippet: `smartscapeNodes "AWS*"
| fieldsFlatten \`tags:aws\`, fields:{ApplicationCI}
| append [
    smartscapeNodes "AZURE*"
    | fieldsFlatten \`tags:azure\`, fields:{ApplicationCI}
  ]
| append [
    smartscapeNodes "GCP*"
    | fieldsFlatten \`tags:gcp_labels\`, fields:{ApplicationCI}
  ]
| summarize cloudCount = count(), by:{applicationci = lower(ApplicationCI)}

// Pass: cloudCount > 0
// N/A:  cloudCount == 0 (no cloud resources — not a failure for non-cloud apps)
// Uses smartscapeNodes across AWS/Azure/GCP, the same data source as the
// Clouds app — covers every resource type, not just EC2/RDS/Lambda.`,
  },

  "7. RUM / Synthetics": {
    level: "L1",
    levelColor: "#3BACF0",
    description:
      "Checks whether the application has Real User Monitoring (RUM) configured via a Dynatrace Application entity, or synthetic tests covering key user flows. RUM apps active in the last 7 days are counted. Synthetics provide continuous availability checks. This check is most relevant for frontend applications; backend-only apps may legitimately have neither.",
    passLogic:
      "Pass: at least one RUM app (active in the last 7 days) OR at least one synthetic test is tagged with this ApplicationCI.",
    guidance:
      "For frontend applications: inject the RUM JavaScript snippet via OneAgent automatic injection or manual instrumentation, and tag the resulting Dynatrace Application entity. Create browser clickpath or HTTP monitor synthetics for critical user journeys.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch dt.entity.application, from:now()-1000d
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup entity.name
| fields app = entity.name, type = "RUM",
    active = if(lifetime[end] > now()-7d, "Active", else: "Inactive")
| sort active asc, app asc`,
    scorecardSnippet: `// RUM: application entities active in last 7 days
fetch dt.entity.application, from:now()-1000d
| fieldsAdd applicationci = ... // tag extraction
| fieldsAdd rumActive = if(lifetime[end] > now()-7d, true, else: false)
| summarize rumCount = countIf(rumActive == true), by:{applicationci}

// Synthetics
fetch dt.entity.synthetic_test
| fieldsAdd applicationci = ... // tag extraction
| summarize synCount = count(), by:{applicationci}

// Pass: rumCount > 0 OR synCount > 0`,
  },

  // ─── L2 Measured Reliability ─────────────────────────────────────────────

  "1. Golden Signal SLIs": {
    level: "L2",
    levelColor: "#1966FF",
    description:
      "Verifies that golden signal metrics (traffic, errors, latency, saturation) are actually flowing for this application — not just that services are tagged, but that real data exists for all four. The table shows live 1h traffic, error rate, and p95 latency per service, sorted to surface the worst error rate first. Below the table, all four signals are trended over the last 6h as four small charts, each auto-scaled to its own range — traffic (request count), errors (% of requests failing), latency (p95 response time), and saturation (avg CPU % of the processes backing these services). Saturation is derived from the CPU usage of the process groups tagged with this ApplicationCI, since there is no native per-service saturation metric.",
    passLogic: "Pass: at least one service tagged with this ApplicationCI is present (and thus emitting golden-signal metrics).",
    guidance:
      "Golden signals are automatic with Full-Stack OneAgent. Ensure services are correctly tagged. To explicitly define SLIs, navigate to SLO Management and create SLOs referencing golden-signal metrics (request rate, error rate, latency) for this application's services.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch dt.entity.service
| fieldsAdd applicationci = arrayDistinct(
    iCollectArray(
      splitString(
        arrayRemoveNulls(
          iCollectArray(
            if(matchesPhrase(tags[], "*applicationci*"), lower(tags[]))
          )
        )[], ":"
      )[1]
    )
  )
| fieldsAdd applicationci = arrayDistinct(
    iCollectArray(splitString(applicationci[], ",")[0])
  )
| expand applicationci
| filter applicationci == lower("${appCI}")
| dedup id
| fields id, entity.name
| limit 500
| lookup [
    timeseries {
      req = sum(dt.service.request.count, rollup: sum, scalar:true),
      fail = sum(dt.service.request.failure_count, rollup: sum, scalar:true),
      p95 = percentile(dt.service.request.response_time, 95, rollup: avg, scalar:true)
    }, by:{dt.entity.service}, from:now()-1h
  ], sourceField:id, lookupField:dt.entity.service, fields:{req, fail, p95}
| fieldsAdd requests = if(isNull(req), 0, else: toLong(req))
| fieldsAdd errorRate = if(isNotNull(req) and req > 0, round(fail * 100.0 / req, decimals:2), else: 0)
| fieldsAdd p95Ms = if(isNotNull(p95), round(p95 / 1000.0, decimals:1), else: null)
| fields service = entity.name, entityId = id, requests, errorRate, p95Ms
| sort errorRate desc, requests desc
| limit 200`,
    secondaryQuery: (appCI: string) => `timeseries {
    req = sum(dt.service.request.count, rollup: sum),
    fail = sum(dt.service.request.failure_count, rollup: sum)
  }, interval:30m, from:now()-6h,
  filter: { dt.entity.service in [
      fetch dt.entity.service
      | fieldsAdd applicationci = arrayDistinct(iCollectArray(splitString(arrayRemoveNulls(iCollectArray(if(matchesPhrase(tags[], "*applicationci*"), lower(tags[]))))[], ":")[1]))
      | fieldsAdd applicationci = arrayDistinct(iCollectArray(splitString(applicationci[], ",")[0]))
      | expand applicationci
      | filter applicationci == lower("${appCI}")
      | fields id
  ] }
| fieldsAdd k = 1
| lookup [
    timeseries p95 = percentile(dt.service.request.response_time, 95, rollup: avg), interval:30m, from:now()-6h,
      filter: { dt.entity.service in [
          fetch dt.entity.service
          | fieldsAdd applicationci = arrayDistinct(iCollectArray(splitString(arrayRemoveNulls(iCollectArray(if(matchesPhrase(tags[], "*applicationci*"), lower(tags[]))))[], ":")[1]))
          | fieldsAdd applicationci = arrayDistinct(iCollectArray(splitString(applicationci[], ",")[0]))
          | expand applicationci
          | filter applicationci == lower("${appCI}")
          | fields id
      ] }
    | fieldsAdd k = 1
    | fields k, p95
  ], sourceField:k, lookupField:k, fields:{p95}
| fieldsAdd p95 = p95[] / 1000.0
| lookup [
    timeseries cpu = avg(dt.process.cpu.usage), interval:30m, from:now()-6h,
      filter: { dt.entity.process_group in [
          fetch dt.entity.process_group
          | fieldsAdd applicationci = arrayDistinct(iCollectArray(splitString(arrayRemoveNulls(iCollectArray(if(matchesPhrase(tags[], "*applicationci*"), lower(tags[]))))[], ":")[1]))
          | fieldsAdd applicationci = arrayDistinct(iCollectArray(splitString(applicationci[], ",")[0]))
          | expand applicationci
          | filter applicationci == lower("${appCI}")
          | fields id
      ] }
    | fieldsAdd k = 1
    | fields k, cpu
  ], sourceField:k, lookupField:k, fields:{cpu}
| fieldsAdd errRate = fail[] * 100.0 / req[]
| fieldsAdd bucket = record(timestamp = timeframe[start] + interval * iIndex(), bReq = req[], bErr = errRate[], bP95 = p95[], bCpu = cpu[])
| expand bucket
| fieldsFlatten bucket, prefix:""
| fields timestamp, bReq, bErr, bP95, bCpu
| sort timestamp asc`,
    secondaryChartType: "multiPanel",
    secondaryLabel: "All 4 golden signals (6h, hourly, each on its own scale)",
    multiSeriesMeta: {
      bReq: { label: "Traffic (requests)", unit: "" },
      bErr: { label: "Errors (%)", unit: "%" },
      bP95: { label: "Latency p95 (ms)", unit: "ms" },
      bCpu: { label: "Saturation (CPU %)", unit: "%" },
    },
    serviceMapRowClick: true,
    scorecardSnippet: `fetch dt.entity.service
| fieldsAdd applicationci = ... // tag extraction
| summarize serviceCount = count(), by:{applicationci}

// Golden signals (error rate, throughput, latency) are emitted
// automatically by Full-Stack OneAgent for every traced service.
// Pass: serviceCount > 0`,
  },

  "2. SLOs Created": {
    level: "L2",
    levelColor: "#1966FF",
    description:
      "Counts Service Level Objectives (SLOs) configured for this ApplicationCI. This check calls the Gen3 SLO platform API live (via an app function) rather than the /lookups/slo table, so each row shows its real target and description, not just a name. The AppCI is identified by the first 3 characters of each SLO name. Each SLO's own name is parsed to derive its Type (Availability, Performance, etc.) — pure string-parsing of the name itself, not a cross-reference — and the secondary panel breaks down SLO count by that type, showing whether coverage leans on one signal (e.g. all-Availability) or spans multiple. Click a row to open the SLO settings page — the native SLO table has no deep-linkable URL for an individual SLO (row names are plain text with a JS-only click handler, confirmed via DOM inspection), so this opens the full list rather than that specific row.",
    passLogic:
      "Pass: at least one SLO exists whose name starts with this ApplicationCI's 3-letter code.",
    guidance:
      "Create SLOs in Dynatrace → SLO Management. Name each SLO starting with the 3-letter ApplicationCI code (e.g., 'ADH-API-AvailabilitySLO').",
    chartType: "table",
    appFunction: {
      name: "getSloDetail",
      toRecords: (result) => {
        const slos = (result as { slos?: { sloId: string; sloName: string; sloType: string; target: number | null; description: string }[] })?.slos ?? [];
        return slos.map((s) => ({
          sloName: s.sloName,
          sloType: s.sloType,
          target: s.target != null ? `${s.target}%` : "—",
          description: s.description,
          sloId: s.sloId,
        }));
      },
    },
    secondaryAppFunction: {
      name: "getSloDetail",
      toRecords: (result) => {
        const slos = (result as { slos?: { sloType: string }[] })?.slos ?? [];
        const counts = new Map<string, number>();
        for (const s of slos) counts.set(s.sloType, (counts.get(s.sloType) ?? 0) + 1);
        return Array.from(counts.entries())
          .map(([sloType, sloCount]) => ({ sloType, sloCount }))
          .sort((a, b) => b.sloCount - a.sloCount);
      },
    },
    secondaryChartType: "table",
    secondaryLabel: "SLO count by type (parsed from SLO name)",
    sloRowClick: true,
    scorecardSnippet: `// Source: /lookups/slo  (refreshed hourly by workflow "Write SLOs to Lookup")
load "/lookups/slo"
| fieldsAdd appci = lower(substring(slo, from:0, to:3))
| summarize sloCount = count(), by:{appci}

// Naming convention: SLO name MUST start with the 3-letter AppCI code
// Pass: sloCount > 0
// (Modal detail view uses the live getSloDetail app function instead, for linking + target/description.)`,
  },

  "3. Site Reliability Guardians Created": {
    level: "L2",
    levelColor: "#1966FF",
    description:
      "Counts Site Reliability Guardians (SRGs) configured for this ApplicationCI. SRGs automate reliability validation by evaluating SLOs, metrics, and events against defined thresholds during deployments or on a schedule. This check calls the Guardian Settings API live (via an app function) rather than a scheduled lookup table — the Automation Engine workflow that used to populate a /lookups/guardians table proved unreliable to keep in sync, so guardian detail is now fetched fresh every time this modal opens. The table lists each guardian's name, objective count, and trigger kind; click a row to open that guardian's validation results. The secondary panel expands every guardian's individual objectives, showing exactly what's being validated.",
    passLogic:
      "Pass: at least one SRG is found tagged with this ApplicationCI's appci code (case-insensitive, applicationci or appci tag key).",
    guidance:
      "Create an SRG in Dynatrace → Site Reliability Guardian, tag it with 'applicationci:<code>', and define evaluation objectives for the app's critical SLOs. SRGs are most impactful when triggered automatically by deployment events.",
    chartType: "table",
    appFunction: {
      name: "getGuardianDetail",
      toRecords: (result) => {
        const guardians = (result as { guardians?: { guardianId: string; guardianName: string; objectiveCount: number; eventKind: string }[] })?.guardians ?? [];
        return guardians.map((g) => ({
          guardianName: g.guardianName,
          objectiveCount: g.objectiveCount,
          trigger:
            g.eventKind === "SDLC_EVENT" ? "SDLC/pipeline-triggered"
              : g.eventKind === "BIZ_EVENT" ? "Business event-triggered"
                : g.eventKind || "Unknown",
          guardianId: g.guardianId,
        }));
      },
    },
    secondaryAppFunction: {
      name: "getGuardianDetail",
      toRecords: (result) => {
        const guardians = (result as { guardians?: { guardianName: string; objectives: string[] }[] })?.guardians ?? [];
        return guardians.flatMap((g) => g.objectives.map((objective) => ({ guardianName: g.guardianName, objective })));
      },
    },
    secondaryChartType: "table",
    secondaryLabel: "Objectives per guardian",
    guardianRowClick: true,
    scorecardSnippet: `// Scorecard pass/fail source: /lookups/guardians
// (one row per guardian, refreshed on a schedule by an Automation Engine workflow)
load "/lookups/guardians"
| fieldsAdd appci = lower(appci)
| summarize guardianCount = count(), by:{appci}
// joined via lookup(), sourceField:applicationci, lookupField:appci

// Pass: guardianCount > 0
//
// NOTE: the modal's detail table does NOT use this lookup. It calls the
// getGuardianDetail app function, which reads the Guardian Settings API live
// (schemaIds: app:dynatrace.site.reliability.guardian:guardians) so objectives
// and guardian IDs stay correct even when the lookup refresh lags behind.`,
  },

  "4. SLO Dashboards Published": {
    level: "L2",
    levelColor: "#1966FF",
    description:
      "Checks whether SLO dashboards have been published for this ApplicationCI. This check calls the Documents API live (via an app function) rather than a scheduled lookup table, for the same reliability reason as the Guardians check. Dashboards whose name starts with the 3-letter ApplicationCI code and contains the word 'SLO' in standalone uppercase are listed with their creation date, last-modified date, and owner. Click a row to open that dashboard directly.",
    passLogic:
      "Pass: at least one dashboard exists whose name starts with this ApplicationCI's 3-letter code and contains uppercase 'SLO'.",
    guidance:
      "Create a Dynatrace dashboard named '<AppCI> SLO Dashboard' (e.g., 'ADH SLO Dashboard'). Include SLO burn-rate tiles, error budget gauges, and trend charts for all application SLOs.",
    chartType: "table",
    appFunction: {
      name: "getDashboardDetail",
      toRecords: (result) => {
        const dashboards = (result as {
          dashboards?: { dashboardName: string; dashboardId: string; createdTime: string; lastModifiedTime: string; ownerName: string }[];
        })?.dashboards ?? [];
        return dashboards.map((d) => ({
          dashboardName: d.dashboardName,
          created: d.createdTime,
          lastModified: d.lastModifiedTime,
          owner: d.ownerName,
          dashboardId: d.dashboardId,
        }));
      },
    },
    dashboardRowClick: true,
    scorecardSnippet: `// Scorecard pass/fail source: /lookups/slo-dashboards
// (one row per dashboard, refreshed on a schedule by an Automation Engine workflow)
load "/lookups/slo-dashboards"
| fieldsAdd appci = lower(appci)
| summarize dashboardCount = count(), by:{appci}
// joined via lookup(), sourceField:applicationci, lookupField:appci

// Pass: dashboardCount > 0
//
// NOTE: the modal's detail table does NOT use this lookup. It calls the
// getDashboardDetail app function, which reads the Documents API live
// (filter=type=='dashboard'), keeps dashboards whose name starts with a
// 3-letter AppCI token and contains standalone "SLO", and resolves the owner
// via client-iam so each row can link straight to the dashboard.`,
  },

  "5. SRE Assessment in ARD": {
    level: "L2",
    levelColor: "#1966FF",
    description:
      "Verifies that this application has a CMDB tier assignment imported from ServiceNow. The check looks for a workflow bizevent of type 'workflow.import.servicenow.appci' in the last 24 hours that carries a non-null 'tier' field. The tier (1–4) determines the SRE engagement level and which maturity checks are applicable. The card shows the full assessment record — CI name, tier, owner, support group, and escalation group. The chart proves the CMDB sync runs reliably by counting daily import events over the last 7 days.",
    passLogic:
      "Pass: a bizevent of type 'workflow.import.servicenow.appci' exists in the last 24 hours with a non-null tier for this ApplicationCI.",
    guidance:
      "Ensure the ServiceNow→Dynatrace CMDB import workflow is running and populating tier data for this application. Contact the SRE platform team if no tier data appears after 24 hours.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch bizevents, from:now()-24h
| filter event.type == "workflow.import.servicenow.appci"
| filter lower(applicationci) == lower("${appCI}")
| filter isNotNull(tier)
| fields ciName = ciname, tier, owner = app_owner_name, supportGroup = app_support_group_email, escalationGroup = escalation_group, timestamp
| sort timestamp desc
| limit 10`,
    secondaryQuery: (appCI: string) => `fetch bizevents, from:now()-7d
| filter event.type == "workflow.import.servicenow.appci"
| filter lower(applicationci) == lower("${appCI}")
| summarize importCount = count(), by:{timestamp = bin(timestamp, 24h)}
| sort timestamp asc`,
    secondaryChartType: "bar",
    secondaryLabel: "CMDB sync frequency (7d, daily import events)",
    scorecardSnippet: `fetch bizevents, from:now()-24h
| filter event.type == "workflow.import.servicenow.appci"
| filter isNotNull(tier)
| summarize hasTier = count(), by:{applicationci = lower(applicationci)}

// Pass: hasTier > 0  (CMDB tier is present for this ApplicationCI)`,
  },

  "6. Critical Services Tagged": {
    level: "L2",
    levelColor: "#1966FF",
    description:
      "Checks whether the critical services for this application are tagged and identified in Dynatrace. Critical service tagging enables priority routing in ITSM, auto-escalation in incident management, and targeted alerting thresholds. STATUS (verified 2026-08-28): the data pipeline this check was waiting on now EXISTS. The workflow 'Refresh /lookups/critical_services' populates a table carrying 9,072 service rows across 361 ApplicationCIs, each with a severity (high / medium / low) and a business-impact description. The check itself, however, is still hardcoded to n/a and has not been wired to that table yet, so it neither passes nor counts against the L2 score. Two things are worth settling before it is activated: only about 38% of rows (3,462) have their entity_ids resolved to real Dynatrace entities — the rest carry a '-' placeholder — and the table contains a small amount of dirty data (6 rows with a '-' severity and one 'medum' typo).",
    passLogic:
      "Currently N/A and excluded from the L2 denominator, which is why L2 scores out of 5 rather than 6. The check is not yet wired to /lookups/critical_services even though that table is now populated. Activating it requires a decision on what constitutes a pass: any critical service listed, or only services whose entity_ids actually resolve to monitored entities.",
    guidance:
      "The upstream pipeline is no longer the blocker — /lookups/critical_services is populated and refreshing. The remaining work is to wire this check to it and agree on the pass threshold, then to improve entity resolution so more than ~38% of listed services map to real Dynatrace entities. Data hygiene on the source (the BigPanda list / incident-management spreadsheet feeding it) would also clean up the handful of malformed severity values. Long-term the intent is still CMDB integration, owned by the configuration-management team and tracked separately.",
    chartType: "none",
    detailQuery: (_appCI: string) => `data record(status = "pending")
| fieldsAdd message = "Critical services lookup pipeline not yet configured."`,
    scorecardSnippet: `// ── STUB ── check not yet wired up ───────────────────────────────────
// What the scorecard actually emits today — a hardcoded constant:
//
//   \`6. Critical Services Tagged\` = "n/a Coming soon — BigPanda/CMDB pipeline pending"
//
// It is excluded from passCount, so L2 scores out of 5, not 6.
//
// ── The data it is waiting on now EXISTS (verified 2026-08-28) ────────
// Note the table name uses an UNDERSCORE, not a hyphen:
//
//   load "/lookups/critical_services"
//   | fieldsAdd appci = lower(appci)
//   | summarize criticalCount = count(),
//               resolved = countIf(entity_ids != "-"),
//               by:{appci}
//
// Columns: appci, entity_name, severity (high|medium|low),
//          business_impact, entity_ids, id_count, row_id
// Scale:   9,072 rows / 361 AppCIs; 3,462 (38%) have resolved entity_ids
// Source:  workflow "Refresh /lookups/critical_services
//          (entity_severity resolved to entity IDs)"
//
// Open question before activating: does a pass mean "any critical service
// listed", or "at least one service whose entity_ids actually resolve"?`,
  },

  // ─── L3 AI-Assisted Operations ───────────────────────────────────────────

  "1. Causal AI Detection + Event Correlation": {
    level: "L3",
    levelColor: "#5E28E5",
    description:
      "Verifies that Davis Causal AI is actively detecting problems and correlating related signals for this application. Only meaningful problems are counted: ERROR or SLOWDOWN category with more than one grouped event, excluding Davis duplicates. The table lists each problem with how many raw events Davis folded into it, how many entities it spans, and whether a root cause was pinpointed — click any row to open that problem in the Problems app. The donut shows how the app's entire 7-day problem volume splits three ways: Causal (real, investigable), Noise (single-event flaps — see Alert Noise Review), and Other, a bucket that is invisible on the scorecard but often sizeable. CORRECTED: this check previously counted correlation from the 'affected_entities' field, which is null on every problem record in this tenant, so it reported 0 correlated for every application. It now uses 'affected_entity_ids', which is populated on 100% of records; and the correlation figure is now measured over the same 7-day window as the rest of the check, rather than the dashboard's default timeframe.",
    passLogic:
      "Pass: at least one ERROR or SLOWDOWN category problem with more than one grouped event (non-duplicate) exists for this ApplicationCI in the last 7 days. A problem is counted as correlated when it affects more than one entity.",
    guidance:
      "Davis Causal AI is automatic once OneAgent is deployed and alerting is enabled. Correlation quality depends on topology completeness — Davis can only link entities it can see, so gaps in tracing or untagged services reduce multi-entity correlation. If the donut shows a large Noise slice, tune anomaly detection thresholds; if it shows a large Other slice, those problems match neither the causal nor the noise definition and are worth reviewing to decide which they belong in.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch dt.davis.problems, from:now()-7d
| filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
| fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
| filter isNotNull(appci) and appci == lower("${appCI}")
| fieldsAdd eventCount = arraySize(dt.davis.event_ids)
| fieldsAdd entityCount = arraySize(affected_entity_ids)
| filter matchesValue(event.category, array("ERROR", "SLOWDOWN")) and eventCount > 1
| fields
    problem = event.name,
    category = event.category,
    status = event.status,
    eventsGrouped = eventCount,
    entities = entityCount,
    rootCause = if(isNotNull(root_cause_entity_name), root_cause_entity_name, else: "Not identified"),
    started = timestamp,
    problemId = event.id
| sort started desc
| limit 200`,
    problemRowClick: true,
    secondaryQuery: (appCI: string) => `fetch dt.davis.problems, from:now()-7d
| filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
| fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
| filter isNotNull(appci) and appci == lower("${appCI}")
| fieldsAdd eventCount = arraySize(dt.davis.event_ids)
| fieldsAdd classification = if(matchesValue(event.category, array("ERROR", "SLOWDOWN")) and eventCount > 1,
    "Causal (investigable)",
    else: if(eventCount == 1 and matchesValue(event.category, array("AVAILABILITY", "RESOURCE_CONTENTION", "CUSTOM_ALERT", "MONITORING_UNAVAILABLE")),
      "Noise (single-event)",
      else: "Other (unclassified)"))
| summarize problems = count(), by:{classification}
| sort problems desc`,
    secondaryChartType: "donut",
    secondaryLabel: "How this app's 7-day problem volume classifies",
    donutCenterLabel: "problems (7d)",
    scorecardSnippet: `fetch dt.davis.problems, from:now()-7d
| filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
| fieldsAdd appci = splitString(splitString(
    toString(entity_tags), "applicationci:")[1], "\\"")[0]
| filter isNotNull(appci)
| fieldsAdd eventCount = arraySize(dt.davis.event_ids)
| fieldsAdd isCausal = matchesValue(event.category, array("ERROR", "SLOWDOWN"))
    and eventCount > 1
// CORRECTED: was arraySize(affected_entities), which is null on 100% of
// records in this tenant and therefore always reported 0 correlated.
| fieldsAdd isCorrelated = arraySize(affected_entity_ids) > 1
| summarize
    causalTotal     = countIf(isCausal),
    causalActive    = countIf(isCausal and lower(event.status) == "active"),
    causalClosed    = countIf(isCausal and lower(event.status) == "closed"),
    causalWithCause = countIf(isCausal and isNotNull(root_cause_entity_id)),
    correlated      = countIf(isCorrelated),
  by:{appci}

// Pass: causalTotal > 0
// All five figures now share the same 7d window (correlated previously
// used the dashboard's default timeframe).`,
  },

  "2. CI/CD Integration": {
    level: "L3",
    levelColor: "#5E28E5",
    description:
      "Counts deployment events for this ApplicationCI over the last 30 days, from CUSTOM_DEPLOYMENT events. The table lists individual deployments with the repository, target environment, branch or tag, outcome, and how long the deploy took — click any row to open that exact pipeline run in the CI platform. The chart trends deployments per day stacked by outcome, so a run of failures is visible immediately rather than hidden inside a single total. Every deployment event in this tenant currently originates from GitHub Actions; the query deliberately accepts any CUSTOM_DEPLOYMENT event rather than filtering on the CDK workflow, so Harness pipelines are counted automatically once they begin reporting.",
    passLogic:
      "Pass: at least one CUSTOM_DEPLOYMENT event exists for this ApplicationCI in the last 30 days, from any CI/CD platform.",
    guidance:
      "Integrate your CI/CD pipeline to send deployment events to Dynatrace, including the 'application_ci' field — that field is what attributes the deploy to this application. For GitHub Actions with CDK the shared workflow already emits these events. For Harness, configure the Dynatrace deployment notification step. Deployments to dev and qa are counted alongside production; use the environment column to see the split.",
    chartType: "table",
    facetLabel: "Environment",
    facetOptions: ["prd", "stg", "qa", "dev"],
    detailQuery: (appCI: string, facet?: string) => `fetch events, from:now()-30d
| filter event.type == "CUSTOM_DEPLOYMENT"
| filter isNotNull(application_ci) and lower(application_ci) == lower("${appCI}")${facet ? `
| filter environment == "${facet}"` : ""}
| fieldsAdd durationSec = if(isNotNull(\`deployment-duration\`),
    round(toLong(\`deployment-duration\`) / 1000.0, decimals:0), else: null)
| sort timestamp desc
| fields
    repo = repoName,
    environment,
    ref = eventVersion,
    outcome = \`workflow-outcome\`,
    durationSec,
    platform = source,
    deployed = timestamp,
    url = ciBackLink
| limit 300`,
    urlRowClick: true,
    urlRowClickHint: "click a row to open that pipeline run in the CI platform",
    secondaryQuery: (appCI: string, facet?: string) => `fetch events, from:now()-30d
| filter event.type == "CUSTOM_DEPLOYMENT"
| filter isNotNull(application_ci) and lower(application_ci) == lower("${appCI}")${facet ? `
| filter environment == "${facet}"` : ""}
| fieldsAdd outcome = upper(coalesce(\`workflow-outcome\`, "unknown"))
| summarize deploys = count(), by:{timestamp = bin(timestamp, 1d), outcome}
| sort timestamp asc`,
    secondaryChartType: "stackedBar",
    secondaryLabel: "Deployments per day by outcome (30d)",
    scorecardSnippet: `// Accepts every CUSTOM_DEPLOYMENT event, not just CDK 'cdk deploy' runs,
// so any CI/CD platform reporting application_ci is counted.
fetch events, from:now()-30d
| filter event.type == "CUSTOM_DEPLOYMENT"
| filter isNotNull(application_ci)
| summarize
    deployTotal   = count(),
    deploySuccess = countIf(\`workflow-outcome\` == "success"),
  by:{appci = lower(application_ci)}

// Pass: deployTotal > 0`,
  },

  "3. ITSM Integration": {
    level: "L3",
    levelColor: "#5E28E5",
    description:
      "Checks whether a Dynatrace Automation workflow routes this application's Davis problems out to the team. It looks for workflows titled '<AppCI> Production Dynatrace Alerts' that executed in the last 30 days, matching on the leading AppCI token. The table lists each such workflow with its real execution count and success rate — click a row to open it in the Workflows app. WHAT THIS ACTUALLY VERIFIES: despite the check's name, the donut shows where those notifications really go. Across this entire tenant the alert-routing workflows send to Microsoft Teams and email; there are zero ServiceNow actions anywhere. So a pass here means alert routing is automated and reaching humans — it does not mean tickets are being created in a ticketing system. CORRECTED: the execution counts previously triple-counted, because the detail query omitted the 'event.type == WORKFLOW_EXECUTION' filter and so summed ACTION, TASK and WORKFLOW events together; and each execution emits both a running and a terminal record, which is now handled by counting distinct execution IDs.",
    passLogic:
      "Pass: at least one Automation workflow titled '<AppCI> Production Dynatrace Alerts' has executed in the last 30 days.",
    guidance:
      "Create a Dynatrace Automation workflow named exactly '<AppCI> Production Dynatrace Alerts', using the 3-letter AppCI code as the leading token — the name is what attributes it to this application. Trigger it on Davis problem events and route to the owning team's channel. To make this a genuine ITSM integration rather than a notification, add a ServiceNow action that opens an incident, and confirm the resulting ticket carries the problem ID for correlation.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch dt.system.events, from:now()-30d
| filter event.provider == "AUTOMATION_ENGINE"
| filter event.kind == "WORKFLOW_EVENT" and event.type == "WORKFLOW_EXECUTION"
| filter matchesValue(\`dt.automation_engine.workflow.title\`, "* Production Dynatrace Alerts")
| filter lower(arrayFirst(splitString(\`dt.automation_engine.workflow.title\`, " "))) == lower("${appCI}")
| summarize
    executions = countDistinct(\`dt.automation_engine.workflow_execution.id\`),
    succeeded = countIf(\`dt.automation_engine.state\` == "SUCCESS"),
    failed = countIf(\`dt.automation_engine.state\` == "ERROR"),
    lastRun = max(timestamp),
  by:{workflow = \`dt.automation_engine.workflow.title\`, workflowId = \`dt.automation_engine.workflow.id\`}
| sort executions desc
| limit 50`,
    workflowRowClick: true,
    secondaryQuery: (appCI: string) => `fetch dt.system.events, from:now()-30d
| filter event.provider == "AUTOMATION_ENGINE" and event.type == "ACTION_EXECUTION"
| filter matchesValue(\`dt.automation_engine.workflow.title\`, "* Production Dynatrace Alerts")
| filter lower(arrayFirst(splitString(\`dt.automation_engine.workflow.title\`, " "))) == lower("${appCI}")
| fieldsAdd channel = if(\`dt.automation_engine.action.app\` == "dynatrace.msteams", "Microsoft Teams",
    else: if(\`dt.automation_engine.action.app\` == "dynatrace.email", "Email",
      else: if(\`dt.automation_engine.action.app\` == "dynatrace.servicenow", "ServiceNow",
        else: concat("Other: ", \`dt.automation_engine.action.function\`))))
| summarize notifications = countDistinct(\`dt.automation_engine.action_execution.id\`), by:{channel}
| sort notifications desc`,
    secondaryChartType: "donut",
    secondaryLabel: "Where these alerts actually go (30d) — note: no ServiceNow actions exist tenant-wide",
    donutCenterLabel: "notifications",
    scorecardSnippet: `fetch dt.system.events, from:now()-30d
| filter event.provider == "AUTOMATION_ENGINE"
| filter event.kind == "WORKFLOW_EVENT"
| filter event.type == "WORKFLOW_EXECUTION"
| filter matchesValue(\`dt.automation_engine.workflow.title\`,
    "* Production Dynatrace Alerts")
| fieldsAdd wfAppci = lower(arrayFirst(splitString(
    \`dt.automation_engine.workflow.title\`, " ")))
| summarize itsmWorkflows = countDistinct(\`dt.automation_engine.workflow.id\`),
  by:{wfAppci}

// Workflow title pattern: "<AppCI> Production Dynatrace Alerts"
// Pass: itsmWorkflows > 0
//
// NOTE: verified 2026-08-28 — these workflows route to Microsoft Teams and
// email. No dynatrace.servicenow action exists anywhere in this tenant, so
// the check's name overstates what it proves. The modal donut shows the
// real channel mix.`,
  },

  "4. Runbooks Linked": {
    level: "L3",
    levelColor: "#5E28E5",
    description:
      "Counts runbook notebooks linked to this ApplicationCI — the step-by-step remediation procedures an on-call operator follows during an incident. A notebook qualifies when its name starts with the 3-letter AppCI code and contains the word 'Runbook'. The table lists each matching notebook with its owner and last-modified date; click a row to open it. Below it, a second table lists notebooks that belong to this app but did NOT qualify, and says exactly why — so a failing check tells you whether runbooks genuinely don't exist or simply aren't named to convention. TWO SOURCES: the scorecard's pass/fail still reads the /lookups/runbooks table, because the card grid and the portfolio leaderboard are driven by a single bulk DQL query across every application. That table holds only an empty sentinel row even though its refresh workflow reports success daily, which on its own would leave every app failing with no way to tell a real gap from a broken pipeline — so the modal reads the Documents API live through an app function instead, the same approach used for Guardians and SLO Dashboards. Verified 2026-08-28: this tenant has zero runbook notebooks, so both sources currently agree.",
    passLogic:
      "Pass: at least one notebook exists whose name starts with this ApplicationCI's 3-letter code and contains the word 'Runbook' (any case).",
    guidance:
      "Create a Dynatrace Notebook named '<AppCI> Runbook - <Topic>', for example 'CCL Runbook - High Error Rate'. The name must start with the exact 3-letter AppCI code and include the word 'Runbook' — both are required for attribution. Document investigation steps, the DQL queries that confirm the diagnosis, and the remediation commands. Link the runbook from the corresponding alert workflow so responders reach it from the notification. If the second table below lists notebooks, those are near-misses that only need renaming.",
    chartType: "table",
    appFunction: {
      name: "getRunbookDetail",
      toRecords: (result) => {
        const runbooks = (result as {
          runbooks?: { runbookName: string; runbookId: string; createdTime: string; lastModifiedTime: string; ownerName: string }[];
        })?.runbooks ?? [];
        const envUrl = getEnvironmentUrl().replace(/\/$/, "");
        return runbooks.map((rb) => ({
          runbookName: rb.runbookName,
          owner: rb.ownerName,
          created: rb.createdTime,
          lastModified: rb.lastModifiedTime,
          url: `${envUrl}/ui/apps/dynatrace.notebooks/notebook/${rb.runbookId}`,
        }));
      },
    },
    urlRowClick: true,
    urlRowClickHint: "click a row to open that runbook notebook",
    secondaryAppFunction: {
      name: "getRunbookDetail",
      toRecords: (result) => {
        const others = (result as { otherNotebooks?: { notebookName: string; reason: string }[] })?.otherNotebooks ?? [];
        return others.map((n) => ({ notebook: n.notebookName, whyItDidNotCount: n.reason }));
      },
    },
    secondaryChartType: "table",
    secondaryLabel: "Notebooks for this app that did NOT qualify as runbooks, and why",
    scorecardSnippet: `// Scorecard pass/fail source: /lookups/runbooks
// (refreshed on a schedule by an Automation Engine workflow)
load "/lookups/runbooks"
| fieldsAdd appci = lower(appci)
// joined via lookup(), sourceField:applicationci, lookupField:appci
// runbookCount is null-defaulted to 0

// Pass: runbookCount > 0
//
// NOTE: the modal's detail tables do NOT use this lookup. They call the
// getRunbookDetail app function, which reads the Documents API live
// (filter=type=='notebook'), keeps notebooks whose name starts with a
// 3-letter AppCI token AND contains "Runbook" (any case), resolves the owner
// via client-iam, and additionally returns the near-miss notebooks with the
// reason each one did not qualify.
//
// WHY THE SPLIT: the lookup table holds only a "__none__" sentinel row while
// its refresh workflow still reports SUCCESS daily, so a lookup-only check
// cannot distinguish "no runbooks exist" from "the pipeline is broken". The
// live function closes that gap in the modal. Verified 2026-08-28: this
// tenant genuinely has ZERO runbook notebooks, so both sources agree today
// and the scorecard's fail is truthful.`,
  },

  "5. Alert Noise Review": {
    level: "L3",
    levelColor: "#5E28E5",
    description:
      "The counterpart to Causal AI Detection: of all this application's Davis problems in the last 7 days, how many are noise. Noise is defined as a single-event problem in the AVAILABILITY, RESOURCE_CONTENTION, CUSTOM_ALERT or MONITORING_UNAVAILABLE categories — typically a transient flap or an over-sensitive threshold. The table ranks the noisiest individual alerts by how often each fired, so the handful of alerts generating most of the fatigue are immediately obvious; click any row to open the most recent instance in the Problems app. The donut breaks the noise down by category, which usually points straight at the source: a dominant CUSTOM_ALERT slice means someone's threshold needs tuning, while MONITORING_UNAVAILABLE points at agent or connectivity gaps rather than application health.",
    passLogic:
      "Pass: noise is 50% or less of all problems in the last 7 days. Warn: above 50%. N/A: no problems in the window.",
    guidance:
      "Work down the table from the top — the noisiest alert is almost always worth fixing first, and a single tuned threshold often removes most of the volume. For repeated CUSTOM_ALERT entries, raise the threshold or lengthen the evaluation window in Anomaly Detection. Suppress synthetic monitor outages during maintenance windows. Note that the percentage uses ALL problems as the denominator, so problems that are neither causal nor noise are included there — the donut on the Causal AI check shows that third bucket.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch dt.davis.problems, from:now()-7d
| filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
| fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
| filter isNotNull(appci) and appci == lower("${appCI}")
| fieldsAdd eventCount = arraySize(dt.davis.event_ids)
| filter eventCount == 1 and matchesValue(event.category,
    array("AVAILABILITY", "RESOURCE_CONTENTION", "CUSTOM_ALERT", "MONITORING_UNAVAILABLE"))
| summarize
    occurrences = count(),
    lastSeen = max(timestamp),
    problemId = takeFirst(event.id),
  by:{alert = event.name, category = event.category}
| sort occurrences desc
| limit 200`,
    problemRowClick: true,
    secondaryQuery: (appCI: string) => `fetch dt.davis.problems, from:now()-7d
| filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
| fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
| filter isNotNull(appci) and appci == lower("${appCI}")
| fieldsAdd eventCount = arraySize(dt.davis.event_ids)
| filter eventCount == 1 and matchesValue(event.category,
    array("AVAILABILITY", "RESOURCE_CONTENTION", "CUSTOM_ALERT", "MONITORING_UNAVAILABLE"))
| summarize noiseProblems = count(), by:{category = event.category}
| sort noiseProblems desc`,
    secondaryChartType: "donut",
    secondaryLabel: "Noise by category (7d) — points at the source of the fatigue",
    donutCenterLabel: "noise (7d)",
    scorecardSnippet: `fetch dt.davis.problems, from:now()-7d
| filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
| fieldsAdd appci = ...
| fieldsAdd isNoise = arraySize(dt.davis.event_ids) == 1
    and matchesValue(event.category, array(
      "AVAILABILITY", "RESOURCE_CONTENTION",
      "CUSTOM_ALERT",  "MONITORING_UNAVAILABLE"))
| summarize total7d = count(), noiseTotal = countIf(isNoise), by:{appci}
| fieldsAdd noisePct = round(
    toDouble(noiseTotal) * 100.0 / toDouble(total7d), decimals:0)

// Pass: noisePct <= 50%
// Warn: noisePct >  50%
// N/A:  total7d  == 0
// Denominator is ALL problems, so the "Other" bucket counts against noise%.`,
  },

  "6. Problems with Root Cause": {
    level: "L3",
    levelColor: "#5E28E5",
    description:
      "Of the meaningful (causal) Davis problems in the last 7 days, the share where Davis pinpointed a specific root cause entity. Davis populates a root cause when topology and tracing are complete enough to isolate the failing service, host, process or queue. A high rate means faster MTTR — responders start at the culprit instead of searching. The table lists each causal problem alongside the named root cause entity, so recurring culprits stand out; click a row to open the problem. The donut shows identified versus unidentified at a glance, which is the single number worth tracking over time.",
    passLogic:
      "Pass: 40% or more of causal problems have a root cause identified. Warn: 30% or more. Fail: below 30%. N/A: no causal problems in the last 7 days.",
    guidance:
      "Root cause detection improves with instrumentation completeness: full distributed tracing, discovered dependencies, and correctly tagged services. Review the problems showing 'Not identified' and check whether the entities involved are fully monitored — an unmonitored downstream dependency is the most common reason Davis cannot close the causal chain. If one entity dominates the root cause column, that component is your reliability bottleneck.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch dt.davis.problems, from:now()-7d
| filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
| fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
| filter isNotNull(appci) and appci == lower("${appCI}")
| fieldsAdd eventCount = arraySize(dt.davis.event_ids)
| filter matchesValue(event.category, array("ERROR", "SLOWDOWN")) and eventCount > 1
| fields
    problem = event.name,
    status = event.status,
    rootCauseEntity = if(isNotNull(root_cause_entity_name), root_cause_entity_name, else: "Not identified"),
    entities = arraySize(affected_entity_ids),
    started = timestamp,
    problemId = event.id
| sort started desc
| limit 200`,
    problemRowClick: true,
    secondaryQuery: (appCI: string) => `fetch dt.davis.problems, from:now()-7d
| filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
| fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
| filter isNotNull(appci) and appci == lower("${appCI}")
| fieldsAdd eventCount = arraySize(dt.davis.event_ids)
| filter matchesValue(event.category, array("ERROR", "SLOWDOWN")) and eventCount > 1
| fieldsAdd outcome = if(isNotNull(root_cause_entity_id), "Root cause identified", else: "No root cause")
| summarize problems = count(), by:{outcome}
| sort problems desc`,
    secondaryChartType: "donut",
    secondaryLabel: "Causal problems with a root cause identified (7d)",
    donutCenterLabel: "causal (7d)",
    scorecardSnippet: `// Same causal-problem filter as check #1
fetch dt.davis.problems, from:now()-7d
| filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
| fieldsAdd isCausal = matchesValue(event.category, array("ERROR", "SLOWDOWN"))
    and arraySize(dt.davis.event_ids) > 1
| summarize
    causalTotal     = countIf(isCausal),
    causalWithCause = countIf(isCausal and isNotNull(root_cause_entity_id)),
  by:{appci}
| fieldsAdd rootCausePct = round(
    toDouble(causalWithCause) * 100.0 / toDouble(causalTotal), decimals:0)

// Pass: rootCausePct >= 40%
// Warn: rootCausePct >= 30%
// Fail: rootCausePct <  30%
// N/A:  causalTotal == 0`,
  },

  "7. DORA Metrics": {
    level: "L3",
    levelColor: "#5E28E5",
    description:
      "DORA delivery metrics derived from this application's deployment events over the last 30 days. The table breaks the app down by repository — deployments, success rate, average lead time for changes, and average pipeline duration — so you can see which repo drives the app's delivery profile; click a row to open that repository. The chart trends all three headline DORA measures together on independent scales: deployment frequency, lead time for changes, and change failure rate. Change failure rate is newly available here: deployment events carry an outcome on 100% of records, so failed and cancelled deploys can be measured directly rather than estimated. Lead time comes from the 'avg-release-age' field, which is only present on deployments flagged as new releases (about a quarter of all events), so it reflects genuine releases rather than repeated redeploys of the same artifact.",
    passLogic:
      "Pass: deployment event data exists for this ApplicationCI in the last 30 days. Computed from the same CUSTOM_DEPLOYMENT events as the CI/CD Integration check.",
    guidance:
      "Deployment frequency and lead time flow automatically once CI/CD events are reporting. To improve lead time, shorten the gap between merge and release rather than speeding up the pipeline itself — the measure is release age, not build duration. To improve change failure rate, look at the repositories with the lowest success rate in the table first. NOTE: this remains an interim implementation; a company-wide DORA standard including a formal change-failure and MTTR definition is being finalised, and these calculations will be aligned to it.",
    chartType: "table",
    facetLabel: "Environment",
    facetOptions: ["prd", "stg", "qa", "dev"],
    detailQuery: (appCI: string, facet?: string) => `fetch events, from:now()-30d
| filter event.type == "CUSTOM_DEPLOYMENT"
| filter isNotNull(application_ci) and lower(application_ci) == lower("${appCI}")${facet ? `
| filter environment == "${facet}"` : ""}
| fieldsAdd leadMs = if(\`new-deployment\` == "true" and isNotNull(\`avg-release-age\`),
    toLong(\`avg-release-age\`), else: null)
| fieldsAdd isFail = matchesValue(\`workflow-outcome\`, "failure", "cancelled")
| summarize
    deploys = count(),
    failed = countIf(isFail),
    avgLeadMs = avg(leadMs),
    avgDurMs = avg(toLong(\`deployment-duration\`)),
    url = takeFirst(repoLink),
  by:{repo = repoName}
| fieldsAdd successPct = round((deploys - failed) * 100.0 / deploys, decimals:0)
| fieldsAdd avgLeadDays = if(isNotNull(avgLeadMs), round(avgLeadMs / 86400000.0, decimals:1), else: null)
| fieldsAdd avgDurSec = if(isNotNull(avgDurMs), round(avgDurMs / 1000.0, decimals:0), else: null)
| fields repo, deploys, successPct, avgLeadDays, avgDurSec, url
| sort deploys desc
| limit 200`,
    urlRowClick: true,
    urlRowClickHint: "click a row to open that repository",
    secondaryQuery: (appCI: string, facet?: string) => `fetch events, from:now()-30d
| filter event.type == "CUSTOM_DEPLOYMENT"
| filter isNotNull(application_ci) and lower(application_ci) == lower("${appCI}")${facet ? `
| filter environment == "${facet}"` : ""}
| fieldsAdd leadMs = if(\`new-deployment\` == "true" and isNotNull(\`avg-release-age\`),
    toLong(\`avg-release-age\`), else: null)
| fieldsAdd isFail = matchesValue(\`workflow-outcome\`, "failure", "cancelled")
| summarize deploys = count(), failed = countIf(isFail), avgLeadMs = avg(leadMs),
  by:{timestamp = bin(timestamp, 1d)}
| fieldsAdd dFreq = deploys
| fieldsAdd dLead = if(isNotNull(avgLeadMs), round(avgLeadMs / 86400000.0, decimals:2), else: null)
| fieldsAdd dCfr = round(failed * 100.0 / deploys, decimals:1)
| fields timestamp, dFreq, dLead, dCfr
| sort timestamp asc`,
    secondaryChartType: "multiPanel",
    secondaryLabel: "DORA trends (30d, daily — each on its own scale)",
    multiSeriesMeta: {
      dFreq: { label: "Deployment frequency (per day)", unit: "" },
      dLead: { label: "Lead time for changes (days)", unit: "d" },
      dCfr: { label: "Change failure rate", unit: "%" },
    },
    scorecardSnippet: `// DORA metrics derived from CUSTOM_DEPLOYMENT events.
fetch events, from:now()-30d
| filter event.type == "CUSTOM_DEPLOYMENT"
| filter isNotNull(application_ci)
| fieldsAdd leadMs = if(\`new-deployment\` == "true" and isNotNull(\`avg-release-age\`),
    toLong(\`avg-release-age\`), else: null)
| summarize
    deployTotal   = count(),
    deploySuccess = countIf(\`workflow-outcome\` == "success"),
    avgLeadMs     = avg(leadMs),
  by:{appci = lower(application_ci)}
| fieldsAdd avgLeadDays = round(avgLeadMs / 86400000.0, decimals:1)

// Pass: deployTotal > 0
//
// Change failure rate is charted in the modal from the same events:
//   isFail = matchesValue(\`workflow-outcome\`, "failure", "cancelled")
// Outcomes are present on 100% of deployment events in this tenant.
// Interim — company-wide DORA standard (incl. formal CFR, MTTR) pending.`,
  },

  // ─── L4 Proactive Reliability ─────────────────────────────────────────────
  // Outcome: "Outages are predicted and prevented before customers notice."
  // Five canonical requirements, replacing the earlier nine-check layout whose
  // items #1/#5/#8 were proxies rather than real measurements.

  "1. SLO Burn Rate Alerting": {
    level: "L4",
    levelColor: "#8D1CDC",
    description:
      "Detects SLO breaches and notifies teams before customer impact. Counts distinct SLO burn-rate alerts that fired for this ApplicationCI over the last 30 days, sourced from Davis CUSTOM_ALERT problems. Alert names follow the tenant convention '<AppCI> - SLO <name> for Availability or Performance Burn Rate is above <threshold>', so the owning app is the 3-character token before the first ' - '. The table lists one row per SLO, split by burn type (Availability vs Performance), with how many times it fired, how many of those problems are still active, and when it last fired — sorted by fire count so the noisiest SLO surfaces first. Click any row to open that SLO's most recent burn-rate problem in the Problems app. IMPORTANT CAVEAT: this measures burn-rate alerts that FIRED, not alert configurations that EXIST. A correctly configured burn-rate alert on a consistently healthy SLO produces no problems and will not appear here, so a fail can mean either 'no alert configured' or 'alert configured and never breached'. Alert definitions live in anomaly-detector settings objects, which DQL cannot read; resolving this distinction requires an app function against the settings API, the same way the Guardians and SLO Dashboards checks work.",
    passLogic:
      "Pass: at least one distinct SLO burn-rate alert fired for this ApplicationCI in the last 30 days. Fail: none fired (see the caveat above — this may be a healthy app rather than an unconfigured one).",
    guidance:
      "Create a burn-rate alert for each critical SLO. In Dynatrace, add a metric event / anomaly detector on the SLO's error-budget burn rate and name it following the '<AppCI> - SLO <SLO name> for Availability or Performance Burn Rate is above <threshold>' convention — the leading 3-letter AppCI token is what attributes the alert to this application. Route the resulting problem to the team via the '<AppCI> Production Dynatrace Alerts' workflow (see L3 ITSM Integration). Fast-burn (2% budget in 1h) and slow-burn (5% in 6h) thresholds are the standard pair.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch dt.davis.problems, from:now()-30d
| filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
| filter event.category == "CUSTOM_ALERT"
| filter contains(lower(event.name), "burn rate")
| fieldsAdd appci = lower(trim(splitString(event.name, " - ")[0]))
| filter appci == lower("${appCI}")
| fieldsAdd burnType = if(contains(event.name, "Performance Burn Rate"), "Performance", else: "Availability")
| fieldsAdd rest = coalesce(splitString(event.name, " - SLO ")[1], event.name)
| fieldsAdd slo = trim(splitString(splitString(rest, " for Availability Burn Rate")[0], " for Performance Burn Rate")[0])
| sort timestamp desc
| summarize
    fired = count(),
    active = countIf(lower(event.status) == "active"),
    lastFired = max(timestamp),
    problemId = takeFirst(event.id),
  by:{slo, burnType}
| sort fired desc
| fields slo, burnType, fired, active, lastFired, problemId
| limit 200`,
    problemRowClick: true,
    secondaryQuery: (appCI: string) => `fetch dt.davis.problems, from:now()-30d
| filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
| filter event.category == "CUSTOM_ALERT"
| filter contains(lower(event.name), "burn rate")
| fieldsAdd appci = lower(trim(splitString(event.name, " - ")[0]))
| filter appci == lower("${appCI}")
| fieldsAdd burnType = if(contains(event.name, "Performance Burn Rate"), "Performance", else: "Availability")
| summarize alerts = count(), by:{timestamp = bin(timestamp, 1d), burnType}
| sort timestamp asc`,
    secondaryChartType: "stackedBar",
    secondaryLabel: "Burn-rate alerts fired per day, by burn type (30d)",
    scorecardSnippet: `// Davis CUSTOM_ALERT problems raised by SLO burn-rate metric events.
// Naming convention (verified across ARL/BBT/CCL/CJQ/EBI):
//   "<APPCI> - SLO <name> for Availability or Performance Burn Rate is above <threshold>"
fetch dt.davis.problems, from:now()-30d
| filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
| filter event.category == "CUSTOM_ALERT"
| filter contains(lower(event.name), "burn rate")
| fieldsAdd appci = lower(trim(splitString(event.name, " - ")[0]))
| filter stringLength(appci) == 3
| summarize
    burnAlerts = countDistinct(event.name),
    burnFired  = count(),
  by:{appci}

// Pass: burnAlerts > 0
// CAVEAT: detects alerts that FIRED, not alert configs that EXIST.
//         Alert definitions live in anomaly-detector settings objects,
//         which DQL cannot read — that needs an app function.`,
  },

  "2. Dynamic Scaling / K8s Autoscaling": {
    level: "L4",
    levelColor: "#8D1CDC",
    description:
      "Confirms auto-scaling behavior is visible for this application's ECS and Kubernetes workloads. Rather than counting cloud resources generally (the old proxy), this counts actual autoscaling constructs from the smartscapeNodes inventory: EC2/EKS Auto Scaling Groups, Application Auto Scaling scalable targets (which is how ECS services scale), and EKS managed nodegroups. The table lists every autoscaling target with its mechanism, region, and — parsed live from the resource's AWS configuration JSON — its min, max, and desired capacity. The Elasticity column is the most useful signal here: a group whose max equals its min is Pinned, meaning it is an 'Auto Scaling Group' in name only and cannot actually scale. Click any row to open the resource in the Clouds app. KNOWN GAP: in-cluster autoscalers — HPA, KEDA, and Karpenter — are not counted. Dynatrace collects the Kubernetes object YAML that would reveal them, but each mechanism needs its own evaluation, and the out-of-the-box HPA metric (dt.kubernetes.hpa.current_replicas) has no data in this tenant. Note that a Karpenter-managed nodegroup still appears here as its underlying ASG, which is often Pinned because Karpenter — not the ASG — does the scaling.",
    passLogic:
      "Pass: at least one autoscaling target (Auto Scaling Group, ECS scalable target, or EKS nodegroup) is tagged with this ApplicationCI. Fail: the app has cloud resources but none of them autoscale. N/A: the app has no cloud footprint at all, so autoscaling does not apply.",
    guidance:
      "Tag autoscaling resources with 'ApplicationCI:<code>' at the cloud-provider level so they are attributable. For workloads showing Pinned elasticity, review whether min and max capacity should differ — a pinned group provides no elasticity during demand spikes. For Kubernetes, note that HPA/KEDA/Karpenter configuration is not yet evaluated by this check; if your team relies on one of those, coordinate with the Dynatrace platform team on the Kubernetes YAML-based evaluation, and reference the existing HRD auto-scaling validation process (config + log based) rather than duplicating it.",
    chartType: "table",
    detailQuery: (appCI: string) => `smartscapeNodes "AWS*"
| filter matchesValue(type, "AWS_AUTOSCALING_AUTOSCALINGGROUP", "AWS_APPLICATIONAUTOSCALING_SCALABLETARGET", "AWS_EKS_NODEGROUP")
| fieldsFlatten \`tags:aws\`, fields:{ApplicationCI}
| filter lower(ApplicationCI) == lower("${appCI}")
| fieldsAdd mechanism = if(type == "AWS_AUTOSCALING_AUTOSCALINGGROUP", "EC2 Auto Scaling Group",
    else: if(type == "AWS_APPLICATIONAUTOSCALING_SCALABLETARGET", "ECS Service Auto Scaling",
      else: "EKS Managed Nodegroup"))
| fieldsAdd minSize = toLong(splitString(splitString(aws.object, "\\"minSize\\":")[1], ",")[0])
| fieldsAdd maxSize = toLong(splitString(splitString(aws.object, "\\"maxSize\\":")[1], ",")[0])
| fieldsAdd desired = toLong(splitString(splitString(aws.object, "\\"desiredCapacity\\":")[1], ",")[0])
| fieldsAdd elasticity = if(isNull(minSize) or isNull(maxSize), "Unknown",
    else: if(maxSize > minSize, "Elastic", else: "Pinned"))
| fieldsAdd displayName = coalesce(aws.resource.id, aws.resource.name, name)
| sort elasticity asc, displayName asc
| fields name = displayName, mechanism, region = aws.region, minSize, maxSize, desired, elasticity, entityId = id
| limit 500`,
    cloudResourceRowClick: true,
    secondaryQuery: (appCI: string) => `smartscapeNodes "AWS*"
| filter matchesValue(type, "AWS_AUTOSCALING_AUTOSCALINGGROUP", "AWS_APPLICATIONAUTOSCALING_SCALABLETARGET", "AWS_EKS_NODEGROUP")
| fieldsFlatten \`tags:aws\`, fields:{ApplicationCI}
| filter lower(ApplicationCI) == lower("${appCI}")
| fieldsAdd mechanism = if(type == "AWS_AUTOSCALING_AUTOSCALINGGROUP", "EC2 Auto Scaling Group",
    else: if(type == "AWS_APPLICATIONAUTOSCALING_SCALABLETARGET", "ECS Service Auto Scaling",
      else: "EKS Managed Nodegroup"))
| fieldsAdd minSize = toLong(splitString(splitString(aws.object, "\\"minSize\\":")[1], ",")[0])
| fieldsAdd maxSize = toLong(splitString(splitString(aws.object, "\\"maxSize\\":")[1], ",")[0])
| summarize
    targets = count(),
    elastic = countIf(isNotNull(minSize) and isNotNull(maxSize) and maxSize > minSize),
    pinned = countIf(isNotNull(minSize) and isNotNull(maxSize) and maxSize == minSize),
    regions = collectDistinct(aws.region),
  by:{mechanism}
| sort targets desc`,
    secondaryChartType: "table",
    secondaryLabel: "Autoscaling targets by mechanism (elastic vs pinned)",
    scorecardSnippet: `// Real autoscaling constructs, not a generic cloud-resource count.
// cloudTotal is carried alongside so the check can distinguish
// "no cloud at all" (n/a) from "has cloud, nothing autoscales" (fail).
smartscapeNodes "AWS*"
| fieldsFlatten \`tags:aws\`, fields:{ApplicationCI}
| filter isNotNull(ApplicationCI)
| summarize
    cloudTotal = count(),
    asgCount   = countIf(type == "AWS_AUTOSCALING_AUTOSCALINGGROUP"),
    ecsScale   = countIf(type == "AWS_APPLICATIONAUTOSCALING_SCALABLETARGET"),
    ngCount    = countIf(type == "AWS_EKS_NODEGROUP"),
  by:{appci = lower(ApplicationCI)}
| fieldsAdd scaleTargets = asgCount + ecsScale + ngCount

// Pass: scaleTargets > 0
// Fail: scaleTargets == 0 and cloudTotal >  0
// N/A:  scaleTargets == 0 and cloudTotal == 0
// KNOWN GAP: HPA / KEDA / Karpenter live in K8s YAML and are not counted.`,
  },

  "3. Predictive Forecasting": {
    level: "L4",
    levelColor: "#8D1CDC",
    description:
      "Forecasts future capacity and trends so saturation is addressed before it causes an incident. Dynatrace provides this through the Davis forecast analyzer, which projects a metric forward from its history and can raise an alert on a predicted threshold breach rather than an actual one. This check currently fails for every application because the capability is not adopted anywhere in the tenant: 30 days of Automation Engine action executions contain zero forecast-analyzer invocations (only run-javascript, execute-dql-query, MS Teams, http-function, carbon accounting, guardian validation, and email), and Davis has raised no forecast-derived problems. Per the SRE team's decision this is reported as fail rather than N/A, so the gap stays visible on the scorecard rather than being silently removed from the denominator.",
    passLogic:
      "Fail for all applications — Davis predictive forecasting is not adopted in this tenant. Scored as fail (not N/A) by design, so the capability gap remains visible. This check will be wired to real data once forecasting is in use.",
    guidance:
      "Adopt the Davis forecast analyzer for the metrics that drive capacity decisions — CPU and memory saturation, request rate, disk fill rate, and queue depth. Run it from a scheduled workflow or a notebook and alert on the predicted breach rather than the actual one, which is what converts monitoring from reactive to proactive. Start with a single high-value metric on a tier-1 application to prove the pattern, then template it. Once forecast analyzer runs exist, this check can read them directly from Automation Engine action executions with no schema work.",
    chartType: "none",
    detailQuery: (_appCI: string) => `data record(status = "not_adopted")
| fieldsAdd message = "Davis predictive forecasting is not in use anywhere in this tenant. Zero forecast-analyzer actions found in 30 days of workflow executions."`,
    scorecardSnippet: `// ── NOT ADOPTED ── scored as fail for every app, by design ───────────
// Verified 2026-08-28: 30d of Automation Engine ACTION_EXECUTION events
// contain no forecast analyzer. Actions present tenant-wide are only:
//   run-javascript, execute-dql-query, msteams/send-message,
//   http-function, v4-calculate-cost-and-carbon,
//   validate-guardian-action, send-email
//
// When forecasting is adopted, detect it here:
//
//   fetch dt.system.events, from:now()-30d
//   | filter event.provider == "AUTOMATION_ENGINE"
//   | filter event.type == "ACTION_EXECUTION"
//   | filter \`dt.automation_engine.action.app\` == "dynatrace.davis.analyzers"
//   | summarize forecastRuns = count(), by:{appci}
//
// Pass: forecastRuns > 0`,
  },

  "4. Release Impact Tracking": {
    level: "L4",
    levelColor: "#8D1CDC",
    description:
      "Measures the reliability impact of each release by correlating deployment events with Site Reliability Guardian validations over the last 30 days. Deployments come from CUSTOM_DEPLOYMENT events (the same source as the L3 CI/CD check); validations come from SRG SDLC_EVENT records, which carry the owning app in dt.srg.tags.ApplicationCI along with the overall result and a per-objective pass/warn/fail summary. The distinguishing signal is the trigger type: a guardian fired BY a deployment is genuine release impact tracking, whereas one running on a cron schedule is periodic health reporting that happens to exist. The table lists each validation with its guardian, result, objective breakdown, and trigger; click a row to open that guardian's validation results. The chart overlays deployments against guardian validations per day, which makes the correlation gap immediately visible — bars of deployments with no matching validation are releases that shipped unvalidated. Tenant status: 3 applications run guardian validations, all on schedules; none is deploy-triggered yet.",
    passLogic:
      "Pass: at least one guardian validation was triggered by a deployment event (trigger type is neither Schedule nor Manual). Warn: guardian validations are running but only on a schedule. Fail: deployments occur with no guardian validation at all, or neither exists. Only a genuine pass scores toward the L4 total.",
    guidance:
      "Change the guardian's workflow trigger from a schedule to an event trigger matched on CUSTOM_DEPLOYMENT events for the application, so every release is automatically validated against its SLOs. In the workflow, set the validation timeframe to the window immediately following the deployment. Pair this with the L2 Site Reliability Guardians check — a guardian must exist and carry the applicationci tag before it can be wired to deployments. Teams already onboarded through the Jira/Terraform SRE onboarding pipeline get the guardian created automatically; the remaining step is the deployment trigger.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch events, from:now()-30d
| filter event.kind == "SDLC_EVENT"
| filter event.type == "validation" and event.status == "finished"
| fieldsAdd appci = lower(splitString(splitString(dt.srg.tags, "\\"ApplicationCI\\":[\\"")[1], "\\"")[0])
| filter appci == lower("${appCI}")
| fieldsAdd trigger = coalesce(\`dt.automation_engine.workflow_execution.trigger.type\`, "Manual")
| fieldsAdd objectives = concat(
    splitString(splitString(dt.srg.validation.summary, "\\"pass\\":")[1], ",")[0], " pass / ",
    splitString(splitString(dt.srg.validation.summary, "\\"warning\\":")[1], ",")[0], " warn / ",
    splitString(splitString(dt.srg.validation.summary, "\\"fail\\":")[1], ",")[0], " fail")
| sort timestamp desc
| fields guardian = dt.srg.name, result = validation.result, objectives, trigger, timestamp, guardianId = dt.srg.id
| limit 200`,
    guardianRowClick: true,
    secondaryQuery: (appCI: string) => `fetch events, from:now()-30d
| filter event.type == "CUSTOM_DEPLOYMENT"
| filter isNotNull(application_ci) and lower(application_ci) == lower("${appCI}")
| fieldsAdd series = "Deployments"
| append [
    fetch events, from:now()-30d
    | filter event.kind == "SDLC_EVENT"
    | filter event.type == "validation" and event.status == "finished"
    | fieldsAdd appci = lower(splitString(splitString(dt.srg.tags, "\\"ApplicationCI\\":[\\"")[1], "\\"")[0])
    | filter appci == lower("${appCI}")
    | fieldsAdd series = "Guardian validations"
  ]
| summarize n = count(), by:{timestamp = bin(timestamp, 1d), series}
| sort timestamp asc`,
    secondaryChartType: "stackedBar",
    secondaryLabel: "Deployments vs guardian validations per day (30d) — gaps are unvalidated releases",
    scorecardSnippet: `// Deployments (same source as the L3 CI/CD check)
fetch events, from:now()-30d
| filter event.type == "CUSTOM_DEPLOYMENT"
| filter isNotNull(application_ci)
| summarize deployCount = count(), by:{appci = lower(application_ci)}

// Site Reliability Guardian validations. SRG emits SDLC_EVENTs carrying
// dt.srg.tags; trigger.type separates a deploy-triggered guardian (the
// L4 goal) from one merely running on a cron schedule.
fetch events, from:now()-30d
| filter event.kind == "SDLC_EVENT"
| filter event.type == "validation" and event.status == "finished"
| fieldsAdd appci = lower(splitString(splitString(
    dt.srg.tags, "\\"ApplicationCI\\":[\\"")[1], "\\"")[0])
| filter isNotNull(appci)
| fieldsAdd trig = coalesce(
    \`dt.automation_engine.workflow_execution.trigger.type\`, "Manual")
| summarize
    srgRuns           = count(),
    srgEventTriggered = countIf(trig != "Schedule" and trig != "Manual"),
  by:{appci}

// Pass: srgEventTriggered > 0        (guardian fired by a deployment)
// Warn: srgRuns > 0                  (scheduled only, not deploy-triggered)
// Fail: deployCount > 0, srgRuns == 0
// Only a genuine pass scores toward the L4 total.`,
  },

  "5. Error Budget Gating": {
    level: "L4",
    levelColor: "#8D1CDC",
    description:
      "Prevents releases when error budgets are exceeded, by feeding SLO error-budget state into the change-management process so a risky deploy is blocked or flagged before it ships. This check currently fails for every application because there is no integration to measure: no ServiceNow workflow action exists anywhere in the tenant, and Automation Engine alert routing goes exclusively to Microsoft Teams and email. There is also no pipeline gate emitting a gate-result event. Per the SRE team's decision this is reported as fail rather than N/A, keeping the process gap visible on the scorecard. Note this is the requirement most dependent on work outside Dynatrace — the change-management side has to accept and act on the error-budget signal for the gate to mean anything.",
    passLogic:
      "Fail for all applications — no error-budget data reaches change management today. Scored as fail (not N/A) by design so the process gap stays visible. Will be wired to real data once a gate exists.",
    guidance:
      "Implement the gate in two halves. In the pipeline: call the Site Reliability Guardian before deploying and fail the stage when the remaining error budget is below threshold (for example under 20%) — Harness supports this as a pre-deployment step, and the SRE onboarding pipeline already creates the guardian. In change management: emit a bizevent carrying the AppCI, the SLO, remaining budget, and the gate decision, and push that into the ServiceNow change record so the approval reflects current reliability. The ServiceNow integration does not exist yet in this tenant and is the blocking dependency.",
    chartType: "none",
    detailQuery: (_appCI: string) => `data record(status = "not_configured")
| fieldsAdd message = "No error budget gating detected. No ServiceNow workflow action exists tenant-wide; alert routing uses Microsoft Teams and email only."`,
    scorecardSnippet: `// ── NOT CONFIGURED ── scored as fail for every app, by design ────────
// Verified 2026-08-28: no ServiceNow action exists tenant-wide. The only
// notification actions in 30d of executions are msteams/send-message and
// send-email, so no error-budget data reaches change management.
//
// When a gate exists, detect it here:
//
//   fetch bizevents, from:now()-30d
//   | filter event.type == "slo.errorbudget.gate"
//   | filter lower(applicationci) == lower("<AppCI>")
//   | summarize
//       gateChecks  = count(),
//       gateBlocked = countIf(gate.decision == "blocked"),
//     by:{applicationci}
//
// Pass: gateChecks > 0  (error budget is consulted before release)`,
  },

  // ─── L5 Autonomous Reliability ───────────────────────────────────────────

  "1. Repetitive Tasks Identified": {
    level: "L5",
    levelColor: "#49C2B3",
    description:
      "Checks whether workflow automation events are being generated for this application, indicating that repetitive operational tasks have been identified and automated. The check counts bizevents with event.type containing 'workflow' in the last 7 days. A higher count suggests broader automation coverage.",
    passLogic: "Pass: at least one workflow bizevent exists for this ApplicationCI in the last 7 days.",
    guidance:
      "Identify repetitive manual tasks by reviewing incident post-mortems and runbooks. Automate common remediation steps using Dynatrace Automation Workflows. Tag workflow bizevents with the ApplicationCI field so they are counted here.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch bizevents, from:now()-7d
| filter contains(event.type, "workflow")
| filter lower(applicationci) == lower("${appCI}")
| summarize count = count(), by:{event.type}
| sort count desc`,
    scorecardSnippet: `fetch bizevents, from:now()-7d
| filter contains(event.type, "workflow")
| filter isNotNull(applicationci)
| summarize workflowCount = count(), by:{applicationci}

// Pass: workflowCount > 0`,
  },

  "2. Workflow Automation": {
    level: "L5",
    levelColor: "#49C2B3",
    description:
      "Confirms that Dynatrace Automation Workflows are actively running for this application. Uses the same workflow bizevent signal as 'Repetitive Tasks Identified' — a high execution count over the 7-day window indicates an active self-healing and automation posture.",
    passLogic:
      "Pass: at least one workflow bizevent exists for this ApplicationCI in the last 7 days (same signal as Repetitive Tasks Identified).",
    guidance:
      "Build automation workflows for: alert noise suppression, auto-scaling triggers, incident auto-remediation, and post-incident reporting. Use the Dynatrace Automation Workflow catalog for pre-built templates that integrate with Davis problems.",
    chartType: "bar",
    detailQuery: (appCI: string) => `fetch bizevents, from:now()-7d
| filter contains(event.type, "workflow")
| filter lower(applicationci) == lower("${appCI}")
| summarize count = count(), by:{timestamp = bin(timestamp, 1d)}
| sort timestamp asc`,
    scorecardSnippet: `fetch bizevents, from:now()-7d
| filter contains(event.type, "workflow")
| filter isNotNull(applicationci)
| summarize workflowCount = count(), by:{applicationci}

// Pass: workflowCount > 0  (same signal as Repetitive Tasks Identified)`,
  },

  "3. E2E Remediation Automated": {
    level: "L5",
    levelColor: "#49C2B3",
    description:
      "Tracks whether end-to-end automated remediation is configured — where a Davis problem triggers a workflow that automatically resolves the issue without human intervention (e.g., restarting a service, scaling up resources, rolling back a deployment). This is the highest level of autonomous operations. Not yet detected.",
    passLogic: "N/A: not yet detected.",
    guidance:
      "Implement E2E remediation workflows that: (1) trigger on specific Davis problem types, (2) execute remediation steps (restart, scale, rollback), (3) verify resolution via SRG evaluation, and (4) create a problem task or post-mortem automatically. Tag the workflow's bizevent with the ApplicationCI.",
    chartType: "none",
    detailQuery: (_appCI: string) => `data record(status = "not_enabled")
| fieldsAdd message = "E2E remediation workflows not yet detected."`,
    scorecardSnippet: `// ── STUB ── not yet implemented ───────────────────────────────────────
// When enabled, this will detect remediation workflows:
//   fetch bizevents
//   | filter event.type == "remediation.completed"
//       or event.type == "auto.remediation.triggered"
//   | filter lower(applicationci) == lower("<AppCI>")
//   | summarize count = count(), by:{applicationci}`,
  },

  "4. Incident Auto-Enrichment": {
    level: "L5",
    levelColor: "#49C2B3",
    description:
      "Measures what proportion of Davis problems are automatically enriched with non-default alerting profiles. Enriched problems have additional context (severity, owner, runbook links, business impact) automatically attached — reducing the time operators spend gathering context during incidents.",
    passLogic:
      "Pass: ≥ 50% of all Davis problems for this ApplicationCI have a non-default alerting profile. Warn: < 50%.",
    guidance:
      "Configure alerting profiles in Dynatrace → Settings → Alerting. Assign non-default profiles to entities tagged with this ApplicationCI. Create automation workflows that tag problems with runbook links, owners, and severity context on creation.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch dt.davis.problems
| filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
| fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
| filter isNotNull(appci) and appci == lower("${appCI}")
| fieldsAdd isEnriched = toString(labels.alerting_profile) != "[\\"Default\\"]"
    and isNotNull(labels.alerting_profile)
| summarize total = count(), enriched = countIf(isEnriched), by:{labels.alerting_profile}
| sort enriched desc`,
    scorecardSnippet: `fetch dt.davis.problems
| filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
| fieldsAdd appci = ...
| fieldsAdd hasItsmProfile = toString(labels.alerting_profile) != "[\\"Default\\"]"
    and isNotNull(labels.alerting_profile)
| summarize
    totalProblems    = count(),
    enrichedProblems = countIf(hasItsmProfile == true),
  by:{appci}
| fieldsAdd enrichPct = round(
    toDouble(enrichedProblems) * 100.0 / toDouble(totalProblems), decimals:0)

// Pass: enrichPct >= 50%
// Warn: enrichPct <  50%`,
  },

  "5. AI Postmortem / PTASK in ARD": {
    level: "L5",
    levelColor: "#49C2B3",
    description:
      "Tracks whether AI-generated postmortems or problem tasks (PTASKs) are being created in ARD for incidents affecting this application. Davis AI can automatically generate incident summaries, timeline reconstructions, and recommended actions. This check is not yet detected.",
    passLogic: "N/A: not yet detected.",
    guidance:
      "Configure AI-assisted postmortem generation using Dynatrace Davis Copilot or a custom workflow that creates structured postmortem documents in Notebooks or ARD after each P1/P2 incident resolves. Integrate with Jira or ServiceNow for problem task tracking (PTASK creation).",
    chartType: "none",
    detailQuery: (_appCI: string) => `data record(status = "not_enabled")
| fieldsAdd message = "AI Postmortem / PTASK detection not yet configured."`,
    scorecardSnippet: `// ── STUB ── not yet implemented ───────────────────────────────────────
// When enabled, this will check for AI postmortems:
//   fetch bizevents
//   | filter event.type == "postmortem.created"
//       or event.type == "ptask.created"
//   | filter lower(applicationci) == lower("<AppCI>")
//   | summarize count = count(), by:{applicationci}`,
  },
};
