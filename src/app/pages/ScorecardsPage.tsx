import React from "react";
import {
  Flex,
  Text,
  Surface,
  DataTable,
  ProgressCircle,
} from "@dynatrace/strato-components-preview";
import { useDqlQuery } from "../hooks/useDqlQuery";

interface Props {
  appCI: string;
}

function ScorecardSection({ title, query }: { title: string; query: string }) {
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

export const ScorecardsPage: React.FC<Props> = ({ appCI }) => {
  const l1Query = `// L1 Full Observability - Maturity Scorecard
data record(applicationci = lower("${appCI}"))

// Signal 1: OneAgent / Metrics
| lookup [
    fetch dt.entity.host
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
    | summarize
        hostCount = count(),
        fullStackCount = countIf(monitoringMode == "FULL_STACK"),
        by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{hostCount, fullStackCount}
| fieldsRename hosts = hostCount, fullStack = fullStackCount

// Signal 2: Services / Traces
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
    | summarize serviceCount = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{serviceCount}
| fieldsRename services = serviceCount

// Signal 3: Logs
| lookup [
    fetch logs, samplingRatio:1000
    | filter isNotNull(applicationci)
    | summarize logCount = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{logCount}
| fieldsRename logs = logCount

// Signal 4: K8s / Cloud workloads
| lookup [
    fetch dt.entity.cloud_application
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
    | summarize k8sCount = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{k8sCount}
| fieldsRename k8sWorkloads = k8sCount

// Signal 5: RUM
| lookup [
    fetch dt.entity.application, from:now()-1000d
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
    | fieldsAdd rumActive = if(lifetime[end] > now()-7d, true, else: false)
    | summarize rumCount = countIf(rumActive == true), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{rumCount}
| fieldsRename rumApps = rumCount

// Signal 6: Synthetics
| lookup [
    fetch dt.entity.synthetic_test
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
    | summarize synCount = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{synCount}
| fieldsRename synthetics = synCount

// Null-safe defaults
| fieldsAdd
    hosts = if(isNull(hosts), 0, else: hosts),
    fullStack = if(isNull(fullStack), 0, else: fullStack),
    services = if(isNull(services), 0, else: services),
    logs = if(isNull(logs), 0, else: logs),
    k8sWorkloads = if(isNull(k8sWorkloads), 0, else: k8sWorkloads),
    rumApps = if(isNull(rumApps), 0, else: rumApps),
    synthetics = if(isNull(synthetics), 0, else: synthetics)

// Compute status
| fieldsAdd
    \`1. OneAgent Deployed\` = if(hosts > 0,
        concat("pass ", toString(fullStack), "/", toString(hosts), " Full-Stack"),
        else: "fail No hosts"),
    \`2. Tracing Validated\` = if(services > 0,
        concat("pass ", toString(services), " services"),
        else: "fail No services"),
    \`3. Logs Correlated\` = if(logs > 0,
        "pass Active",
        else: "fail No logs"),
    \`4. Smartscape Discovery\` = if(services > 0,
        "pass Active",
        else: "fail Not discovered"),
    \`5. K8s / Cloud\` = if(k8sWorkloads > 0,
        concat("pass ", toString(k8sWorkloads), " workloads"),
        else: "n/a N/A"),
    \`6. RUM / Synthetics\` = if(rumApps > 0 or synthetics > 0,
        concat("pass RUM:", toString(rumApps), " Syn:", toString(synthetics)),
        else: "fail Not configured")

| fieldsAdd passCount =
    if(hosts > 0, 1, else: 0)
    + if(services > 0, 1, else: 0)
    + if(logs > 0, 1, else: 0)
    + if(services > 0, 1, else: 0)
    + if(k8sWorkloads > 0, 1, else: 0)
    + if(rumApps > 0 or synthetics > 0, 1, else: 0)
| fieldsAdd \`L1 Score\` = concat(toString(passCount), " / 6")

| fields
    \`L1 Score\`,
    \`1. OneAgent Deployed\`,
    \`2. Tracing Validated\`,
    \`3. Logs Correlated\`,
    \`4. Smartscape Discovery\`,
    \`5. K8s / Cloud\`,
    \`6. RUM / Synthetics\``;

  const l2Query = `// L2 Measured Reliability - Maturity Scorecard
data record(applicationci = lower("${appCI}"))

// Signal 1: Golden signal metrics
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
    | summarize serviceCount = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{serviceCount}
| fieldsRename goldenSignalServices = serviceCount

// Signal 2: SLO dashboards published
| lookup [
    fetch bizevents, from:now()-24h
    | filter event.type == "workflow.summary.dashboard"
    | fieldsAdd dashAppci = lower(splitString(name, " :")[0])
    | filter isNotNull(dashAppci)
    | filter stringLength(dashAppci) <= 4
    | summarize dashboardCount = count(), by:{dashAppci}
    | fieldsRename applicationci = dashAppci
  ], sourceField:applicationci, lookupField:applicationci, fields:{dashboardCount}
| fieldsRename dashboards = dashboardCount

// Signal 3: SRE assessment (CMDB tier assigned)
| lookup [
    fetch bizevents, from:now()-24h
    | filter event.type == "workflow.import.servicenow.appci"
    | fieldsAdd applicationci = lower(applicationci)
    | filter isNotNull(tier)
    | summarize hasTier = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{hasTier}
| fieldsRename sreAssessment = hasTier

// Null-safe defaults
| fieldsAdd
    goldenSignalServices = if(isNull(goldenSignalServices), 0, else: goldenSignalServices),
    dashboards = if(isNull(dashboards), 0, else: dashboards),
    sreAssessment = if(isNull(sreAssessment), 0, else: sreAssessment)

// Compute status
| fieldsAdd
    \`1. Golden Signal SLIs\` = if(goldenSignalServices > 0,
        concat("pass ", toString(goldenSignalServices), " services with metrics"),
        else: "fail No services"),
    \`2. SLOs Created\` = "fail Not detected",
    \`3. Error Budget Tracking\` = "fail Not detected",
    \`4. SLO Dashboards Published\` = if(dashboards > 0,
        concat("pass ", toString(dashboards), " dashboards"),
        else: "fail No AppCI dashboards"),
    \`5. SRE Assessment in ARD\` = if(sreAssessment > 0,
        "pass CMDB tier assigned",
        else: "fail No tier data")

| fieldsAdd passCount =
    if(goldenSignalServices > 0, 1, else: 0)
    + 0 + 0
    + if(dashboards > 0, 1, else: 0)
    + if(sreAssessment > 0, 1, else: 0)
| fieldsAdd \`L2 Score\` = concat(toString(passCount), " / 5")

| fields
    \`L2 Score\`,
    \`1. Golden Signal SLIs\`,
    \`2. SLOs Created\`,
    \`3. Error Budget Tracking\`,
    \`4. SLO Dashboards Published\`,
    \`5. SRE Assessment in ARD\``;

  const l3Query = `// L3 AI-Assisted Operations - Maturity Scorecard
data record(applicationci = lower("${appCI}"))

// All problem signals in one lookup
| lookup [
    fetch dt.davis.problems
    | fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
    | filter isNotNull(appci)
    | filter dt.davis.is_duplicate == false
    | fieldsAdd isCorrelated = arraySize(affected_entities) > 1
    | fieldsAdd hasItsmProfile = toString(labels.alerting_profile) != "[\\"Default\\"]"
        and isNotNull(labels.alerting_profile)
    | summarize
        totalProblems = count(),
        correlatedProblems = countIf(isCorrelated == true),
        customAlerts = countIf(event.category == "CUSTOM_ALERT"),
        itsmRouted = countIf(hasItsmProfile == true),
        avgDuration = avg(toDouble(resolved_problem_duration) / 60000000000.0),
        by:{appci}
    | fieldsRename applicationci = appci
  ], sourceField:applicationci, lookupField:applicationci, fields:{totalProblems, correlatedProblems, customAlerts, itsmRouted, avgDuration}
| fieldsRename
    problems = totalProblems,
    correlated = correlatedProblems,
    noise = customAlerts,
    itsm = itsmRouted,
    duration = avgDuration

// Null-safe defaults
| fieldsAdd
    problems = if(isNull(problems), 0, else: problems),
    correlated = if(isNull(correlated), 0, else: correlated),
    noise = if(isNull(noise), 0, else: noise),
    itsm = if(isNull(itsm), 0, else: itsm),
    duration = if(isNull(duration), 0.0, else: duration)

| fieldsAdd noiseRatio = if(problems > 0,
    round(toDouble(noise) * 100.0 / toDouble(problems), decimals:0),
    else: 0.0)

// Compute status
| fieldsAdd
    \`1. Davis AI Detection\` = if(problems > 0,
        concat("pass ", toString(problems), " problems (",
            toString(round(duration, decimals:1)), " min avg)"),
        else: "fail No problems detected"),
    \`2. Event Correlation\` = if(correlated > 0,
        concat("pass ", toString(correlated), " correlated"),
        else: "fail No correlation observed"),
    \`3. ITSM Integration\` = if(itsm > 0,
        concat("pass ", toString(itsm), " routed via alerting profile"),
        else: "fail Default profile only"),
    \`4. Runbooks Linked\` = "fail Not detected",
    \`5. Alert Noise Review\` = if(problems > 0,
        concat(if(noiseRatio > 50, "warn ", else: "pass "),
            toString(noise), "/", toString(problems),
            " custom alerts (", toString(noiseRatio), "%)"),
        else: "n/a No data")

| fieldsAdd passCount =
    if(problems > 0, 1, else: 0)
    + if(correlated > 0, 1, else: 0)
    + if(itsm > 0, 1, else: 0)
    + 0
    + if(problems > 0 and noiseRatio <= 50, 1, else: 0)
| fieldsAdd \`L3 Score\` = concat(toString(passCount), " / 5")

| fields
    \`L3 Score\`,
    \`1. Davis AI Detection\`,
    \`2. Event Correlation\`,
    \`3. ITSM Integration\`,
    \`4. Runbooks Linked\`,
    \`5. Alert Noise Review\``;

  const l4Query = `// L4 Proactive Reliability - Maturity Scorecard
data record(applicationci = lower("${appCI}"))

// Signal 1: Resource saturation problems
| lookup [
    fetch dt.davis.problems
    | fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
    | filter isNotNull(appci)
    | filter dt.davis.is_duplicate == false
    | summarize
        resourceProblems = countIf(event.category == "RESOURCE_CONTENTION"),
        by:{appci}
    | fieldsRename applicationci = appci
  ], sourceField:applicationci, lookupField:applicationci, fields:{resourceProblems}
| fieldsRename resourceAlerts = resourceProblems

// Signal 2: K8s workloads
| lookup [
    fetch dt.entity.cloud_application
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
    | summarize k8sCount = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{k8sCount}
| fieldsRename k8sWorkloads = k8sCount

// Signal 3: Deployment events
| lookup [
    fetch events, from:now()-7d
    | filter event.kind == "DAVIS_EVENT"
    | filter event.type == "CUSTOM_DEPLOYMENT"
    | expand affected_entity_tags
    | parse affected_entity_tags, "'applicationci:' LD:appci"
    | filter isNotNull(appci)
    | fieldsAdd applicationci = lower(appci)
    | summarize deployCount = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{deployCount}
| fieldsRename deployments = deployCount

// Signal 4: AWS cloud inventory
| lookup [
    fetch bizevents, from:now()-24h
    | filter event.type == "workflow.summary.cloud.aws"
    | summarize
        awsTotal = count(),
        eksCount = countIf(contains(type, "eks")),
        ecsCount = countIf(contains(type, "ecs")),
        by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{awsTotal, eksCount, ecsCount}
| fieldsRename aws = awsTotal, eks = eksCount, ecs = ecsCount

// Null-safe defaults
| fieldsAdd
    resourceAlerts = if(isNull(resourceAlerts), 0, else: resourceAlerts),
    k8sWorkloads = if(isNull(k8sWorkloads), 0, else: k8sWorkloads),
    deployments = if(isNull(deployments), 0, else: deployments),
    aws = if(isNull(aws), 0, else: aws),
    eks = if(isNull(eks), 0, else: eks),
    ecs = if(isNull(ecs), 0, else: ecs)

// Compute status
| fieldsAdd
    \`1. Resource Saturation Alerts\` = "pass Davis alerting active",
    \`2. Dynamic Scaling Metrics\` = if(aws > 0,
        concat("pass ", toString(aws), " AWS resources tracked"),
        else: "fail No cloud metrics"),
    \`3. K8s Autoscaling Visible\` = if(k8sWorkloads > 0 or eks > 0,
        concat("pass ", toString(k8sWorkloads), " workloads / ", toString(eks), " EKS"),
        else: "n/a N/A for this app"),
    \`4. Predictive Forecasting\` = "fail Not enabled",
    \`5. Cloud Capacity Reviewed\` = if(aws > 0,
        concat("pass ", toString(aws), " resources inventoried"),
        else: "fail No AWS inventory"),
    \`6. Deployment Events\` = if(deployments > 0,
        concat("pass ", toString(deployments), " events (7d)"),
        else: "fail Not integrated"),
    \`7. Release Impact Tracking\` = "fail Not enabled",
    \`8. Pre/Post Dashboards\` = "fail Not detected",
    \`9. Error Budget Gating\` = "fail Not configured"

| fieldsAdd passCount =
    1
    + if(aws > 0, 1, else: 0)
    + if(k8sWorkloads > 0 or eks > 0, 1, else: 0)
    + 0
    + if(aws > 0, 1, else: 0)
    + if(deployments > 0, 1, else: 0)
    + 0 + 0 + 0
| fieldsAdd \`L4 Score\` = concat(toString(passCount), " / 9")

| fields
    \`L4 Score\`,
    \`1. Resource Saturation Alerts\`,
    \`2. Dynamic Scaling Metrics\`,
    \`3. K8s Autoscaling Visible\`,
    \`4. Predictive Forecasting\`,
    \`5. Cloud Capacity Reviewed\`,
    \`6. Deployment Events\`,
    \`7. Release Impact Tracking\`,
    \`8. Pre/Post Dashboards\`,
    \`9. Error Budget Gating\``;

  const l5Query = `// L5 Autonomous Reliability - Maturity Scorecard
data record(applicationci = lower("${appCI}"))

// Signal 1: Workflow automations
| lookup [
    fetch bizevents, from:now()-7d
    | filter contains(event.type, "workflow")
    | filter isNotNull(applicationci)
    | summarize workflowCount = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{workflowCount}
| fieldsRename workflows = workflowCount

// Signal 2: Problem auto-enrichment
| lookup [
    fetch dt.davis.problems
    | fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
    | filter isNotNull(appci)
    | filter dt.davis.is_duplicate == false
    | fieldsAdd hasItsmProfile = toString(labels.alerting_profile) != "[\\"Default\\"]"
        and isNotNull(labels.alerting_profile)
    | summarize
        totalProblems = count(),
        enrichedProblems = countIf(hasItsmProfile == true),
        by:{appci}
    | fieldsRename applicationci = appci
  ], sourceField:applicationci, lookupField:applicationci, fields:{totalProblems, enrichedProblems}
| fieldsRename total = totalProblems, enriched = enrichedProblems

// Null-safe defaults
| fieldsAdd
    workflows = if(isNull(workflows), 0, else: workflows),
    total = if(isNull(total), 0, else: total),
    enriched = if(isNull(enriched), 0, else: enriched)

| fieldsAdd enrichPct = if(total > 0,
    round(toDouble(enriched) * 100.0 / toDouble(total), decimals:0),
    else: 0.0)

// Compute status
| fieldsAdd
    \`1. Repetitive Tasks Identified\` = if(workflows > 0,
        concat("pass ", toString(workflows), " workflow events (7d)"),
        else: "fail No automation detected"),
    \`2. Workflow Automation\` = if(workflows > 0,
        "pass Workflows active",
        else: "fail Not configured"),
    \`3. E2E Remediation Automated\` = "fail Not detected",
    \`4. Incident Auto-Enrichment\` = if(total > 0,
        concat(if(enrichPct >= 50, "pass ", else: "warn "),
            toString(enriched), "/", toString(total),
            " enriched (", toString(enrichPct), "%)"),
        else: "fail No problems"),
    \`5. AI Postmortem / PTASK in ARD\` = "fail Not detected"

| fieldsAdd passCount =
    if(workflows > 0, 1, else: 0)
    + if(workflows > 0, 1, else: 0)
    + 0
    + if(total > 0 and enrichPct >= 50, 1, else: 0)
    + 0
| fieldsAdd \`L5 Score\` = concat(toString(passCount), " / 5")

| fields
    \`L5 Score\`,
    \`1. Repetitive Tasks Identified\`,
    \`2. Workflow Automation\`,
    \`3. E2E Remediation Automated\`,
    \`4. Incident Auto-Enrichment\`,
    \`5. AI Postmortem / PTASK in ARD\``;

  return (
    <Flex flexDirection="column" gap={16} padding={16}>
      <Text textStyle="heading-level-3">SRE Maturity Level Scorecards</Text>
      <ScorecardSection title="L1 - Full Observability Scorecard" query={l1Query} />
      <ScorecardSection title="L2 - Measured Reliability Scorecard" query={l2Query} />
      <ScorecardSection title="L3 - AI-Assisted Operations Scorecard" query={l3Query} />
      <ScorecardSection title="L4 - Proactive Reliability Scorecard" query={l4Query} />
      <ScorecardSection title="L5 - Autonomous Reliability Scorecard" query={l5Query} />
    </Flex>
  );
};
