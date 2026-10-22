// Shared DQL for resolving an application's AppCI, plus the bulk maturity queries built on it.
//
// WHY ONE FILE WITH NO IMPORTS: the daily snapshot workflow embeds these exact queries. The
// workflow cannot import app code, so scripts/generate-snapshot-workflow.mjs loads this module
// directly with Node's built-in TypeScript type stripping (Node 24+). That only works if the file
// has no imports and uses erasable TypeScript only. Keeping the app and the workflow on one source
// removes the drift that previously left the deployed workflow on stale scoring logic.
//
// HOW AN APPCI IS RESOLVED. The scorecards key everything on a 3-letter AppCI. Two sources are
// combined (a union, so a tenant that already tags `applicationci:<code>` keeps working):
//   1. An `applicationci:<code>` entity tag, as the app has always read it.
//   2. An `Application:<Name>` entity tag, translated to a code through the app-managed lookup
//      /lookups/appci_map (columns app_name, applicationci; edited on the Lookups tab).
// The environment suffix is dropped before matching, so `Application:BillingPortal\:\:CRT`,
// `...\:\:SPT` and `...\:\:PRD` all resolve through one map row, `billingportal`.

export const APPCI_MAP_PATH = "/lookups/appci_map";

// DQL expression: the application name in the first `Application:<Name>[::<ENV>]` tag of an array
// field (`tags[]` on entities, `entity_tags[]` on problems), lower-cased, backslashes and the
// environment suffix removed. Null when there is no such tag. Shared by the resolver and the coverage
// report so "what counts as the application name" is defined once.
// `\\\\` in this template is the DQL string "\\", i.e. one backslash (Dynatrace stores the colons of a
// tag value escaped, so `Application:Gateway\:\:PRD` is stripped of backslashes before splitting).
export const applicationNameFromValue = (valueExpr: string): string =>
  `lower(arrayFirst(splitString(replaceString(${valueExpr}, "\\\\", ""), "::")))`;

export const applicationNameExpr = (tagsArray: string): string =>
  applicationNameFromValue(
    `arrayFirst(arrayRemoveNulls(iCollectArray(if(startsWith(lower(${tagsArray}[]), "application:"), substring(${tagsArray}[], from: 12)))))`
  );

// Looks up the AppCI for an application name held in `nameField`, exposing it as `mappedField`.
const appciMapLookup = (nameField = "appciName", mappedField = "appciMapped") => `| lookup [
    load "${APPCI_MAP_PATH}"
    | fields app_name, applicationci
  ], sourceField:${nameField}, lookupField:app_name, fields:{${mappedField} = applicationci}`;

// Application names found in Application tags on `entityFetch` that resolve to NO AppCI: they have no
// `applicationci:` tag and no row in the map. These are the names to add on Lookups > AppCI map.
// Uses the same name expression and map lookup as the resolver, so "unmapped" here means exactly
// "the scorecards cannot see this entity".
export const unmappedApplicationsQuery = (entityFetch: string): string => `${entityFetch}
| fieldsAdd appciName = ${applicationNameExpr("tags")}
| fieldsAdd hasAppciTag = arraySize(arrayRemoveNulls(iCollectArray(if(matchesPhrase(tags[], "*applicationci*"), tags[])))) > 0
| filter isNotNull(appciName) and not hasAppciTag
${appciMapLookup()}
| filter isNull(appciMapped)
| summarize entities = count(), by:{appciName}
| sort entities desc
| limit 500`;

// Every row of the map, for checking that each AppCI it points at exists in the CMDB table.
export const APPCI_MAP_ROWS_QUERY = `load "${APPCI_MAP_PATH}"
| fields app_name, applicationci
| limit 10000`;

// Drop-in replacement for the two `fieldsAdd applicationci = ...` statements that precede `| expand
// applicationci` on any entity fetch (dt.entity.*). Leaves `applicationci` as an array of codes.
// Options rename the input array and the output so the macro can run where `tags` / `applicationci` are
// already taken, for example on `entityAttr(...)` output inside a join. `prefix` names the temporary fields.
export interface AppciFromTagsOptions {
  tagsField?: string;
  outField?: string;
  prefix?: string;
}
export const appciFromEntityTags = ({ tagsField = "tags", outField = "applicationci", prefix = "appci" }: AppciFromTagsOptions = {}): string => `| fieldsAdd ${prefix}Tagged = arrayDistinct(
    iCollectArray(
      splitString(
        arrayRemoveNulls(
          iCollectArray(
            if(matchesPhrase(${tagsField}[], "*applicationci*"), lower(${tagsField}[]))
          )
        )[], ":"
      )[1]
    )
  )
| fieldsAdd ${prefix}Name = ${applicationNameExpr(tagsField)}
${appciMapLookup(`${prefix}Name`, `${prefix}Mapped`)}
| fieldsAdd ${outField} = arrayDistinct(
    iCollectArray(
      splitString(
        arrayConcat(${prefix}Tagged, if(isNotNull(${prefix}Mapped), array(lower(${prefix}Mapped)), else: array()))[], ","
      )[0]
    )
  )
| fieldsRemove ${prefix}Tagged, ${prefix}Name, ${prefix}Mapped`;

// For a tag MAP value (Smartscape nodes: `tags[Application]`) instead of an array of "key:value" strings.
// Adds `${nameField}` (normalized application name) and `${mappedField}` (the map's AppCI, or null).
// A node tagged with several values returns a list ( ["Care Manager", "Care Manager::PRD"] ) whose text form
// broke the name, so brackets and quotes are stripped and the first value is used.
export const appciMappedFromTagValue = (valueExpr: string, nameField = "appciName", mappedField = "appciMapped"): string =>
  `| fieldsAdd ${nameField} = ${applicationNameFromValue(
    `trim(arrayFirst(splitString(replaceString(replaceString(replaceString(toString(${valueExpr}), "[", ""), "]", ""), "\\"", ""), ",")))`
  )}
${appciMapLookup(nameField, mappedField)}`;

// Drop-in replacement for `| fieldsAdd appci = splitString(splitString(toString(entity_tags), ...))`
// on dt.davis.problems. Leaves a single lower-case `appci`: the `applicationci:` tag if present,
// otherwise the code mapped from the problem's first `Application:` tag.
export const appciFromProblemTags = (): string => `| fieldsAdd appci = splitString(splitString(toString(entity_tags), "applicationci:")[1], "\\"")[0]
| fieldsAdd appciName = ${applicationNameExpr("entity_tags")}
${appciMapLookup()}
| fieldsAdd appci = coalesce(appci, lower(appciMapped))
| fieldsRemove appciName, appciMapped`;

export const CMDB_PATH = "/lookups/dynatrace/cmdb_appci_owner_mapping";

// L2 "SRE Assessment": does this application have a tier? Yes if its CMDB row (the table maintained on the
// Lookups tab, the same one the identity bar and picker read) has a business criticality, OR a ServiceNow
// import event carried a tier in the last 24 hours (the original source, kept so tenants that run that
// import are unaffected). Leaves a numeric `hasTier` (0 = none). Needs `applicationci` on the row.
export const hasTierLookup = (): string => `| lookup [
    load "${CMDB_PATH}"
    | fieldsAdd applicationci = lower(applicationci)
    | filter isNotNull(business_criticality) and trim(business_criticality) != ""
    | summarize hasTierCmdb = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{hasTierCmdb}
| lookup [
    fetch bizevents, from:now()-24h
    | filter event.type == "workflow.import.servicenow.appci"
    | fieldsAdd applicationci = lower(applicationci)
    | filter isNotNull(tier)
    | summarize hasTierImport = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{hasTierImport}
| fieldsAdd hasTier = coalesce(hasTierCmdb, 0) + coalesce(hasTierImport, 0)
| fieldsRemove hasTierCmdb, hasTierImport`;

// L5 workflow checks: which AppCI does an Automation workflow belong to? The original convention is a title
// whose first word IS the 3-letter code. Titles that start with an application name instead ("MemberHub
// Validation", "CrmSuite_PRD open problems alert") resolve through the AppCI map, with a `_PRD` style
// suffix removed. Run on dt.system.events; leaves `${outField}` (null when the title resolves to nothing).
export const appciFromWorkflowTitle = (outField = "applicationci"): string => `| fieldsAdd wfWord = lower(arrayFirst(splitString(\`dt.automation_engine.workflow.title\`, " ")))
| fieldsAdd wfName = lower(arrayFirst(splitString(wfWord, "_")))
${appciMapLookup("wfName", "wfMapped")}
| fieldsAdd ${outField} = if(stringLength(wfWord) == 3, wfWord, else: lower(wfMapped))
| fieldsRemove wfWord, wfName, wfMapped`;

// ── Bulk L1 query: per-app observability signals (matches scorecard L1 logic) ──
// Checks: hosts, services, logs, smartscape(=services), k8s, cloud, rum/synthetics → 7 max
// FIXED (2026-08-29): Cloud was entirely missing (no smartscapeNodes lookup at all)
// and RUM/Synthetics was a hardcoded +0 — both real, computable signals that this
// query simply never fetched, so the leaderboard undercounted L1 for every app.
// Mirrors l1Query in ScorecardsPage.tsx; keep the two in sync.
export const BULK_L1_QUERY = `fetch dt.entity.service
${appciFromEntityTags()}
| expand applicationci
| filter stringLength(applicationci) <= 3
| summarize serviceCount = count(), by:{applicationci}
| lookup [
    fetch dt.entity.host
    | limit 100000
    | filter lifetime[end] > asTimestamp(now()-2h)
    ${appciFromEntityTags()}
    | expand applicationci
    // PaaS-injected hosts (ECS Fargate, EKS Fargate, etc.) never get a
    // monitoringMode value — PaaS OneAgent has no partial mode, it's always
    // full-stack or not present at all — so a null mode here still counts.
    | summarize
        hostCount = count(),
        fullStackCount = countIf(monitoringMode == "FULL_STACK" or isNull(monitoringMode)),
        by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{hostCount, fullStackCount}
| lookup [
    fetch dt.entity.cloud_application
    ${appciFromEntityTags()}
    | expand applicationci
    | summarize k8sCount = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{k8sCount}
| lookup [
    smartscapeNodes K8S_DAEMONSET
    | filter matchesPhrase(k8s.workload.name, "oneagent") and not matchesPhrase(k8s.workload.name, "csi-driver")
    | fieldsAdd applicationci = lower(splitString(k8s.cluster.name, "-")[0])
    | parse k8s.object, "JSON:config"
    | fieldsAdd
        component = \`tags:k8s.labels\`[\`app.kubernetes.io/component\`],
        desired = toLong(config[status][desiredNumberScheduled]),
        ready = toLong(config[status][numberReady])
    | summarize
        cloudNativeOperatorHealthy = countIf(component == "cloudnativefullstack" and desired > 0 and ready == desired),
        by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{cloudNativeOperatorHealthy}
| lookup [
    timeseries reqs = sum(dt.service.request.count), by:{k8s.cluster.name}, from:now()-2h
    | fieldsAdd applicationci = lower(splitString(k8s.cluster.name, "-")[0]),
        total = arraySum(reqs)
    | summarize k8sScopedTracing = sum(total), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{k8sScopedTracing}
| lookup [
    fetch logs, samplingRatio:1000, from:now()-2h
    | filter isNotNull(k8s.cluster.name)
    | fieldsAdd applicationci = lower(splitString(k8s.cluster.name, "-")[0])
    | summarize k8sScopedLogs = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{k8sScopedLogs}
| lookup [
    fetch logs, samplingRatio:1000
    | filter isNotNull(applicationci)
    | summarize logCount = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{logCount}
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
| lookup [
    fetch dt.entity.application, from:now()-1000d
    ${appciFromEntityTags()}
    | expand applicationci
    | fieldsAdd rumActive = if(lifetime[end] > now()-7d, true, else: false)
    | summarize rumCount = countIf(rumActive == true), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{rumCount}
| lookup [
    fetch dt.entity.synthetic_test
    ${appciFromEntityTags()}
    | expand applicationci
    | summarize synCount = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{synCount}
| fieldsAdd
    hostCount = if(isNull(hostCount), 0, else: hostCount),
    serviceCount = if(isNull(serviceCount), 0, else: serviceCount),
    k8sCount = if(isNull(k8sCount), 0, else: k8sCount),
    cloudNativeOperatorHealthy = if(isNull(cloudNativeOperatorHealthy), 0, else: cloudNativeOperatorHealthy),
    k8sScopedTracing = if(isNull(k8sScopedTracing), 0, else: k8sScopedTracing),
    k8sScopedLogs = if(isNull(k8sScopedLogs), 0, else: k8sScopedLogs),
    logCount = if(isNull(logCount), 0, else: logCount),
    cloudCount = if(isNull(cloudCount), 0, else: cloudCount),
    rumCount = if(isNull(rumCount), 0, else: rumCount),
    synCount = if(isNull(synCount), 0, else: synCount)
| fieldsAdd k8sHealthy = cloudNativeOperatorHealthy > 0 and k8sScopedTracing > 0 and k8sScopedLogs > 0
| fieldsAdd l1Score =
    if(hostCount > 0, 1, else: 0)
    + if(serviceCount > 0, 1, else: 0)
    + if(logCount > 0, 1, else: 0)
    + if(serviceCount > 0, 1, else: 0)
    + if(k8sCount == 0 or k8sHealthy, 1, else: 0)
    + 1
    + if(rumCount > 0 or synCount > 0, 1, else: 0)
| fields applicationci, l1Score, serviceCount, hostCount, k8sCount, logCount`;

// ── Bulk L2: per-app measured reliability signals ──
// Checks: golden signals, SLOs, guardians, dashboards, SRE assessment, critical services → 6 max
// FIXED (2026-08-29): SLOs and Guardians were both hardcoded +0 despite being plain
// DQL lookups (no REST call needed) — trivial to add, previously just never wired.
// Critical Services Tagged is new: see /lookups/critical_services in ScorecardsPage.tsx.
// Mirrors l2Query in ScorecardsPage.tsx; keep the two in sync.
export const BULK_L2_QUERY = `fetch dt.entity.service
${appciFromEntityTags()}
| expand applicationci
| filter stringLength(applicationci) <= 3
| summarize serviceCount = count(), by:{applicationci}
| lookup [
    load "/lookups/slo-dashboards"
    | fieldsAdd appci = lower(appci)
    | summarize dashboardCount = count(), by:{appci}
  ], sourceField:applicationci, lookupField:appci, fields:{dashboardCount}
${hasTierLookup()}
| lookup [
    load "/lookups/slo"
    | fieldsAdd appci = lower(substring(slo, from:0, to:3))
    | summarize sloCount = count(), by:{appci}
  ], sourceField:applicationci, lookupField:appci, fields:{sloCount}
| lookup [
    load "/lookups/guardians"
    | fieldsAdd appci = lower(appci)
    | summarize guardianCount = count(), by:{appci}
  ], sourceField:applicationci, lookupField:appci, fields:{guardianCount}
| lookup [
    load "/lookups/critical_services"
    | fieldsAdd appci = lower(appci)
    | summarize criticalCount = count(), resolved = countIf(entity_ids != "-"), by:{appci}
  ], sourceField:applicationci, lookupField:appci, fields:{criticalCount, resolved}
| fieldsAdd
    dashboardCount = if(isNull(dashboardCount), 0, else: dashboardCount),
    hasTier = if(isNull(hasTier), 0, else: hasTier),
    sloCount = if(isNull(sloCount), 0, else: sloCount),
    guardianCount = if(isNull(guardianCount), 0, else: guardianCount),
    criticalCount = if(isNull(criticalCount), 0, else: criticalCount),
    resolved = if(isNull(resolved), 0, else: resolved)
| fieldsAdd l2Score =
    if(serviceCount > 0, 1, else: 0)
    + if(sloCount > 0, 1, else: 0)
    + if(guardianCount > 0, 1, else: 0)
    + if(dashboardCount > 0, 1, else: 0)
    + if(hasTier > 0, 1, else: 0)
    + if(resolved > 0 or criticalCount == 0, 1, else: 0)
| fields applicationci, l2Score`;

// ── Bulk L3: per-app AI ops signals ──
// Checks: causal AI, CI/CD, ITSM routing, runbooks(0 — needs the Documents API,
// which is per-app only via app function), alert noise, root cause, DORA → 7 max.
// FIXED (2026-08-28): this previously returned a hardcoded l3Score = 0 for every
// app — the comment claimed Davis auth was missing, but the L3 scorecard queries
// dt.davis.problems successfully, so the leaderboard's L3 column was simply blank
// for all 563 applications. Mirrors l3Query in ScorecardsPage.tsx.
//
// Runbooks Linked is NOT computed in this DQL query — the Documents API it
// depends on has no Grail equivalent. FIXED (2026-08-29): it's no longer a
// permanent 0 either. getAllRunbookCounts (a bulk sibling of the modal's
// getRunbookDetail) reads the Documents API once for every AppCI in the
// tenant, and its result is merged into l3Score client-side, below.
export const BULK_L3_QUERY = `fetch dt.entity.service
${appciFromEntityTags()}
| expand applicationci
| filter stringLength(applicationci) <= 3
| summarize svcCount = count(), by:{applicationci}
| lookup [
    fetch dt.davis.problems, from:now()-7d
    | filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
    ${appciFromProblemTags()}
    | filter isNotNull(appci)
    | fieldsAdd eventCount = arraySize(dt.davis.event_ids)
    | fieldsAdd isCausal = matchesValue(event.category, array("ERROR", "SLOWDOWN")) and eventCount > 1
    | fieldsAdd isNoise = eventCount == 1 and matchesValue(event.category, array("AVAILABILITY", "RESOURCE_CONTENTION", "CUSTOM_ALERT", "MONITORING_UNAVAILABLE"))
    | summarize
        total7d = count(),
        causalTotal = countIf(isCausal),
        causalWithCause = countIf(isCausal and isNotNull(root_cause_entity_id)),
        noiseTotal = countIf(isNoise),
        by:{appci}
  ], sourceField:applicationci, lookupField:appci, fields:{total7d, causalTotal, causalWithCause, noiseTotal}
| lookup [
    fetch events, from:now()-30d
    | filter event.type == "CUSTOM_DEPLOYMENT"
    | filter isNotNull(application_ci)
    | summarize deployTotal = count(), by:{appci = lower(application_ci)}
  ], sourceField:applicationci, lookupField:appci, fields:{deployTotal}
| lookup [
    fetch dt.system.events, from:now()-30d
    | filter event.provider == "AUTOMATION_ENGINE"
    | filter event.kind == "WORKFLOW_EVENT" and event.type == "WORKFLOW_EXECUTION"
    | filter matchesValue(\`dt.automation_engine.workflow.title\`, "* Production Dynatrace Alerts")
    | fieldsAdd wfAppci = lower(arrayFirst(splitString(\`dt.automation_engine.workflow.title\`, " ")))
    | summarize itsmWorkflows = countDistinct(\`dt.automation_engine.workflow.id\`), by:{wfAppci}
  ], sourceField:applicationci, lookupField:wfAppci, fields:{itsmWorkflows}
| fieldsAdd
    total7d = if(isNull(total7d), 0, else: total7d),
    causalTotal = if(isNull(causalTotal), 0, else: causalTotal),
    causalWithCause = if(isNull(causalWithCause), 0, else: causalWithCause),
    noiseTotal = if(isNull(noiseTotal), 0, else: noiseTotal),
    deployTotal = if(isNull(deployTotal), 0, else: deployTotal),
    itsmWorkflows = if(isNull(itsmWorkflows), 0, else: itsmWorkflows)
| fieldsAdd noisePct = if(total7d > 0, round(toDouble(noiseTotal) * 100.0 / toDouble(total7d), decimals:0), else: 0.0)
| fieldsAdd rootCausePct = if(causalTotal > 0, round(toDouble(causalWithCause) * 100.0 / toDouble(causalTotal), decimals:0), else: 0.0)
| fieldsAdd l3Score =
    if(causalTotal > 0, 1, else: 0)
    + if(deployTotal > 0, 1, else: 0)
    + if(itsmWorkflows > 0, 1, else: 0)
    + 0
    + if(total7d == 0 or noisePct <= 50, 1, else: 0)
    + if(causalTotal == 0 or rootCausePct >= 40, 1, else: 0)
    + if(deployTotal > 0, 1, else: 0)
| fields applicationci, l3Score`;

// ── Bulk L4: per-app proactive signals ──
// Checks: burn-rate alerting, dynamic scaling/K8s autoscaling, predictive
// forecasting(0 — not adopted tenant-wide), release impact tracking,
// error budget gating(0 — no ServiceNow integration) → 5 max.
// Mirrors l4Query in ScorecardsPage.tsx; keep the two in sync.
// Deployment count is deliberately omitted here: it only distinguishes
// warn from fail on release impact, and never contributes to the score.
export const BULK_L4_QUERY = `fetch dt.entity.service
${appciFromEntityTags()}
| expand applicationci
| filter stringLength(applicationci) <= 3
| summarize svcCount = count(), by:{applicationci}
| lookup [
    fetch dt.davis.problems, from:now()-30d
    | filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
    | filter event.category == "CUSTOM_ALERT"
    | filter contains(lower(event.name), "burn rate")
    | fieldsAdd appci = lower(trim(splitString(event.name, " - ")[0]))
    | filter stringLength(appci) == 3
    | summarize burnAlerts = countDistinct(event.name), by:{appci}
  ], sourceField:applicationci, lookupField:appci, fields:{burnAlerts}
| lookup [
    smartscapeNodes "AWS*"
    | fieldsFlatten \`tags:aws\`, fields:{ApplicationCI}
    | filter isNotNull(ApplicationCI)
    | summarize
        cloudTotal = count(),
        scaleTargets = countIf(matchesValue(type, "AWS_AUTOSCALING_AUTOSCALINGGROUP", "AWS_APPLICATIONAUTOSCALING_SCALABLETARGET", "AWS_EKS_NODEGROUP")),
        by:{appci = lower(ApplicationCI)}
  ], sourceField:applicationci, lookupField:appci, fields:{cloudTotal, scaleTargets}
| lookup [
    fetch events, from:now()-30d
    | filter event.kind == "SDLC_EVENT"
    | filter event.type == "validation" and event.status == "finished"
    | fieldsAdd appci = lower(splitString(splitString(dt.srg.tags, "\\"ApplicationCI\\":[\\"")[1], "\\"")[0])
    | filter isNotNull(appci)
    | fieldsAdd trig = coalesce(\`dt.automation_engine.workflow_execution.trigger.type\`, "Manual")
    | summarize srgEventTriggered = countIf(trig != "Schedule" and trig != "Manual"), by:{appci}
  ], sourceField:applicationci, lookupField:appci, fields:{srgEventTriggered}
| fieldsAdd
    burnAlerts = if(isNull(burnAlerts), 0, else: burnAlerts),
    cloudTotal = if(isNull(cloudTotal), 0, else: cloudTotal),
    scaleTargets = if(isNull(scaleTargets), 0, else: scaleTargets),
    srgEventTriggered = if(isNull(srgEventTriggered), 0, else: srgEventTriggered)
| fieldsAdd l4Score =
    if(burnAlerts > 0, 1, else: 0)
    + if(scaleTargets > 0 or cloudTotal == 0, 1, else: 0)
    + 0
    + if(srgEventTriggered > 0, 1, else: 0)
    + 0
| fields applicationci, l4Score`;

// ── Bulk L5: per-app autonomous signals ──
// Checks: repetitive tasks, workflow automation, E2E remediation(0 — not detected),
// incident auto-enrichment, AI postmortem(0 — not detected) → 5 max
// FIXED (2026-08-29): Incident Auto-Enrichment was dropped entirely — this query
// never fetched dt.davis.problems at all, so a real, computable signal always
// scored 0 on the leaderboard. Mirrors l5Query in ScorecardsPage.tsx; keep in sync.
// FIXED (2026-08-30): the workflowCount signal previously counted ANY bizevent
// whose event.type merely contained "workflow" — near-universal noise
// (ServiceNow CMDB import events, other teams' cost/cloud-inventory reporting
// workflows, even the new daily maturity-snapshot bizevent), so nearly every
// app passed regardless of real automation. Now requires an actual Automation
// Engine WORKFLOW_EXECUTION whose title starts with the app's code — same
// convention as the ITSM Integration check (L3 #3).
// FIXED (2026-10-22): the query used to start from workflow executions, so an application with problems but
// no workflows got no row at all and its enrichment credit was lost, while the per-app scorecard (which
// starts from the application) gave it that credit. It now starts from problems, appends the workflow
// counts, and merges, so every application with either signal is scored the same as on the scorecard.
export const BULK_L5_QUERY = `fetch dt.davis.problems
${appciFromProblemTags()}
| filter isNotNull(appci)
| filter dt.davis.is_duplicate == false
| fieldsAdd hasItsmProfile = toString(labels.alerting_profile) != "[\\"Default\\"]"
    and isNotNull(labels.alerting_profile)
| summarize
    totalProblems = count(),
    enrichedProblems = countIf(hasItsmProfile == true),
    by:{applicationci = appci}
| append [
    fetch dt.system.events, from:now()-30d
    | filter event.provider == "AUTOMATION_ENGINE"
    | filter event.kind == "WORKFLOW_EVENT" and event.type == "WORKFLOW_EXECUTION"
    ${appciFromWorkflowTitle()}
    | filter stringLength(applicationci) == 3
    | summarize workflowCount = countDistinct(\`dt.automation_engine.workflow.id\`), by:{applicationci}
  ]
| summarize
    totalProblems = sum(totalProblems),
    enrichedProblems = sum(enrichedProblems),
    workflowCount = sum(workflowCount),
    by:{applicationci}
| filter stringLength(applicationci) <= 3
| fieldsAdd
    totalProblems = if(isNull(totalProblems), 0, else: totalProblems),
    enrichedProblems = if(isNull(enrichedProblems), 0, else: enrichedProblems),
    workflowCount = if(isNull(workflowCount), 0, else: workflowCount)
| fieldsAdd enrichPct = if(totalProblems > 0,
    round(toDouble(enrichedProblems) * 100.0 / toDouble(totalProblems), decimals:0),
    else: 0.0)
| fieldsAdd l5Score =
    if(workflowCount > 0, 1, else: 0)
    + if(workflowCount > 0, 1, else: 0)
    + 0
    + if(totalProblems > 0 and enrichPct >= 50, 1, else: 0)
    + 0
| fields applicationci, l5Score`;
