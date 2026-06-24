import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading } from "@dynatrace/strato-components/typography";
import { ScorecardCard } from "../components/ScorecardCard";
import { OverallScore } from "../components/OverallScore";
import { AppContextBanner } from "../components/AppContextBanner";

interface Props {
  appCI: string;
  timeframe: { from: string; to: string };
}

export const ScorecardsPage = ({ appCI, timeframe }: Props) => {

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

// Signal 2: SLOs created (from the /lookups/slo table; AppCI = first 3 chars of the SLO name)
| lookup [
    load "/lookups/slo"
    | fieldsAdd appci = lower(substring(slo, from:0, to:3))
    | summarize sloCount = count(), by:{appci}
  ], sourceField:applicationci, lookupField:appci, fields:{sloCount}

// Signal 3: Site Reliability Guardian exists (from /lookups/guardians; appci -> guardianCount, refreshed by workflow)
| lookup [
    load "/lookups/guardians"
    | fieldsAdd appci = lower(appci)
  ], sourceField:applicationci, lookupField:appci, fields:{guardianCount}

// Signal 4: SLO dashboards published (from /lookups/slo-dashboards; refreshed by workflow)
//   counts dashboards whose name starts with a 3-letter AppCI token and contains "SLO"
| lookup [
    load "/lookups/slo-dashboards"
    | fieldsAdd appci = lower(appci)
  ], sourceField:applicationci, lookupField:appci, fields:{dashboardCount}
| fieldsRename dashboards = dashboardCount

// Signal 5: SRE assessment (CMDB tier assigned)
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
    sloCount = if(isNull(sloCount), 0, else: sloCount),
    guardianCount = if(isNull(guardianCount), 0, else: toLong(guardianCount)),
    dashboards = if(isNull(dashboards), 0, else: toLong(dashboards)),
    sreAssessment = if(isNull(sreAssessment), 0, else: sreAssessment)

// Compute status
| fieldsAdd
    \`1. Golden Signal SLIs\` = if(goldenSignalServices > 0,
        concat("pass ", toString(goldenSignalServices), " services with metrics"),
        else: "fail No services"),
    \`2. SLOs Created\` = if(sloCount > 0,
        concat("pass ", toString(sloCount), " SLOs configured"),
        else: "fail No SLOs detected"),
    \`3. Site Reliability Guardians Created\` = if(guardianCount > 0,
        concat("pass ", toString(guardianCount), " guardian(s)"),
        else: "fail None found"),
    \`4. SLO Dashboards Published\` = if(dashboards > 0,
        concat("pass ", toString(dashboards), " dashboards"),
        else: "fail No AppCI dashboards"),
    \`5. SRE Assessment in ARD\` = if(sreAssessment > 0,
        "pass CMDB tier assigned",
        else: "fail No tier data")

| fieldsAdd passCount =
    if(goldenSignalServices > 0, 1, else: 0)
    + if(sloCount > 0, 1, else: 0)
    + if(guardianCount > 0, 1, else: 0)
    + if(dashboards > 0, 1, else: 0)
    + if(sreAssessment > 0, 1, else: 0)
| fieldsAdd \`L2 Score\` = concat(toString(passCount), " / 5")

| fields
    \`L2 Score\`,
    \`1. Golden Signal SLIs\`,
    \`2. SLOs Created\`,
    \`3. Site Reliability Guardians Created\`,
    \`4. SLO Dashboards Published\`,
    \`5. SRE Assessment in ARD\``;

  const l3Query = `// L3 AI-Assisted Operations - Maturity Scorecard
data record(applicationci = lower("${appCI}"))

// Event correlation signal (default timeframe)
| lookup [
    fetch dt.davis.problems
    | fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
    | filter isNotNull(appci)
    | filter dt.davis.is_duplicate == false
    | fieldsAdd isCorrelated = arraySize(affected_entities) > 1
    | summarize correlatedProblems = countIf(isCorrelated == true), by:{appci}
    | fieldsRename applicationci = appci
  ], sourceField:applicationci, lookupField:applicationci, fields:{correlatedProblems}
| fieldsRename correlated = correlatedProblems

// Problem signals (causal vs noise), last 7 days
//   causal = real problems: ERROR/SLOWDOWN categories with event count > 1
//   noise  = event count == 1 in AVAILABILITY/RESOURCE_CONTENTION/CUSTOM_ALERT/MONITORING_UNAVAILABLE
| lookup [
    fetch dt.davis.problems, from:now()-7d
    | filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
    | fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
    | filter isNotNull(appci)
    | fieldsAdd eventCount = arraySize(dt.davis.event_ids)
    | fieldsAdd isCausal = matchesValue(event.category, array("ERROR", "SLOWDOWN")) and eventCount > 1
    | fieldsAdd isNoise = eventCount == 1 and matchesValue(event.category, array("AVAILABILITY", "RESOURCE_CONTENTION", "CUSTOM_ALERT", "MONITORING_UNAVAILABLE"))
    | fieldsAdd hasRootCause = isNotNull(root_cause_entity_id)
    | summarize
        total7d = count(),
        causalActive = countIf(isCausal and lower(event.status) == "active"),
        causalClosed = countIf(isCausal and lower(event.status) == "closed"),
        causalTotal = countIf(isCausal),
        causalWithCause = countIf(isCausal and hasRootCause == true),
        noiseTotal = countIf(isNoise),
        by:{appci}
    | fieldsRename applicationci = appci
  ], sourceField:applicationci, lookupField:applicationci, fields:{total7d, causalActive, causalClosed, causalTotal, causalWithCause, noiseTotal}

// ITSM Integration: a workflow named "<AppCI> Production Dynatrace Alerts" exists (last 30 days)
| lookup [
    fetch dt.system.events, from:now()-30d
    | filter event.provider == "AUTOMATION_ENGINE"
    | filter event.kind == "WORKFLOW_EVENT"
    | filter event.type == "WORKFLOW_EXECUTION"
    | filter matchesValue(\`dt.automation_engine.workflow.title\`, "* Production Dynatrace Alerts")
    | fieldsAdd wfAppci = lower(arrayFirst(splitString(\`dt.automation_engine.workflow.title\`, " ")))
    | summarize itsmWorkflows = countDistinct(\`dt.automation_engine.workflow.id\`), by:{wfAppci}
  ], sourceField:applicationci, lookupField:wfAppci, fields:{itsmWorkflows}

// CI/CD + DORA: GitHub Actions deployments (last 30 days), per AppCI
//   source: dashboard "GitHub Actions DORA Metrics" (CUSTOM_DEPLOYMENT / cdk deploy events)
| lookup [
    fetch events, from:now()-30d
    | filter event.type == "CUSTOM_DEPLOYMENT"
    | filter \`cdk-command\` == "deploy"
    | filter isNotNull(application_ci)
    | fieldsAdd leadMs = if(\`new-deployment\` == "true" and isNotNull(\`avg-release-age\`), toLong(\`avg-release-age\`), else: null)
    | summarize
        deployTotal = count(),
        deploySuccess = countIf(\`workflow-outcome\` == "success"),
        avgLeadMs = avg(leadMs),
        by:{appci = lower(application_ci)}
  ], sourceField:applicationci, lookupField:appci, fields:{deployTotal, deploySuccess, avgLeadMs}

// Null-safe defaults
| fieldsAdd
    correlated = if(isNull(correlated), 0, else: correlated),
    itsmWorkflows = if(isNull(itsmWorkflows), 0, else: itsmWorkflows),
    total7d = if(isNull(total7d), 0, else: total7d),
    causalActive = if(isNull(causalActive), 0, else: causalActive),
    causalClosed = if(isNull(causalClosed), 0, else: causalClosed),
    causalTotal = if(isNull(causalTotal), 0, else: causalTotal),
    causalWithCause = if(isNull(causalWithCause), 0, else: causalWithCause),
    noiseTotal = if(isNull(noiseTotal), 0, else: noiseTotal),
    deployTotal = if(isNull(deployTotal), 0, else: deployTotal),
    deploySuccess = if(isNull(deploySuccess), 0, else: deploySuccess),
    avgLeadMs = if(isNull(avgLeadMs), 0.0, else: avgLeadMs)

| fieldsAdd avgLeadDays = round(avgLeadMs / 86400000.0, decimals:1)
| fieldsAdd noisePct = if(total7d > 0,
    round(toDouble(noiseTotal) * 100.0 / toDouble(total7d), decimals:0),
    else: 0.0)
| fieldsAdd rootCausePct = if(causalTotal > 0,
    round(toDouble(causalWithCause) * 100.0 / toDouble(causalTotal), decimals:0),
    else: 0.0)

// Compute status
| fieldsAdd
    \`1. Causal AI Detection + Event Correlation\` = if(causalTotal > 0,
        concat("pass ", toString(causalTotal), " problems (",
            toString(causalActive), " active, ", toString(causalClosed), " closed), ",
            toString(correlated), " correlated"),
        else: "fail No causal problems in last 7 days"),
    \`2. CI/CD Integration\` = if(deployTotal > 0,
        concat("pass ", toString(deploySuccess), "/", toString(deployTotal), " successful deploys (30d)"),
        else: "fail No deployments detected"),
    \`3. ITSM Integration\` = if(itsmWorkflows > 0,
        concat("pass ", toString(itsmWorkflows), " alert routing workflow(s)"),
        else: "fail No 'Production Dynatrace Alerts' workflow"),
    \`4. Runbooks Linked\` = "fail Not detected",
    \`5. Alert Noise Review\` = if(total7d > 0,
        concat(if(noisePct > 50, "warn ", else: "pass "),
            toString(noiseTotal), " noise / ", toString(total7d),
            " problems (", toString(noisePct), "%)"),
        else: "n/a No problems in last 7 days"),
    \`6. Problems with Root Cause\` = if(causalTotal > 0,
        concat(
            if(rootCausePct >= 40, "pass ", else: if(rootCausePct >= 30, "warn ", else: "fail ")),
            toString(causalWithCause), "/", toString(causalTotal),
            " w/ root cause (", toString(rootCausePct), "%)"),
        else: "n/a No problems in last 7 days"),
    \`7. DORA Metrics\` = if(deployTotal > 0,
        concat("pass ", toString(deployTotal), " deploys, ", toString(avgLeadDays), "d avg lead time"),
        else: "fail No deployment data")

| fieldsAdd passCount =
    if(causalTotal > 0, 1, else: 0)
    + if(deployTotal > 0, 1, else: 0)
    + if(itsmWorkflows > 0, 1, else: 0)
    + 0
    + if(total7d > 0 and noisePct <= 50, 1, else: 0)
    + if(causalTotal > 0 and rootCausePct >= 40, 1, else: 0)
    + if(deployTotal > 0, 1, else: 0)
| fieldsAdd \`L3 Score\` = concat(toString(passCount), " / 7")

| fields
    \`L3 Score\`,
    \`1. Causal AI Detection + Event Correlation\`,
    \`2. CI/CD Integration\`,
    \`3. ITSM Integration\`,
    \`4. Runbooks Linked\`,
    \`5. Alert Noise Review\`,
    \`6. Problems with Root Cause\`,
    \`7. DORA Metrics\``;

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
    <Flex flexDirection="column" gap={20} padding={16}>
      <Heading level={3}>SRE Maturity Level Scorecards</Heading>

      <AppContextBanner appCI={appCI} />

      <OverallScore queries={[
        { label: "L1 Observability", query: l1Query, color: "#3BACF0" },
        { label: "L2 Reliability", query: l2Query, color: "#1966FF" },
        { label: "L3 AI Ops", query: l3Query, color: "#5E28E5" },
        { label: "L4 Proactive", query: l4Query, color: "#8D1CDC" },
        { label: "L5 Autonomous", query: l5Query, color: "#49C2B3" },
      ]} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, alignItems: "stretch" }}>
        <ScorecardCard title="L1 — Full Observability" query={l1Query} accentColor="#3BACF0" />
        <ScorecardCard title="L2 — Measured Reliability" query={l2Query} accentColor="#1966FF" />
        <ScorecardCard title="L3 — AI-Assisted Operations" query={l3Query} accentColor="#5E28E5" />
        <ScorecardCard title="L4 — Proactive Reliability" query={l4Query} accentColor="#8D1CDC" />
        <ScorecardCard title="L5 — Autonomous Reliability" query={l5Query} accentColor="#49C2B3" />
      </div>
    </Flex>
  );
};
