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

// Signal 4: Kubernetes clusters
// Cluster-name-prefix detection, NOT workload tags — K8s workloads (dt.entity.cloud_application)
// are often tagged with a sub-application's CI (e.g. a shared EKS cluster hosting several
// namespaces), while the cluster itself is named "<appci>-<region>-<env>". Matching on the
// cluster name correctly reflects the parent ApplicationCI for portfolio-style apps.
| lookup [
    fetch dt.entity.kubernetes_cluster
    | fieldsAdd applicationci = lower(splitString(entity.name, "-")[0])
    | summarize k8sClusterCount = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{k8sClusterCount}
| fieldsRename k8sClusters = k8sClusterCount

// Signal 5: Cloud (all AWS/Azure/GCP resources — same smartscapeNodes source as
// the Clouds app, not just EC2/RDS/Lambda, since those undercounted vs. the
// app's actual cloud footprint. Azure/GCP are unioned in for multi-cloud
// readiness even though this tenant is AWS-only today — the tag field names
// for those two (tags:azure, tags:gcp_labels) are inferred from Dynatrace's
// per-provider naming convention since neither has any resources here yet to
// verify against, but a wrong field name just yields 0 rows, not an error.)
| lookup [
    smartscapeNodes "AWS*"
    | fieldsFlatten \`tags:aws\`, fields:{ApplicationCI}
    | append [
        smartscapeNodes "AZURE*"
        | fieldsFlatten \`tags:azure\`, fields:{ApplicationCI}
      ]
    | append [
        smartscapeNodes "GCP*"
        | fieldsFlatten \`tags:gcp_labels\`, fields:{ApplicationCI}
      ]
    | filter isNotNull(ApplicationCI)
    | fieldsAdd applicationci = lower(ApplicationCI)
    | summarize cloudCount = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{cloudCount}
| fieldsRename cloudResources = cloudCount

// Signal 6: RUM
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

// Signal 7: Synthetics
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
    k8sClusters = if(isNull(k8sClusters), 0, else: k8sClusters),
    cloudResources = if(isNull(cloudResources), 0, else: cloudResources),
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
    \`5. Kubernetes\` = if(k8sClusters > 0,
        concat("pass ", toString(k8sClusters), " cluster(s)"),
        else: "n/a N/A"),
    \`6. Cloud\` = if(cloudResources > 0,
        concat("pass ", toString(cloudResources), " resources"),
        else: "n/a N/A"),
    \`7. RUM / Synthetics\` = if(rumApps > 0 or synthetics > 0,
        concat("pass RUM:", toString(rumApps), " Syn:", toString(synthetics)),
        else: "fail Not configured")

| fieldsAdd passCount =
    if(hosts > 0, 1, else: 0)
    + if(services > 0, 1, else: 0)
    + if(logs > 0, 1, else: 0)
    + if(services > 0, 1, else: 0)
    + if(k8sClusters > 0, 1, else: 0)
    + if(cloudResources > 0, 1, else: 0)
    + if(rumApps > 0 or synthetics > 0, 1, else: 0)
| fieldsAdd \`L1 Score\` = concat(toString(passCount), " / 7")

| fields
    \`L1 Score\`,
    \`1. OneAgent Deployed\`,
    \`2. Tracing Validated\`,
    \`3. Logs Correlated\`,
    \`4. Smartscape Discovery\`,
    \`5. Kubernetes\`,
    \`6. Cloud\`,
    \`7. RUM / Synthetics\``;

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

// Signal 3: Site Reliability Guardians (from /lookups/guardians; itemized one row per
//   guardian, refreshed daily at 06:00 UTC by workflow — summarize to a count here)
| lookup [
    load "/lookups/guardians"
    | fieldsAdd appci = lower(appci)
    | summarize guardianCount = count(), by:{appci}
  ], sourceField:applicationci, lookupField:appci, fields:{guardianCount}

// Signal 4: SLO dashboards published (from /lookups/slo-dashboards; itemized one row
//   per dashboard, refreshed daily at 06:00 UTC by workflow — counts dashboards whose
//   name starts with a 3-letter AppCI token and contains "SLO")
| lookup [
    load "/lookups/slo-dashboards"
    | fieldsAdd appci = lower(appci)
    | summarize dashboardCount = count(), by:{appci}
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
        else: "fail No tier data"),
    \`6. Critical Services Tagged\` = "n/a Coming soon — BigPanda/CMDB pipeline pending"

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
    \`5. SRE Assessment in ARD\`,
    \`6. Critical Services Tagged\``;

  const l3Query = `// L3 AI-Assisted Operations - Maturity Scorecard
data record(applicationci = lower("${appCI}"))

// Event correlation signal
//   FIXED (2026-08-28): two bugs. (1) This read arraySize(affected_entities),
//   but affected_entities is null on 100% of dt.davis.problems records in this
//   tenant, so the check reported "0 correlated" for every app, always. The
//   populated field is affected_entity_ids. (2) It ran over the dashboard's
//   default timeframe while every other figure in this check uses 7d, so the
//   numbers shown side by side described different windows. Now aligned to 7d.
| lookup [
    fetch dt.davis.problems, from:now()-7d
    | fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
    | filter isNotNull(appci)
    | filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
    | fieldsAdd isCorrelated = arraySize(affected_entity_ids) > 1
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

// CI/CD + DORA: deployments from any CI/CD platform (last 30 days), per AppCI
//   covers GitHub Actions CDK deployments AND Harness pipeline deployments
//   source: CUSTOM_DEPLOYMENT events (application_ci field required)
| lookup [
    fetch events, from:now()-30d
    | filter event.type == "CUSTOM_DEPLOYMENT"
    | filter isNotNull(application_ci)
    | fieldsAdd leadMs = if(\`new-deployment\` == "true" and isNotNull(\`avg-release-age\`), toLong(\`avg-release-age\`), else: null)
    | summarize
        deployTotal = count(),
        deploySuccess = countIf(\`workflow-outcome\` == "success"),
        avgLeadMs = avg(leadMs),
        by:{appci = lower(application_ci)}
  ], sourceField:applicationci, lookupField:appci, fields:{deployTotal, deploySuccess, avgLeadMs}

// Runbooks Linked: notebooks acting as runbooks (from /lookups/runbooks; refreshed daily by workflow)
//   counts notebooks whose name starts with a 3-letter AppCI token and contains "Runbook" (any case)
| lookup [
    load "/lookups/runbooks"
    | fieldsAdd appci = lower(appci)
  ], sourceField:applicationci, lookupField:appci, fields:{runbookCount}
| fieldsRename runbooks = runbookCount

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
    avgLeadMs = if(isNull(avgLeadMs), 0.0, else: avgLeadMs),
    runbooks = if(isNull(runbooks), 0, else: toLong(runbooks))

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
    \`4. Runbooks Linked\` = if(runbooks > 0,
        concat("pass ", toString(runbooks), " runbook(s)"),
        else: "fail No AppCI runbooks"),
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
    + if(runbooks > 0, 1, else: 0)
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

// Signal 1: SLO burn-rate alerts (30d)
//   Davis CUSTOM_ALERT problems raised by SLO burn-rate metric events. Alert names
//   follow the tenant convention "<APPCI> - SLO <name> for Availability or Performance
//   Burn Rate is above <threshold>", so the AppCI is the 3-char token before " - ".
//   CAVEAT: this detects burn-rate alerts that FIRED, not alert configs that exist.
//   A correctly-configured alert on a consistently healthy SLO will not appear here
//   (alert configs live in anomaly-detector settings objects, not queryable in DQL).
| lookup [
    fetch dt.davis.problems, from:now()-30d
    | filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
    | filter event.category == "CUSTOM_ALERT"
    | filter contains(lower(event.name), "burn rate")
    | fieldsAdd appci = lower(trim(splitString(event.name, " - ")[0]))
    | filter stringLength(appci) == 3
    | summarize burnAlerts = countDistinct(event.name), burnFired = count(), by:{appci}
  ], sourceField:applicationci, lookupField:appci, fields:{burnAlerts, burnFired}

// Signal 2: Autoscaling constructs + total cloud footprint
//   Counts real autoscaling entities, not a generic cloud-resource tally: EC2/EKS Auto
//   Scaling Groups, Application Auto Scaling scalable targets (ECS service autoscaling),
//   and EKS managed nodegroups. cloudTotal is carried alongside so the check can tell
//   "no cloud at all" (n/a) apart from "has cloud but nothing autoscales" (fail).
//   KNOWN GAP: in-cluster autoscalers (HPA, KEDA, Karpenter) are not represented here —
//   they live in K8s workload YAML, which needs a separate per-mechanism evaluation.
| lookup [
    smartscapeNodes "AWS*"
    | fieldsFlatten \`tags:aws\`, fields:{ApplicationCI}
    | filter isNotNull(ApplicationCI)
    | summarize
        cloudTotal = count(),
        asgCount = countIf(type == "AWS_AUTOSCALING_AUTOSCALINGGROUP"),
        ecsScale = countIf(type == "AWS_APPLICATIONAUTOSCALING_SCALABLETARGET"),
        ngCount = countIf(type == "AWS_EKS_NODEGROUP"),
        by:{appci = lower(ApplicationCI)}
  ], sourceField:applicationci, lookupField:appci, fields:{cloudTotal, asgCount, ecsScale, ngCount}

// Signal 3: Deployments (30d) — same CUSTOM_DEPLOYMENT source as the L3 CI/CD check
| lookup [
    fetch events, from:now()-30d
    | filter event.type == "CUSTOM_DEPLOYMENT"
    | filter isNotNull(application_ci)
    | summarize deployCount = count(), by:{appci = lower(application_ci)}
  ], sourceField:applicationci, lookupField:appci, fields:{deployCount}

// Signal 4: Site Reliability Guardian validations (30d)
//   SRG emits SDLC_EVENT validation events carrying dt.srg.tags with the ApplicationCI.
//   trigger.type distinguishes a guardian fired BY a deployment (the L4 goal) from one
//   merely running on a cron schedule.
| lookup [
    fetch events, from:now()-30d
    | filter event.kind == "SDLC_EVENT"
    | filter event.type == "validation" and event.status == "finished"
    | fieldsAdd appci = lower(splitString(splitString(dt.srg.tags, "\\"ApplicationCI\\":[\\"")[1], "\\"")[0])
    | filter isNotNull(appci)
    | fieldsAdd trig = coalesce(\`dt.automation_engine.workflow_execution.trigger.type\`, "Manual")
    | summarize
        srgRuns = count(),
        srgEventTriggered = countIf(trig != "Schedule" and trig != "Manual"),
        by:{appci}
  ], sourceField:applicationci, lookupField:appci, fields:{srgRuns, srgEventTriggered}

// Null-safe defaults
| fieldsAdd
    burnAlerts = if(isNull(burnAlerts), 0, else: burnAlerts),
    burnFired = if(isNull(burnFired), 0, else: burnFired),
    cloudTotal = if(isNull(cloudTotal), 0, else: cloudTotal),
    asgCount = if(isNull(asgCount), 0, else: asgCount),
    ecsScale = if(isNull(ecsScale), 0, else: ecsScale),
    ngCount = if(isNull(ngCount), 0, else: ngCount),
    deployCount = if(isNull(deployCount), 0, else: deployCount),
    srgRuns = if(isNull(srgRuns), 0, else: srgRuns),
    srgEventTriggered = if(isNull(srgEventTriggered), 0, else: srgEventTriggered)
| fieldsAdd scaleTargets = asgCount + ecsScale + ngCount

// Compute status
| fieldsAdd
    \`1. SLO Burn Rate Alerting\` = if(burnAlerts > 0,
        concat("pass ", toString(burnAlerts), " burn-rate alert(s), ",
            toString(burnFired), " fired (30d)"),
        else: "fail No SLO burn-rate alerts fired (30d)"),
    \`2. Dynamic Scaling / K8s Autoscaling\` = if(scaleTargets > 0,
        concat("pass ", toString(scaleTargets), " autoscaling target(s): ",
            toString(asgCount), " ASG / ", toString(ecsScale), " ECS / ",
            toString(ngCount), " nodegroup"),
        else: if(cloudTotal > 0,
            concat("fail ", toString(cloudTotal), " cloud resources, none autoscaling"),
            else: "n/a No cloud footprint for this app")),
    \`3. Predictive Forecasting\` = "fail Davis forecasting not adopted",
    \`4. Release Impact Tracking\` = if(srgEventTriggered > 0,
        concat("pass ", toString(srgEventTriggered), " deploy-triggered guardian run(s) (30d)"),
        else: if(srgRuns > 0 and deployCount > 0,
            concat("warn ", toString(srgRuns), " scheduled guardian runs / ",
                toString(deployCount), " deploys — not deploy-triggered"),
            else: if(srgRuns > 0,
                concat("warn ", toString(srgRuns), " scheduled guardian runs, no deploys (30d)"),
                else: if(deployCount > 0,
                    concat("fail ", toString(deployCount), " deploys, no guardian validation"),
                    else: "fail No deployments or guardian validations (30d)")))),
    \`5. Error Budget Gating\` = "fail Error budget not sent to change management"

// Only a genuine pass scores. warn / n/a / fail all score 0 against a fixed denominator
// of 5, so the two capability gaps (forecasting, gating) stay visible as red.
| fieldsAdd passCount =
    if(burnAlerts > 0, 1, else: 0)
    + if(scaleTargets > 0, 1, else: 0)
    + 0
    + if(srgEventTriggered > 0, 1, else: 0)
    + 0
| fieldsAdd \`L4 Score\` = concat(toString(passCount), " / 5")

| fields
    \`L4 Score\`,
    \`1. SLO Burn Rate Alerting\`,
    \`2. Dynamic Scaling / K8s Autoscaling\`,
    \`3. Predictive Forecasting\`,
    \`4. Release Impact Tracking\`,
    \`5. Error Budget Gating\``;

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
        <ScorecardCard title="L1 — Full Observability" query={l1Query} accentColor="#3BACF0" appCI={appCI} />
        <ScorecardCard title="L2 — Measured Reliability" query={l2Query} accentColor="#1966FF" appCI={appCI} />
        <ScorecardCard title="L3 — AI-Assisted Operations" query={l3Query} accentColor="#5E28E5" appCI={appCI} />
        <ScorecardCard title="L4 — Proactive Reliability" query={l4Query} accentColor="#8D1CDC" appCI={appCI} />
        <ScorecardCard title="L5 — Autonomous Reliability" query={l5Query} accentColor="#49C2B3" appCI={appCI} />
      </div>
    </Flex>
  );
};
