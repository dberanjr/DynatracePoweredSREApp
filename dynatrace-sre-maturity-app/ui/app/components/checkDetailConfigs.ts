// Per-check configuration for the detail modal and Definitions page.
// Keyed by the exact column name the L1-L5 DQL queries produce.
// Keep in sync with ScorecardsPage.tsx when queries change.

export interface CheckDetailConfig {
  level: "L1" | "L2" | "L3" | "L4" | "L5";
  levelColor: string;
  description: string;
  passLogic: string;
  guidance: string;
  chartType: "table" | "bar" | "none";
  detailQuery: (appCI: string) => string;
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
      "Checks for proactive capacity and scaling visibility: resource saturation alerting, cloud/K8s autoscaling data, deployment event tracking, and the start of error-budget gating. L4 teams act before problems reach production.",
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
      "Checks whether hosts tagged with this ApplicationCI have OneAgent installed and are actively reporting. Only hosts alive in the last 2 hours are counted to confirm current coverage. The pass detail shows Full-Stack hosts vs the total — Full-Stack mode enables deep code-level traces and the widest set of signals.",
    passLogic:
      "Pass: at least one host is tagged with this ApplicationCI and was alive in the last 2 hours.",
    guidance:
      "Deploy OneAgent on all hosts serving this application. Tag them with the 'applicationci:<code>' host metadata tag. Ensure hosts are in Full-Stack mode for the richest signal coverage. Infrastructure mode provides limited observability.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch dt.entity.host
| limit 100000
| filter lifetime[end] > asTimestamp(now()-2h)
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup entity.name
| fields host = entity.name, mode = monitoringMode
| sort host asc`,
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
      "Verifies that at least one service entity tagged with this ApplicationCI is emitting distributed traces. Services appear in Dynatrace when OneAgent captures HTTP or RPC traffic between processes. If no services are found, distributed tracing is not yet active for this application.",
    passLogic: "Pass: at least one service (dt.entity.service) is tagged with this ApplicationCI.",
    guidance:
      "Ensure OneAgent is installed on all service hosts and processes. Confirm that HTTP/gRPC traffic is flowing through the monitored process. If a service exists but is not tagged, add the 'applicationci:<code>' tag via host metadata, tag rules, or the entity API.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch dt.entity.service
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup entity.name
| fields service = entity.name
| sort service asc`,
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
      "Confirms that logs are flowing into Dynatrace and are correlated to this ApplicationCI. The scorecard check samples logs (1 in 1,000 records) within the selected timeframe. Log correlation enables Davis to surface log-based root causes and powers the Logs tab in problem cards.",
    passLogic:
      "Pass: at least one log record carrying this ApplicationCI exists in the selected timeframe (sampled at 1:1000).",
    guidance:
      "Configure log ingest via OneAgent log monitoring or the Dynatrace Log Ingest API. Ensure the 'applicationci' field is set on log records — typically via host metadata propagation or a log enrichment rule in OpenPipeline.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch logs, samplingRatio:1000, from:now()-24h
| filter isNotNull(applicationci) and lower(applicationci) == lower("${appCI}")
| summarize logCount = count(), by:{timestamp = bin(timestamp, 1h)}
| sort timestamp asc`,
    scorecardSnippet: `fetch logs, samplingRatio:1000
| filter isNotNull(applicationci)
| summarize logCount = count(), by:{applicationci}

// Pass: logCount > 0
// Sampled at 1:1000 to keep query cost low`,
  },

  "4. Smartscape Discovery": {
    level: "L1",
    levelColor: "#3BACF0",
    description:
      "Verifies that Dynatrace Smartscape has discovered the application's topology — its services, their dependencies, and the infrastructure they run on. This is derived from service presence: if services exist, Smartscape has built a topology map. This enables Davis to correlate problems across the full dependency chain.",
    passLogic:
      "Pass: at least one service is tagged with this ApplicationCI (same signal as Tracing Validated).",
    guidance:
      "Smartscape discovery is automatic once OneAgent is installed and services are tagged. Ensure services are correctly tagged with 'applicationci:<code>'. Full topology discovery may take 1–2 hours after initial instrumentation.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch dt.entity.service
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup entity.name
| fields service = entity.name
| sort service asc`,
    scorecardSnippet: `// Smartscape discovery is inferred from service presence.
// If tagged services exist, Dynatrace has built the topology map.

fetch dt.entity.service
| fieldsAdd applicationci = ... // tag extraction (same as Tracing Validated)
| summarize serviceCount = count(), by:{applicationci}

// Pass: serviceCount > 0 (same signal as Tracing Validated)`,
  },

  "5. K8s / Cloud": {
    level: "L1",
    levelColor: "#3BACF0",
    description:
      "Counts Kubernetes workloads (cloud_application entities) tagged with this ApplicationCI. This check is N/A for applications that do not run on Kubernetes or cloud-managed infrastructure — not every application has K8s workloads, and the absence of workloads is not a failure.",
    passLogic:
      "Pass: at least one cloud_application entity is tagged with this ApplicationCI. N/A: no K8s workloads exist for this app.",
    guidance:
      "Connect your Kubernetes cluster to Dynatrace via the Kubernetes Operator or a cloud integration. Ensure workload pods are tagged or annotated with 'applicationci:<code>'. For ECS/EKS, use the AWS integration and tag resources accordingly.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch dt.entity.cloud_application
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup entity.name
| fields workload = entity.name
| sort workload asc`,
    scorecardSnippet: `fetch dt.entity.cloud_application
| fieldsAdd applicationci = ... // tag extraction
| expand applicationci
| summarize k8sCount = count(), by:{applicationci}

// Pass: k8sCount > 0
// N/A:  k8sCount == 0 (no K8s — not a failure for non-K8s apps)`,
  },

  "6. RUM / Synthetics": {
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
      "Verifies that golden signal metrics (traffic, error rate, latency, saturation) are available for this application's services. These metrics are the foundation of SLI/SLO definitions. The check counts tagged services — services in Full-Stack mode inherently emit golden-signal metrics via OneAgent.",
    passLogic: "Pass: at least one service tagged with this ApplicationCI is present (and thus emitting golden-signal metrics).",
    guidance:
      "Golden signals are automatic with Full-Stack OneAgent. Ensure services are correctly tagged. To explicitly define SLIs, navigate to SLO Management and create SLOs referencing golden-signal metrics (request rate, error rate, latency) for this application's services.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch dt.entity.service
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup entity.name
| fields service = entity.name
| sort service asc`,
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
      "Counts Service Level Objectives (SLOs) configured for this ApplicationCI. The check reads from the /lookups/slo table, which is refreshed daily by a workflow querying the Settings API. The AppCI is identified by the first 3 characters of each SLO name — the naming convention requires all SLO names to start with the 3-letter ApplicationCI code.",
    passLogic:
      "Pass: at least one SLO exists in /lookups/slo whose name starts with this ApplicationCI's 3-letter code.",
    guidance:
      "Create SLOs in Dynatrace → SLO Management. Name each SLO starting with the 3-letter ApplicationCI code (e.g., 'ADH - API Availability'). The /lookups/slo table is refreshed nightly — newly created SLOs appear the following day.",
    chartType: "table",
    detailQuery: (appCI: string) => `load "/lookups/slo"
| fieldsAdd appci = lower(substring(slo, from:0, to:3))
| filter appci == lower("${appCI}")
| fields sloName = slo, appci
| sort sloName asc`,
    scorecardSnippet: `// Source: /lookups/slo  (refreshed daily by workflow)
load "/lookups/slo"
| fieldsAdd appci = lower(substring(slo, from:0, to:3))
| summarize sloCount = count(), by:{appci}

// Naming convention: SLO name MUST start with the 3-letter AppCI code
// Pass: sloCount > 0`,
  },

  "3. Site Reliability Guardians Created": {
    level: "L2",
    levelColor: "#1966FF",
    description:
      "Counts Site Reliability Guardians (SRGs) configured for this ApplicationCI. SRGs automate reliability validation by evaluating SLOs, metrics, and events against defined thresholds during deployments or on a schedule. The check reads from the /lookups/guardians table, refreshed daily by workflow 933fd998 via the Guardian Settings API.",
    passLogic:
      "Pass: at least one SRG is found in /lookups/guardians with this ApplicationCI's appci code.",
    guidance:
      "Create an SRG in Dynatrace → Site Reliability Guardian, tag it with 'applicationci:<code>', and define evaluation objectives for the app's critical SLOs. SRGs are most impactful when triggered automatically by deployment events.",
    chartType: "table",
    detailQuery: (appCI: string) => `load "/lookups/guardians"
| fieldsAdd appci = lower(appci)
| filter appci == lower("${appCI}")
| fields appci, guardianCount
| sort appci asc`,
    scorecardSnippet: `// Source: /lookups/guardians  (refreshed daily by workflow 933fd998)
// Workflow queries the Guardian Settings API and writes one row per AppCI.
load "/lookups/guardians"
| fieldsAdd appci = lower(appci)
| summarize guardianCount = sum(toLong(guardianCount)), by:{appci}

// Pass: guardianCount > 0`,
  },

  "4. SLO Dashboards Published": {
    level: "L2",
    levelColor: "#1966FF",
    description:
      "Checks whether SLO dashboards have been published for this ApplicationCI. The check reads from the /lookups/slo-dashboards table (refreshed daily) and counts dashboards whose name starts with the 3-letter ApplicationCI code and contains the word 'SLO' in standalone uppercase. These dashboards provide leadership visibility into reliability targets.",
    passLogic:
      "Pass: at least one dashboard exists in /lookups/slo-dashboards for this ApplicationCI (name starts with AppCI + contains uppercase 'SLO').",
    guidance:
      "Create a Dynatrace dashboard named '<AppCI> SLO Dashboard' (e.g., 'ADH SLO Dashboard'). Include SLO burn-rate tiles, error budget gauges, and trend charts for all application SLOs. The lookup table is refreshed nightly.",
    chartType: "table",
    detailQuery: (appCI: string) => `load "/lookups/slo-dashboards"
| fieldsAdd appci = lower(appci)
| filter appci == lower("${appCI}")
| fields appci, dashboardCount
| sort appci asc`,
    scorecardSnippet: `// Source: /lookups/slo-dashboards  (refreshed daily by workflow)
// Workflow reads the Documents API and keeps dashboards matching:
//   name starts with 3-letter AppCI  AND  contains standalone "SLO"
load "/lookups/slo-dashboards"
| fieldsAdd appci = lower(appci)
| summarize dashboardCount = count(), by:{appci}

// Pass: dashboardCount > 0`,
  },

  "5. SRE Assessment in ARD": {
    level: "L2",
    levelColor: "#1966FF",
    description:
      "Verifies that this application has a CMDB tier assignment imported from ServiceNow. The check looks for a workflow bizevent of type 'workflow.import.servicenow.appci' in the last 24 hours that carries a non-null 'tier' field. The tier (1–4) determines the SRE engagement level and which maturity checks are applicable.",
    passLogic:
      "Pass: a bizevent of type 'workflow.import.servicenow.appci' exists in the last 24 hours with a non-null tier for this ApplicationCI.",
    guidance:
      "Ensure the ServiceNow→Dynatrace CMDB import workflow is running and populating tier data for this application. Contact the SRE platform team if no tier data appears after 24 hours.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch bizevents, from:now()-24h
| filter event.type == "workflow.import.servicenow.appci"
| filter lower(applicationci) == lower("${appCI}")
| filter isNotNull(tier)
| fields applicationci, tier, timestamp
| sort timestamp desc
| limit 10`,
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
      "Checks whether the critical services for this application are tagged and identified in Dynatrace. Critical service tagging enables priority routing in ITSM, auto-escalation in incident management, and targeted alerting thresholds. This check is currently awaiting the BigPanda/CMDB data pipeline that will populate a lookup table of critical services by ApplicationCI.",
    passLogic:
      "N/A: The critical services lookup pipeline is not yet configured. This check will be activated once the automated lookup table (sourced from the BigPanda critical services list or CMDB) is in place.",
    guidance:
      "Work with the SRE platform team to establish the critical services tagging pipeline. Short-term source: BigPanda lookup table or the single spreadsheet maintained by Sandy's team. Long-term: CMDB integration (Ben Eagleski's team, tracked separately). Once the /lookups/critical-services table is populated, this check will wire up automatically.",
    chartType: "none",
    detailQuery: (_appCI: string) => `data record(status = "pending")
| fieldsAdd message = "Critical services lookup pipeline not yet configured."`,
    scorecardSnippet: `// ── STUB ── pipeline not yet configured ──────────────────────────────
// When ready, this will query the critical-services lookup table:
//
//   load "/lookups/critical-services"
//   | fieldsAdd appci = lower(appci)
//   | filter appci == lower("<AppCI>")
//   | summarize criticalCount = count(), by:{appci}
//
// Pass: criticalCount > 0  (at least one critical service is tagged)
// Source: BigPanda lookup → /lookups/critical-services (daily refresh)`,
  },

  // ─── L3 AI-Assisted Operations ───────────────────────────────────────────

  "1. Causal AI Detection + Event Correlation": {
    level: "L3",
    levelColor: "#5E28E5",
    description:
      "Verifies that Davis Causal AI is actively detecting and correlating problems for this application. Only meaningful problems are counted: ERROR or SLOWDOWN categories with more than one associated event (excluding Davis duplicates). The correlation count shows how many of these problems span multiple entities — the key indicator of event correlation working as intended.",
    passLogic:
      "Pass: at least one ERROR or SLOWDOWN category problem (event count > 1, non-duplicate) exists for this ApplicationCI in the last 7 days.",
    guidance:
      "Davis Causal AI is automatic when OneAgent is deployed and alerting is enabled. Ensure anomaly detection thresholds are tuned — not too noisy (see Alert Noise Review), not too silent. A well-instrumented application with realistic baselines will have the best Davis correlation accuracy.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch dt.davis.problems, from:now()-7d
| filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
| fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
| filter isNotNull(appci) and appci == lower("${appCI}")
| filter matchesValue(event.category, array("ERROR", "SLOWDOWN"))
| filter arraySize(dt.davis.event_ids) > 1
| fields title, event.category, event.status,
    hasRootCause = if(isNotNull(root_cause_entity_id), "Yes", else: "No"),
    start_time
| sort start_time desc
| limit 20`,
    scorecardSnippet: `fetch dt.davis.problems, from:now()-7d
| filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
| fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
| filter isNotNull(appci)
| fieldsAdd eventCount = arraySize(dt.davis.event_ids)
| fieldsAdd isCausal = matchesValue(event.category, array("ERROR", "SLOWDOWN"))
    and eventCount > 1
| fieldsAdd isCorrelated = arraySize(affected_entities) > 1
| summarize
    causalTotal     = countIf(isCausal),
    causalActive    = countIf(isCausal and lower(event.status) == "active"),
    causalClosed    = countIf(isCausal and lower(event.status) == "closed"),
    causalWithCause = countIf(isCausal and isNotNull(root_cause_entity_id)),
    correlated      = countIf(isCorrelated),
  by:{appci}

// Pass: causalTotal > 0`,
  },

  "2. CI/CD Integration": {
    level: "L3",
    levelColor: "#5E28E5",
    description:
      "Counts deployment events for this ApplicationCI over the last 30 days. Both GitHub Actions CDK deployments and Harness pipeline deployments are detected via CUSTOM_DEPLOYMENT events. Successful vs total deploys are shown so you can track deployment reliability alongside frequency.",
    passLogic:
      "Pass: at least one CUSTOM_DEPLOYMENT event exists for this ApplicationCI in the last 30 days (any CI/CD platform — GitHub Actions, Harness, or others).",
    guidance:
      "Integrate your CI/CD pipeline to send deployment events to Dynatrace. For GitHub Actions with CDK: the 'GitHub Actions DORA Metrics' workflow auto-sends events. For Harness: configure the Dynatrace deployment notification in your pipeline settings. The event must include the 'application_ci' field.",
    chartType: "bar",
    detailQuery: (appCI: string) => `fetch events, from:now()-30d
| filter event.type == "CUSTOM_DEPLOYMENT"
| filter isNotNull(application_ci) and lower(application_ci) == lower("${appCI}")
| summarize
    deploys = count(),
    success = countIf(\`workflow-outcome\` == "success"),
  by:{timestamp = bin(timestamp, 1d)}
| sort timestamp asc`,
    scorecardSnippet: `// Detects GitHub Actions CDK deployments AND Harness pipeline deployments.
// Previously filtered on cdk-command == "deploy"; now accepts all
// CUSTOM_DEPLOYMENT events to cover multiple CI/CD platforms.
fetch events, from:now()-30d
| filter event.type == "CUSTOM_DEPLOYMENT"
| filter isNotNull(application_ci)
| summarize
    deployTotal   = count(),
    deploySuccess = countIf(\`workflow-outcome\` == "success"),
    avgLeadMs     = avg(if(\`new-deployment\` == "true",
                     toLong(\`avg-release-age\`), else: null)),
  by:{appci = lower(application_ci)}

// Pass: deployTotal > 0`,
  },

  "3. ITSM Integration": {
    level: "L3",
    levelColor: "#5E28E5",
    description:
      "Checks whether a Dynatrace Automation workflow routes alert notifications to the ITSM system (Teams, ServiceNow, or similar). The check looks for workflows titled '<AppCI> Production Dynatrace Alerts' that have executed in the last 30 days. These workflows are triggered by Davis problems and forward enriched incident data to the ticketing system.",
    passLogic:
      "Pass: at least one Automation workflow titled '<AppCI> Production Dynatrace Alerts' has executed in the last 30 days.",
    guidance:
      "Create a Dynatrace Automation workflow named exactly '<AppCI> Production Dynatrace Alerts' (use your 3-letter code as the prefix). Configure it to trigger on Davis problem events and route to your ITSM system (Teams channel, ServiceNow queue, etc.).",
    chartType: "bar",
    detailQuery: (appCI: string) => `fetch dt.system.events, from:now()-30d
| filter event.provider == "AUTOMATION_ENGINE"
| filter event.kind == "WORKFLOW_EVENT"
| filter matchesValue(\`dt.automation_engine.workflow.title\`, "* Production Dynatrace Alerts")
| filter lower(arrayFirst(splitString(\`dt.automation_engine.workflow.title\`, " "))) == lower("${appCI}")
| summarize executions = count(), by:{timestamp = bin(timestamp, 1d)}
| sort timestamp asc`,
    scorecardSnippet: `fetch dt.system.events, from:now()-30d
| filter event.provider == "AUTOMATION_ENGINE"
| filter event.kind == "WORKFLOW_EVENT"
| filter event.type == "WORKFLOW_EXECUTION"
| filter matchesValue(\`dt.automation_engine.workflow.title\`, "* Production Dynatrace Alerts")
| fieldsAdd wfAppci = lower(arrayFirst(splitString(
    \`dt.automation_engine.workflow.title\`, " ")))
| summarize itsmWorkflows = countDistinct(\`dt.automation_engine.workflow.id\`),
  by:{wfAppci}

// Workflow title pattern: "<AppCI> Production Dynatrace Alerts"
// Pass: itsmWorkflows > 0`,
  },

  "4. Runbooks Linked": {
    level: "L3",
    levelColor: "#5E28E5",
    description:
      "Counts runbook notebooks linked to this ApplicationCI. Runbooks provide step-by-step remediation procedures that on-call operators follow during incidents. The check reads from the /lookups/runbooks table (refreshed daily by workflow 0e3d3737), counting notebooks whose name starts with the 3-letter AppCI code and contains the word 'Runbook'.",
    passLogic:
      "Pass: at least one notebook in /lookups/runbooks has a name starting with this ApplicationCI's 3-letter code and containing the word 'Runbook'.",
    guidance:
      "Create a Dynatrace Notebook named '<AppCI> Runbook - <Topic>' (e.g., 'ADH Runbook - High Error Rate'). The name must start with the exact 3-letter AppCI code. Use notebooks to document investigation steps, DQL queries, and remediation commands.",
    chartType: "table",
    detailQuery: (appCI: string) => `load "/lookups/runbooks"
| fieldsAdd appci = lower(appci)
| filter appci == lower("${appCI}")
| fields appci, runbookCount
| sort appci asc`,
    scorecardSnippet: `// Source: /lookups/runbooks  (refreshed daily by workflow 0e3d3737)
// Workflow scans Dynatrace Notebooks API for notebooks whose name:
//   - Starts with a 3-letter token matching an AppCI code
//   - Contains the word "Runbook" (case-insensitive)
load "/lookups/runbooks"
| fieldsAdd appci = lower(appci)
| summarize runbookCount = sum(toLong(runbookCount)), by:{appci}

// Pass: runbookCount > 0`,
  },

  "5. Alert Noise Review": {
    level: "L3",
    levelColor: "#5E28E5",
    description:
      "Measures the proportion of alert noise in this application's Davis problems over the last 7 days. Noise problems are single-event problems in the AVAILABILITY, RESOURCE_CONTENTION, CUSTOM_ALERT, or MONITORING_UNAVAILABLE categories — typically transient flaps or misconfigured monitors. High noise (>50%) indicates alerting fatigue risk and should be investigated.",
    passLogic:
      "Pass: noise % ≤ 50%. Warn: noise % > 50%. N/A: no problems in the last 7 days.",
    guidance:
      "Review high-noise alert types in Dynatrace → Anomaly Detection. Tune baselines for volatile metrics, suppress synthetic monitor outages during maintenance windows, and consolidate CUSTOM_ALERT rules that fire too frequently. Consider using alerting profiles to route low-priority alerts silently.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch dt.davis.problems, from:now()-7d
| filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
| fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
| filter isNotNull(appci) and appci == lower("${appCI}")
| fieldsAdd eventCount = arraySize(dt.davis.event_ids)
| fieldsAdd isNoise = eventCount == 1 and matchesValue(event.category,
    array("AVAILABILITY", "RESOURCE_CONTENTION", "CUSTOM_ALERT", "MONITORING_UNAVAILABLE"))
| summarize total = count(), noise = countIf(isNoise), by:{event.category}
| sort total desc`,
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
// N/A:  total7d  == 0`,
  },

  "6. Problems with Root Cause": {
    level: "L3",
    levelColor: "#5E28E5",
    description:
      "Of all meaningful (causal) Davis problems in the last 7 days, what percentage have an identified root cause entity. Davis sets root_cause_entity_id when it can pinpoint the specific service, host, or process responsible. A high root-cause rate means faster MTTR and confirms that Davis is functioning well with sufficient topology coverage.",
    passLogic:
      "Pass: ≥ 40% of causal problems have a root cause identified. Warn: ≥ 30%. Fail: < 30%. N/A: no causal problems in the last 7 days.",
    guidance:
      "Root cause detection improves with: complete distributed tracing (PurePaths), full dependency maps, and correctly tagged services. Gaps in instrumentation prevent Davis from pinpointing root causes. Review problems without a root cause and identify missing trace or entity links.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch dt.davis.problems, from:now()-7d
| filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
| fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
| filter isNotNull(appci) and appci == lower("${appCI}")
| filter matchesValue(event.category, array("ERROR", "SLOWDOWN"))
| filter arraySize(dt.davis.event_ids) > 1
| fields title, event.status,
    rootCause = if(isNotNull(root_cause_entity_id), "Yes", else: "No"),
    start_time
| sort start_time desc
| limit 20`,
    scorecardSnippet: `// Uses the same causal-problem filter as check #1
fetch dt.davis.problems, from:now()-7d
| filter isCausal // (ERROR/SLOWDOWN, eventCount > 1, non-duplicate)
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
      "Tracks DevOps Research and Assessment (DORA) metrics derived from CI/CD deployment events: deployment frequency and average lead time for changes. Lead time is calculated from the 'avg-release-age' field on new deployment events. NOTE: this is an interim implementation — a company-wide DORA standard (including change failure rate and MTTR) is being defined and these metrics will be updated.",
    passLogic:
      "Pass: deployment event data is available in the last 30 days. DORA metrics are computed from the same CUSTOM_DEPLOYMENT events as the CI/CD Integration check.",
    guidance:
      "Deployment frequency and lead time are automatic once CI/CD events are flowing. To improve lead time: optimize your build and test pipeline. Change failure rate and MTTR tracking will be added once the company-wide DORA standard is finalized.",
    chartType: "bar",
    detailQuery: (appCI: string) => `fetch events, from:now()-30d
| filter event.type == "CUSTOM_DEPLOYMENT"
| filter isNotNull(application_ci) and lower(application_ci) == lower("${appCI}")
| fieldsAdd leadMs = if(\`new-deployment\` == "true" and isNotNull(\`avg-release-age\`),
    toLong(\`avg-release-age\`), else: null)
| summarize
    deploys   = count(),
    success   = countIf(\`workflow-outcome\` == "success"),
    avgLeadMs = avg(leadMs),
  by:{timestamp = bin(timestamp, 1d)}
| sort timestamp asc`,
    scorecardSnippet: `// DORA metrics are derived from CUSTOM_DEPLOYMENT events.
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
// Interim — company-wide DORA standard (incl. CFR, MTTR) coming`,
  },

  // ─── L4 Proactive Reliability ─────────────────────────────────────────────

  "1. Resource Saturation Alerts": {
    level: "L4",
    levelColor: "#8D1CDC",
    description:
      "Confirms that Davis resource saturation alerting is active. Davis automatically raises RESOURCE_CONTENTION problems when CPU, memory, disk, or network resources approach saturation — no manual configuration is required. This check always passes when Davis is operational, and the supporting data shows recent resource contention problems for review.",
    passLogic:
      "Pass: always. Davis resource saturation alerting is automatic and active by default when OneAgent is deployed.",
    guidance:
      "Review recent RESOURCE_CONTENTION problems to identify recurring saturation issues. Persistent resource saturation may indicate capacity needs, runaway processes, or memory leaks. Consider setting custom anomaly detection thresholds for critical services.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch dt.davis.problems, from:now()-30d
| filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
| fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
| filter isNotNull(appci) and appci == lower("${appCI}")
| filter event.category == "RESOURCE_CONTENTION"
| fields title, event.status, start_time
| sort start_time desc
| limit 20`,
    scorecardSnippet: `// Resource saturation alerting is automatic via Davis.
// This check is always reported as "pass Davis alerting active".

// Supporting data: recent RESOURCE_CONTENTION problems
fetch dt.davis.problems
| fieldsAdd appci = ...
| filter event.category == "RESOURCE_CONTENTION"
| summarize resourceProblems = count(), by:{appci}

// Pass: always (reported as pass by design)`,
  },

  "2. Dynamic Scaling Metrics": {
    level: "L4",
    levelColor: "#8D1CDC",
    description:
      "Checks whether AWS cloud resources are being tracked for this ApplicationCI from the daily cloud inventory bizevent. This signal confirms that cloud resource metadata (EKS, ECS, EC2, Lambda, etc.) is flowing into Dynatrace and is associated with the application. The AWS Cloud Connector must be configured at the organizational level.",
    passLogic:
      "Pass: at least one AWS resource appears in the cloud inventory bizevent (last 24h) for this ApplicationCI.",
    guidance:
      "Ensure the Dynatrace AWS Cloud Connector is configured and the application's AWS resources are tagged with 'applicationci:<code>'. The cloud inventory workflow runs daily — resources appear within 24 hours of connection. Contact the Dynatrace platform team if no AWS data appears.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch bizevents, from:now()-24h
| filter event.type == "workflow.summary.cloud.aws"
| filter lower(applicationci) == lower("${appCI}")
| summarize total = count(), by:{type}
| sort total desc`,
    scorecardSnippet: `fetch bizevents, from:now()-24h
| filter event.type == "workflow.summary.cloud.aws"
| summarize
    awsTotal = count(),
    eksCount = countIf(contains(type, "eks")),
    ecsCount = countIf(contains(type, "ecs")),
  by:{applicationci}

// Pass: awsTotal > 0`,
  },

  "3. K8s Autoscaling Visible": {
    level: "L4",
    levelColor: "#8D1CDC",
    description:
      "Checks whether Kubernetes workload entities are visible for this application in Dynatrace. K8s autoscaling visibility requires the Kubernetes Operator and workload entity tagging. Multiple autoscaling mechanisms are supported (HPA, KEDA, Karpenter) — Dynatrace captures raw YAML configs from which scaling configuration can be derived.",
    passLogic:
      "Pass: at least one cloud_application entity or EKS cluster is tagged with this ApplicationCI. N/A: the application has no K8s workloads.",
    guidance:
      "Install the Dynatrace Kubernetes Operator. Annotate workload pods with 'applicationci=<code>'. For HPA: review K8s resource configs for HorizontalPodAutoscaler objects. For KEDA/Karpenter: review the respective controller configurations in the Dynatrace K8s config view.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch dt.entity.cloud_application
| expand tags
| parse tags, "'applicationci:' LD:appci"
| filter lower(appci) == lower("${appCI}")
| dedup entity.name
| fields workload = entity.name
| sort workload asc`,
    scorecardSnippet: `fetch dt.entity.cloud_application
| fieldsAdd applicationci = ... // tag extraction
| summarize k8sCount = count(), by:{applicationci}

// Also checks EKS count from cloud inventory bizevent:
//   eksCount from workflow.summary.cloud.aws

// Pass: k8sCount > 0 OR eksCount > 0
// N/A:  no K8s workloads for this app (not a failure)`,
  },

  "4. Predictive Forecasting": {
    level: "L4",
    levelColor: "#8D1CDC",
    description:
      "Tracks whether predictive capacity forecasting is enabled for this application. Dynatrace's Davis Forecasting Analyzer can predict future metric values based on historical trends, enabling proactive capacity planning before saturation occurs. This check is not yet enabled and requires configuration.",
    passLogic: "N/A: not yet enabled.",
    guidance:
      "Configure the Davis Forecasting Analyzer for critical metrics (CPU utilization, memory, request rate). Set up alerting on predicted threshold violations. Work with the SRE platform team to establish baseline periods and forecast thresholds for this application.",
    chartType: "none",
    detailQuery: (_appCI: string) => `data record(status = "not_enabled")
| fieldsAdd message = "Predictive Forecasting not yet configured."`,
    scorecardSnippet: `// ── STUB ── Davis Forecasting Analyzer not yet configured ────────────
// When ready, this will use the Davis Analyzer API:
//
//   fetch davis.analyzer.results
//   | filter analyzer.type == "FORECASTING"
//   | filter lower(applicationci) == lower("<AppCI>")
//   | summarize forecastCount = count(), by:{applicationci}
//
// Pass: forecastCount > 0  (at least one metric being forecast)`,
  },

  "5. Cloud Capacity Reviewed": {
    level: "L4",
    levelColor: "#8D1CDC",
    description:
      "Checks whether the cloud resource inventory for this application has been reviewed in the last 24 hours. The check uses the same cloud inventory bizevent as Dynamic Scaling Metrics — confirming that the daily cloud capacity review workflow has run and resource data is current.",
    passLogic:
      "Pass: at least one AWS resource appears in the last 24h cloud inventory bizevent for this ApplicationCI (same signal as Dynamic Scaling Metrics).",
    guidance:
      "Cloud capacity review is automated through the daily cloud inventory workflow. Review the AWS resource breakdown regularly to identify over-provisioned or under-provisioned resources. Schedule quarterly capacity planning sessions with application teams.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch bizevents, from:now()-24h
| filter event.type == "workflow.summary.cloud.aws"
| filter lower(applicationci) == lower("${appCI}")
| fields type, timestamp
| sort timestamp desc
| limit 20`,
    scorecardSnippet: `// Same source as Dynamic Scaling Metrics
fetch bizevents, from:now()-24h
| filter event.type == "workflow.summary.cloud.aws"
| summarize awsTotal = count(), by:{applicationci}

// Pass: awsTotal > 0  (cloud inventory is current for this ApplicationCI)`,
  },

  "6. Deployment Events": {
    level: "L4",
    levelColor: "#8D1CDC",
    description:
      "Counts CUSTOM_DEPLOYMENT Davis events tagged with this ApplicationCI in the last 7 days via affected_entity_tags. Deployment events mark the exact moment a new version goes live, enabling Davis to correlate performance changes directly with releases. This signal comes from Davis entity event propagation, separate from the L3 CI/CD check.",
    passLogic:
      "Pass: at least one CUSTOM_DEPLOYMENT Davis event is tagged with this ApplicationCI in the last 7 days.",
    guidance:
      "Ensure deployment events include the applicationci tag in their affected_entity_tags payload. This typically requires the CI/CD pipeline to tag the deployment event with the correct entity. Check the Davis Event API documentation for the required event payload format.",
    chartType: "table",
    detailQuery: (appCI: string) => `fetch events, from:now()-7d
| filter event.kind == "DAVIS_EVENT"
| filter event.type == "CUSTOM_DEPLOYMENT"
| expand affected_entity_tags
| parse affected_entity_tags, "'applicationci:' LD:appci"
| filter isNotNull(appci) and lower(appci) == lower("${appCI}")
| dedup timestamp, entity.name
| fields entity.name, timestamp
| sort timestamp desc
| limit 20`,
    scorecardSnippet: `fetch events, from:now()-7d
| filter event.kind == "DAVIS_EVENT"
| filter event.type == "CUSTOM_DEPLOYMENT"
| expand affected_entity_tags
| parse affected_entity_tags, "'applicationci:' LD:appci"
| filter isNotNull(appci)
| fieldsAdd applicationci = lower(appci)
| summarize deployCount = count(), by:{applicationci}

// Pass: deployCount > 0`,
  },

  "7. Release Impact Tracking": {
    level: "L4",
    levelColor: "#8D1CDC",
    description:
      "Tracks whether release impact analysis is configured — measuring the before/after effect of each deployment on key SLIs. Release impact tracking requires deployment events to be correlated with SLO evaluation windows. This check is not yet enabled.",
    passLogic: "N/A: not yet enabled.",
    guidance:
      "Configure release impact tracking by correlating deployment events with SLO evaluation periods. Use Davis problem correlation or create a custom workflow that evaluates SLOs before/after each deployment event and writes a summary bizevent.",
    chartType: "none",
    detailQuery: (_appCI: string) => `data record(status = "not_enabled")
| fieldsAdd message = "Release Impact Tracking not yet configured."`,
    scorecardSnippet: `// ── STUB ── not yet implemented ───────────────────────────────────────
// When enabled, this will correlate:
//   CUSTOM_DEPLOYMENT events → SLO evaluation results
//   to measure pre/post reliability impact of each release
//
// Approach: write a post-deploy workflow that evaluates SRG
// and emits a "release.impact.summary" bizevent with delta metrics.`,
  },

  "8. Pre/Post Dashboards": {
    level: "L4",
    levelColor: "#8D1CDC",
    description:
      "Checks whether deployment comparison dashboards exist — dashboards that overlay golden signal metrics in the time window before and after each release. These dashboards help teams quickly validate that a new deployment has not degraded reliability. This check is not yet configured.",
    passLogic: "N/A: not yet detected.",
    guidance:
      "Create Dynatrace dashboards that use the deployment event timestamp as a reference point. Use the timeframe comparison feature to overlay pre/post deployment metric windows. Name dashboards following the '<AppCI> Release Compare' convention.",
    chartType: "none",
    detailQuery: (_appCI: string) => `data record(status = "not_enabled")
| fieldsAdd message = "Pre/Post deployment dashboards not yet detected."`,
    scorecardSnippet: `// ── STUB ── not yet implemented ───────────────────────────────────────
// When enabled, this will query:
//   load "/lookups/slo-dashboards"
//   | filter contains(lower(dashboardName), "release")
//       or contains(lower(dashboardName), "compare")
//   | filter appci == lower("<AppCI>")`,
  },

  "9. Error Budget Gating": {
    level: "L4",
    levelColor: "#8D1CDC",
    description:
      "Verifies whether error budget gates are configured in the deployment pipeline — automatically blocking or warning when a deployment would push the application's SLO error budget into burn. Error budget gating typically uses Site Reliability Guardian evaluations as pipeline gates in Harness or GitHub Actions. This check is not yet configured.",
    passLogic: "N/A: not yet configured.",
    guidance:
      "Configure error budget gates using Site Reliability Guardian in your CI/CD pipeline. In Harness or GitHub Actions, call the Guardian API before deployment — fail the pipeline if the error budget is below a threshold (e.g., < 20% remaining). This protects reliability by preventing risky deploys during burn periods.",
    chartType: "none",
    detailQuery: (_appCI: string) => `data record(status = "not_enabled")
| fieldsAdd message = "Error Budget Gating not yet configured."`,
    scorecardSnippet: `// ── STUB ── not yet implemented ───────────────────────────────────────
// When enabled, this will check SRG gate results:
//   load "/lookups/guardians"
//   | filter gatingEnabled == true
//   | filter appci == lower("<AppCI>")
//
// OR track bizevent from a pipeline gate workflow:
//   fetch bizevents
//   | filter event.type == "srg.gate.result"
//   | filter lower(applicationci) == lower("<AppCI>")`,
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
