// Shared DQL for resolving an application's application ID, plus the bulk maturity queries built on it.
//
// WHY ONE FILE WITH NO IMPORTS: the daily snapshot workflow embeds these exact queries. The
// workflow cannot import app code, so scripts/generate-snapshot-workflow.mjs loads this module
// directly with Node's built-in TypeScript type stripping (Node 24+). That only works if the file
// has no imports and uses erasable TypeScript only. Keeping the app and the workflow on one source
// removes the drift that previously left the deployed workflow on stale scoring logic.
//
// HOW AN APP_ID IS RESOLVED. The scorecards key everything on a 3-letter application ID. Two sources are
// combined (a union, so a tenant that already tags `${APP_ID}:<code>` keeps working):
//   1. An `${APP_ID}:<code>` entity tag, as the app has always read it.
//   2. An `Application:<Name>` entity tag, translated to a code through the app-managed lookup
//      /lookups/dtsrepoweredapp/app_map (columns app_name, applicationci; edited on the Lookups tab).
// The environment suffix is dropped before matching, so `Application:BillingPortal\:\:CRT`,
// `...\:\:SPT` and `...\:\:PRD` all resolve through one map row, `billingportal`.


// ── Settings (published by ui/app/settings/appSettings.ts, or by the workflow generator) ──
// APP_ID is the customer's application identifier field (entity tag key, DQL alias, ID column of app-managed
// lookups). LOAD.<table> is `load "<their path>"` plus a rename of their columns to the names used below.
// Lookup tables are at the fixed /lookups/dtsrepoweredapp/ location; the identifier defaults to appId.
type SreConfigShape = { appIdField: string; tagKeys: string[]; tagKeysRuntime: boolean; cloudTagKey: string; idMaxLength: number; sloIdFromColumn: boolean; loads: Record<string, string>; paths: Record<string, string> };
const SRE_CONFIG = (globalThis as unknown as Record<string, SreConfigShape | undefined>)["__SRE_CONFIG__"];
if (!SRE_CONFIG) throw new Error("maturityQueries: settings were not published before this module loaded (import settings/appSettings first).");
export const APP_ID = SRE_CONFIG.appIdField;   // DQL alias of the resolved application ID: always "appId"
/** Entity tag keys that carry the application ID; any one of them identifies the application. */
export const TAG_KEYS = SRE_CONFIG.tagKeys;
const TAG_KEYS_RUNTIME = SRE_CONFIG.tagKeysRuntime;
export const LOAD = SRE_CONFIG.loads;
export const CLOUD_TAG = SRE_CONFIG.cloudTagKey;
export const ID_MAX = SRE_CONFIG.idMaxLength;
/** DQL expression giving each /lookups/dtsrepoweredapp/slo row's application ID: its ID column when mapped, else the first 3 characters of the name. */
export const SLO_APP_ID_EXPR = SRE_CONFIG.sloIdFromColumn ? "lower(appId)" : "lower(substring(slo, from:0, to:3))";
export const SLO_ID_FROM_COLUMN = SRE_CONFIG.sloIdFromColumn;
export const LOOKUP_PATHS = SRE_CONFIG.paths;

export const APP_ID_MAP_PATH = LOOKUP_PATHS["appciMap"];

// ── Tag keys ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// The customer may carry the application ID under several tag keys. These helpers are the only places that turn the key
// list into DQL. When a workflow is generated the keys are not known yet, so the helpers leave a marker that the workflow
// expands at run time from /lookups/dtsrepoweredapp/config (applyAppConfig in scripts/workflow-scripts/_runtime-config.snippet.js).

/** DQL condition: some element of the tag array `arrayExpr` (e.g. `tags[]`) mentions one of the tag keys. */
export const tagKeyHit = (arrayExpr: string): string => {
  if (TAG_KEYS_RUNTIME) return `__TAGHIT__(${arrayExpr})`;
  const one = (k: string) => `matchesPhrase(${arrayExpr}, "*${k}*")`;
  return TAG_KEYS.length === 1 ? one(TAG_KEYS[0]) : `(${TAG_KEYS.map(one).join(" or ")})`;
};

/** DQL lines that put the application ID found under any tag key in `field` (an array of "key:value" tags) into `appId`. */
export const parseAppIdFromTags = (field = "tags"): string => {
  if (TAG_KEYS.length === 1) return `| parse ${field}, "'${TAG_KEYS[0]}:' LD:appId"`;
  const names = TAG_KEYS.map((_, i) => `appIdTag${i}`);
  return [
    ...TAG_KEYS.map((k, i) => `| parse ${field}, "'${k}:' LD:${names[i]}"`),
    `| fieldsAdd appId = coalesce(${names.join(", ")})`,
    `| fieldsRemove ${names.join(", ")}`,
  ].join("\n");
};

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

// Looks up the application ID for an application name held in `nameField`, exposing it as `mappedField`.
const appIdMapLookup = (nameField = "appIdName", mappedField = "appIdMapped") => `| lookup [
    ${LOAD.appciMap}
    | fields app_name, ${APP_ID}
  ], sourceField:${nameField}, lookupField:app_name, fields:{${mappedField} = ${APP_ID}}`;

// Application names found in Application tags on `entityFetch` that resolve to NO application ID: they have no
// `${APP_ID}:` tag and no row in the map. These are the names to add on Lookups > application ID map.
// Uses the same name expression and map lookup as the resolver, so "unmapped" here means exactly
// "the scorecards cannot see this entity".
export const unmappedApplicationsQuery = (entityFetch: string): string => `${entityFetch}
| fieldsAdd appIdName = ${applicationNameExpr("tags")}
| fieldsAdd hasAppIdTag = arraySize(arrayRemoveNulls(iCollectArray(if(${tagKeyHit("tags[]")}, tags[])))) > 0
| filter isNotNull(appIdName) and not hasAppIdTag
${appIdMapLookup()}
| filter isNull(appIdMapped)
| summarize entities = count(), by:{appIdName}
| sort entities desc
| limit 500`;

// Every row of the map, for checking that each application ID it points at exists in the CMDB table.
export const APP_ID_MAP_ROWS_QUERY = `${LOAD.appciMap}
| fields app_name, ${APP_ID}
| limit 10000`;

// Drop-in replacement for the two `fieldsAdd ${APP_ID} = ...` statements that precede `| expand
// ${APP_ID}` on any entity fetch (dt.entity.*). Leaves `${APP_ID}` as an array of codes.
// Options rename the input array and the output so the macro can run where `tags` / `${APP_ID}` are
// already taken, for example on `entityAttr(...)` output inside a join. `prefix` names the temporary fields.
export interface AppIdFromTagsOptions {
  tagsField?: string;
  outField?: string;
  prefix?: string;
}
export const appIdFromEntityTags = ({ tagsField = "tags", outField = `${APP_ID}`, prefix = "appId" }: AppIdFromTagsOptions = {}): string => `| fieldsAdd ${prefix}Tagged = arrayDistinct(
    iCollectArray(
      splitString(
        arrayRemoveNulls(
          iCollectArray(
            if(${tagKeyHit(`${tagsField}[]`)}, lower(${tagsField}[]))
          )
        )[], ":"
      )[1]
    )
  )
| fieldsAdd ${prefix}Name = ${applicationNameExpr(tagsField)}
${appIdMapLookup(`${prefix}Name`, `${prefix}Mapped`)}
| fieldsAdd ${outField} = arrayDistinct(
    iCollectArray(
      splitString(
        arrayConcat(${prefix}Tagged, if(isNotNull(${prefix}Mapped), array(lower(${prefix}Mapped)), else: array()))[], ","
      )[0]
    )
  )
| fieldsRemove ${prefix}Tagged, ${prefix}Name, ${prefix}Mapped`;

// For a tag MAP value (Smartscape nodes: `tags[Application]`) instead of an array of "key:value" strings.
// Adds `${nameField}` (normalized application name) and `${mappedField}` (the map's application ID, or null).
// A node tagged with several values returns a list ( ["Care Manager", "Care Manager::PRD"] ) whose text form
// broke the name, so brackets and quotes are stripped and the first value is used.
export const appIdMappedFromTagValue = (valueExpr: string, nameField = "appIdName", mappedField = "appIdMapped"): string =>
  `| fieldsAdd ${nameField} = ${applicationNameFromValue(
    `trim(arrayFirst(splitString(replaceString(replaceString(replaceString(toString(${valueExpr}), "[", ""), "]", ""), "\\"", ""), ",")))`
  )}
${appIdMapLookup(nameField, mappedField)}`;

/** DQL expression: the application ID in the `<tagKey>:<id>` entity tag of a problem (first key that is present). */
export const problemTagIdExpr = (): string => {
  const one = (k: string) => `splitString(splitString(toString(entity_tags), "${k}:")[1], "\\"")[0]`;
  return TAG_KEYS.length === 1 ? one(TAG_KEYS[0]) : `coalesce(${TAG_KEYS.map(one).join(", ")})`;
};

// Drop-in replacement for `| fieldsAdd appId = splitString(splitString(toString(entity_tags), ...))`
// on dt.davis.problems. Leaves a single lower-case `appId`: the `${APP_ID}:` tag if present,
// otherwise the code mapped from the problem's first `Application:` tag.
export const appIdFromProblemTags = (): string => `| fieldsAdd appId = ${problemTagIdExpr()}
| fieldsAdd appIdName = ${applicationNameExpr("entity_tags")}
${appIdMapLookup()}
| fieldsAdd appId = coalesce(appId, lower(appIdMapped))
| fieldsRemove appIdName, appIdMapped`;

export const CMDB_PATH = LOOKUP_PATHS["cmdb"];

// L2 "SRE Assessment": does this application have a tier? Yes if its CMDB row (the table maintained on the
// Lookups tab, the same one the identity bar and picker read) has a business criticality, OR a ServiceNow
// import event carried a tier in the last 24 hours (the original source, kept so tenants that run that
// import are unaffected). Leaves a numeric `hasTier` (0 = none). Needs `${APP_ID}` on the row.
export const hasTierLookup = (): string => `| lookup [
    ${LOAD.cmdb}
    | fieldsAdd ${APP_ID} = lower(${APP_ID})
    | filter isNotNull(business_criticality) and trim(business_criticality) != ""
    | summarize hasTierCmdb = count(), by:{${APP_ID}}
  ], sourceField:${APP_ID}, lookupField:${APP_ID}, fields:{hasTierCmdb}
| lookup [
    fetch bizevents, from:now()-24h
    | filter event.type == "workflow.import.servicenow.appci"
    | fieldsAdd ${APP_ID} = lower(${APP_ID})
    | filter isNotNull(tier)
    | summarize hasTierImport = count(), by:{${APP_ID}}
  ], sourceField:${APP_ID}, lookupField:${APP_ID}, fields:{hasTierImport}
| fieldsAdd hasTier = coalesce(hasTierCmdb, 0) + coalesce(hasTierImport, 0)
| fieldsRemove hasTierCmdb, hasTierImport`;

// ── Which application does a NAME belong to? ───────────────────────────────────────────────────────────────────────
// Workflow titles, burn-rate alert names (and, in the app functions, notebook and dashboard names) carry no tag, so the
// application is found in the name. THE RULE, the same everywhere: a name belongs to an application when the
// application's ID appears in it as a WHOLE WORD, anywhere, ignoring case. Words are separated by spaces and by
// _ - : / . , ( ) [ ] |   so "CRM 47689 Runbook", "SN-Svc-Map-Loans (47689)" and "Runbook - crm" all name the
// applications 47689 / crm, while "47689123" and "crm2" do not. Only IDs that exist in the application catalog count, which
// keeps stray words and numbers out. (The original deployment's names, which start with their 3-letter code, still match.)
const NAME_SEPARATORS = ["_", "-", ":", "/", ".", ",", "(", ")", "[", "]", "|"];

/** DQL expression: the lower-case words of a name (an array). */
export const nameWordsExpr = (nameExpr: string): string =>
  `splitString(${NAME_SEPARATORS.reduce((e, s) => `replaceString(${e}, "${s}", " ")`, `lower(${nameExpr})`)}, " ")`;

/**
 * Adds `outField`: the catalog application ID found as a word in `nameExpr` (null when there is none). A name with several
 * IDs becomes several rows, one per ID, and a name with none stays as one row with a null.
 */
export const appIdFromNameWords = (nameExpr: string, outField = `${APP_ID}`, prefix = "nameWord"): string => `| fieldsAdd ${prefix}s = ${nameWordsExpr(nameExpr)}
| expand ${prefix}s
| lookup [
    ${LOAD.cmdb}
    | fieldsAdd appId = lower(appId)
    | fields appId
  ], sourceField:${prefix}s, lookupField:appId, fields:{${prefix}Hit = appId}
| fieldsAdd ${outField} = ${prefix}Hit
| fieldsRemove ${prefix}s, ${prefix}Hit`;

// L5 workflow checks: which application ID does an Automation workflow belong to? By the name rule above applied to the
// workflow title, or else through the application ID map (a title that starts with an application name, "MemberHub
// Validation", "CrmSuite_PRD open problems alert", with a `_PRD` style suffix removed). Run on dt.system.events; leaves
// `${outField}` (null when the title resolves to nothing). `dedupe` first reduces the events to one row per workflow and title,
// which is what a count of workflows needs and keeps the word expansion small; pass false when the event rows are still needed.
const WF_TITLE = "`dt.automation_engine.workflow.title`";
const WF_ID = "`dt.automation_engine.workflow.id`";
export const appIdFromWorkflowTitle = (outField = `${APP_ID}`, dedupe = true): string => `${dedupe ? `| summarize wfRuns = count(), by:{${WF_ID}, ${WF_TITLE}}\n` : ""}| fieldsAdd wfWord = lower(arrayFirst(splitString(${WF_TITLE}, " ")))
| fieldsAdd wfName = lower(arrayFirst(splitString(wfWord, "_")))
${appIdMapLookup("wfName", "wfMapped")}
${appIdFromNameWords(WF_TITLE, "wfHit", "wfWords")}
| fieldsAdd ${outField} = coalesce(wfHit, lower(wfMapped))
| fieldsRemove wfWord, wfName, wfMapped, wfHit`;

/** The same for ONE known application: keeps every event row (no expansion), leaving `outField` = the ID or null. */
export const appIdForWorkflowTitle = (appId: string, outField = "wfCode"): string => `| fieldsAdd wfWord = lower(arrayFirst(splitString(${WF_TITLE}, " ")))
| fieldsAdd wfName = lower(arrayFirst(splitString(wfWord, "_")))
${appIdMapLookup("wfName", "wfMapped")}
| fieldsAdd ${outField} = if(in(lower("${appId}"), ${nameWordsExpr(WF_TITLE)}), lower("${appId}"), else: lower(wfMapped))
| fieldsRemove wfWord, wfName, wfMapped`;

// ── Bulk L1 query: per-app observability signals (matches scorecard L1 logic) ──
// Checks: hosts, services, logs, smartscape(=services), k8s, cloud, rum/synthetics → 7 max
// FIXED (2026-08-29): Cloud was entirely missing (no smartscapeNodes lookup at all)
// and RUM/Synthetics was a hardcoded +0 — both real, computable signals that this
// query simply never fetched, so the leaderboard undercounted L1 for every app.
// Mirrors l1Query in ScorecardsPage.tsx; keep the two in sync.
export const BULK_L1_QUERY = `fetch dt.entity.service
${appIdFromEntityTags()}
| expand ${APP_ID}
| filter stringLength(${APP_ID}) <= ${ID_MAX}
| summarize serviceCount = count(), by:{${APP_ID}}
| lookup [
    fetch dt.entity.host
    | limit 100000
    | filter lifetime[end] > asTimestamp(now()-2h)
    ${appIdFromEntityTags()}
    | expand ${APP_ID}
    // PaaS-injected hosts (ECS Fargate, EKS Fargate, etc.) never get a
    // monitoringMode value — PaaS OneAgent has no partial mode, it's always
    // full-stack or not present at all — so a null mode here still counts.
    | summarize
        hostCount = count(),
        fullStackCount = countIf(monitoringMode == "FULL_STACK" or isNull(monitoringMode)),
        by:{${APP_ID}}
  ], sourceField:${APP_ID}, lookupField:${APP_ID}, fields:{hostCount, fullStackCount}
| lookup [
    fetch dt.entity.cloud_application
    ${appIdFromEntityTags()}
    | expand ${APP_ID}
    | summarize k8sCount = count(), by:{${APP_ID}}
  ], sourceField:${APP_ID}, lookupField:${APP_ID}, fields:{k8sCount}
| lookup [
    smartscapeNodes K8S_DAEMONSET
    | filter matchesPhrase(k8s.workload.name, "oneagent") and not matchesPhrase(k8s.workload.name, "csi-driver")
    | fieldsAdd ${APP_ID} = lower(splitString(k8s.cluster.name, "-")[0])
    | parse k8s.object, "JSON:config"
    | fieldsAdd
        component = \`tags:k8s.labels\`[\`app.kubernetes.io/component\`],
        desired = toLong(config[status][desiredNumberScheduled]),
        ready = toLong(config[status][numberReady])
    | summarize
        cloudNativeOperatorHealthy = countIf(component == "cloudnativefullstack" and desired > 0 and ready == desired),
        by:{${APP_ID}}
  ], sourceField:${APP_ID}, lookupField:${APP_ID}, fields:{cloudNativeOperatorHealthy}
| lookup [
    timeseries reqs = sum(dt.service.request.count), by:{k8s.cluster.name}, from:now()-2h
    | fieldsAdd ${APP_ID} = lower(splitString(k8s.cluster.name, "-")[0]),
        total = arraySum(reqs)
    | summarize k8sScopedTracing = sum(total), by:{${APP_ID}}
  ], sourceField:${APP_ID}, lookupField:${APP_ID}, fields:{k8sScopedTracing}
| lookup [
    fetch logs, samplingRatio:1000, from:now()-2h
    | filter isNotNull(k8s.cluster.name)
    | fieldsAdd ${APP_ID} = lower(splitString(k8s.cluster.name, "-")[0])
    | summarize k8sScopedLogs = count(), by:{${APP_ID}}
  ], sourceField:${APP_ID}, lookupField:${APP_ID}, fields:{k8sScopedLogs}
| lookup [
    fetch logs, samplingRatio:1000
    | filter isNotNull(${APP_ID})
    | summarize logCount = count(), by:{${APP_ID}}
  ], sourceField:${APP_ID}, lookupField:${APP_ID}, fields:{logCount}
| lookup [
    smartscapeNodes "AWS*"
    | fieldsFlatten \`tags:aws\`, fields:{${CLOUD_TAG}}
    | append [
        smartscapeNodes "AZURE*"
        | fieldsFlatten \`tags:azure\`, fields:{${CLOUD_TAG}}
      ]
    | append [
        smartscapeNodes "GCP*"
        | fieldsFlatten \`tags:gcp_labels\`, fields:{${CLOUD_TAG}}
      ]
    | filter isNotNull(${CLOUD_TAG})
    | fieldsAdd ${APP_ID} = lower(${CLOUD_TAG})
    | summarize cloudCount = count(), by:{${APP_ID}}
  ], sourceField:${APP_ID}, lookupField:${APP_ID}, fields:{cloudCount}
| lookup [
    fetch dt.entity.application, from:now()-1000d
    ${appIdFromEntityTags()}
    | expand ${APP_ID}
    | fieldsAdd rumActive = if(lifetime[end] > now()-7d, true, else: false)
    | summarize rumCount = countIf(rumActive == true), by:{${APP_ID}}
  ], sourceField:${APP_ID}, lookupField:${APP_ID}, fields:{rumCount}
| lookup [
    fetch dt.entity.synthetic_test
    ${appIdFromEntityTags()}
    | expand ${APP_ID}
    | summarize synCount = count(), by:{${APP_ID}}
  ], sourceField:${APP_ID}, lookupField:${APP_ID}, fields:{synCount}
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
| fields ${APP_ID}, l1Score, serviceCount, hostCount, k8sCount, logCount`;

// ── Bulk L2: per-app measured reliability signals ──
// Checks: golden signals, SLOs, guardians, dashboards, SRE assessment, critical services → 6 max
// FIXED (2026-08-29): SLOs and Guardians were both hardcoded +0 despite being plain
// DQL lookups (no REST call needed) — trivial to add, previously just never wired.
// Critical Services Tagged is new: see /lookups/dtsrepoweredapp/critical_services in ScorecardsPage.tsx.
// Mirrors l2Query in ScorecardsPage.tsx; keep the two in sync.
export const BULK_L2_QUERY = `fetch dt.entity.service
${appIdFromEntityTags()}
| expand ${APP_ID}
| filter stringLength(${APP_ID}) <= ${ID_MAX}
| summarize serviceCount = count(), by:{${APP_ID}}
| lookup [
    ${LOAD.sloDashboards}
    | fieldsAdd appId = lower(appId)
    | summarize dashboardCount = count(), by:{appId}
  ], sourceField:${APP_ID}, lookupField:appId, fields:{dashboardCount}
${hasTierLookup()}
| lookup [
    ${LOAD.slo}
    | fieldsAdd appId = ${SLO_APP_ID_EXPR}
    | summarize sloCount = count(), by:{appId}
  ], sourceField:${APP_ID}, lookupField:appId, fields:{sloCount}
| lookup [
    ${LOAD.guardians}
    | fieldsAdd appId = lower(appId)
    | summarize guardianCount = count(), by:{appId}
  ], sourceField:${APP_ID}, lookupField:appId, fields:{guardianCount}
| lookup [
    ${LOAD.criticalServices}
    | fieldsAdd appId = lower(appId)
    | summarize criticalCount = count(), resolved = countIf(entity_ids != "-"), by:{appId}
  ], sourceField:${APP_ID}, lookupField:appId, fields:{criticalCount, resolved}
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
| fields ${APP_ID}, l2Score`;

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
// getRunbookDetail) reads the Documents API once for every application ID in the
// tenant, and its result is merged into l3Score client-side, below.
export const BULK_L3_QUERY = `fetch dt.entity.service
${appIdFromEntityTags()}
| expand ${APP_ID}
| filter stringLength(${APP_ID}) <= ${ID_MAX}
| summarize svcCount = count(), by:{${APP_ID}}
| lookup [
    fetch dt.davis.problems, from:now()-7d
    | filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
    ${appIdFromProblemTags()}
    | filter isNotNull(appId)
    | fieldsAdd eventCount = arraySize(dt.davis.event_ids)
    | fieldsAdd isCausal = matchesValue(event.category, array("ERROR", "SLOWDOWN")) and eventCount > 1
    | fieldsAdd isNoise = eventCount == 1 and matchesValue(event.category, array("AVAILABILITY", "RESOURCE_CONTENTION", "CUSTOM_ALERT", "MONITORING_UNAVAILABLE"))
    | summarize
        total7d = count(),
        causalTotal = countIf(isCausal),
        causalWithCause = countIf(isCausal and isNotNull(root_cause_entity_id)),
        noiseTotal = countIf(isNoise),
        by:{appId}
  ], sourceField:${APP_ID}, lookupField:appId, fields:{total7d, causalTotal, causalWithCause, noiseTotal}
| lookup [
    fetch events, from:now()-30d
    | filter event.type == "CUSTOM_DEPLOYMENT"
    | filter isNotNull(application_ci)
    | summarize deployTotal = count(), by:{appId = lower(application_ci)}
  ], sourceField:${APP_ID}, lookupField:appId, fields:{deployTotal}
| lookup [
    fetch dt.system.events, from:now()-30d
    | filter event.provider == "AUTOMATION_ENGINE"
    | filter event.kind == "WORKFLOW_EVENT" and event.type == "WORKFLOW_EXECUTION"
    | filter matchesValue(\`dt.automation_engine.workflow.title\`, "* Production Dynatrace Alerts")
    | fieldsAdd wfAppId = lower(arrayFirst(splitString(\`dt.automation_engine.workflow.title\`, " ")))
    | summarize itsmWorkflows = countDistinct(\`dt.automation_engine.workflow.id\`), by:{wfAppId}
  ], sourceField:${APP_ID}, lookupField:wfAppId, fields:{itsmWorkflows}
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
| fields ${APP_ID}, l3Score`;

// ── Bulk L4: per-app proactive signals ──
// Checks: burn-rate alerting, dynamic scaling/K8s autoscaling, predictive
// forecasting(0 — not adopted tenant-wide), release impact tracking,
// error budget gating(0 — no ServiceNow integration) → 5 max.
// Mirrors l4Query in ScorecardsPage.tsx; keep the two in sync.
// Deployment count is deliberately omitted here: it only distinguishes
// warn from fail on release impact, and never contributes to the score.
export const BULK_L4_QUERY = `fetch dt.entity.service
${appIdFromEntityTags()}
| expand ${APP_ID}
| filter stringLength(${APP_ID}) <= ${ID_MAX}
| summarize svcCount = count(), by:{${APP_ID}}
| lookup [
    fetch dt.davis.problems, from:now()-30d
    | filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
    | filter event.category == "CUSTOM_ALERT"
    | filter contains(lower(event.name), "burn rate")
    ${appIdFromNameWords("event.name", "appId", "burnWord")}
    | filter isNotNull(appId)
    | summarize burnAlerts = countDistinct(event.name), by:{appId}
  ], sourceField:${APP_ID}, lookupField:appId, fields:{burnAlerts}
| lookup [
    smartscapeNodes "AWS*"
    | fieldsFlatten \`tags:aws\`, fields:{${CLOUD_TAG}}
    | filter isNotNull(${CLOUD_TAG})
    | summarize
        cloudTotal = count(),
        scaleTargets = countIf(matchesValue(type, "AWS_AUTOSCALING_AUTOSCALINGGROUP", "AWS_APPLICATIONAUTOSCALING_SCALABLETARGET", "AWS_EKS_NODEGROUP")),
        by:{appId = lower(${CLOUD_TAG})}
  ], sourceField:${APP_ID}, lookupField:appId, fields:{cloudTotal, scaleTargets}
| lookup [
    fetch events, from:now()-30d
    | filter event.kind == "SDLC_EVENT"
    | filter event.type == "validation" and event.status == "finished"
    | fieldsAdd appId = lower(splitString(splitString(dt.srg.tags, "\\"${CLOUD_TAG}\\":[\\"")[1], "\\"")[0])
    | filter isNotNull(appId)
    | fieldsAdd trig = coalesce(\`dt.automation_engine.workflow_execution.trigger.type\`, "Manual")
    | summarize srgEventTriggered = countIf(trig != "Schedule" and trig != "Manual"), by:{appId}
  ], sourceField:${APP_ID}, lookupField:appId, fields:{srgEventTriggered}
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
| fields ${APP_ID}, l4Score`;

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
${appIdFromProblemTags()}
| filter isNotNull(appId)
| filter dt.davis.is_duplicate == false
| fieldsAdd hasItsmProfile = toString(labels.alerting_profile) != "[\\"Default\\"]"
    and isNotNull(labels.alerting_profile)
| summarize
    totalProblems = count(),
    enrichedProblems = countIf(hasItsmProfile == true),
    by:{${APP_ID} = appId}
| append [
    fetch dt.system.events, from:now()-30d
    | filter event.provider == "AUTOMATION_ENGINE"
    | filter event.kind == "WORKFLOW_EVENT" and event.type == "WORKFLOW_EXECUTION"
    ${appIdFromWorkflowTitle()}
    | filter isNotNull(${APP_ID})
    | summarize workflowCount = countDistinct(\`dt.automation_engine.workflow.id\`), by:{${APP_ID}}
  ]
| summarize
    totalProblems = sum(totalProblems),
    enrichedProblems = sum(enrichedProblems),
    workflowCount = sum(workflowCount),
    by:{${APP_ID}}
| filter stringLength(${APP_ID}) <= ${ID_MAX}
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
| fields ${APP_ID}, l5Score`;

// ── Readiness probes ──
// One read-only DQL query per measurable input, behind the Readiness page. Each returns a few small
// aggregate rows (`total`, `ok`, sometimes `kind`), never entity names or log lines. Windows and
// sampling are chosen to bound cost; the page runs them only when asked. Interpretation (what counts as
// ready) lives in ui/app/readiness/registry.ts; the queries stay here so they can reuse the resolver
// above and be run from a script for testing.
const resolvedFlag = `| fieldsAdd resolved = arraySize(${APP_ID}) > 0`;

export const READINESS_QUERIES = {
  // IN-01: share of services and hosts that resolve to an application ID (by tag or by the application ID map).
  resolution: `fetch dt.entity.service
${appIdFromEntityTags()}
${resolvedFlag}
| summarize total = count(), ok = countIf(resolved)
| fieldsAdd kind = "services"
| append [
    fetch dt.entity.host
    | limit 100000
    | filter lifetime[end] > asTimestamp(now()-2h)
    ${appIdFromEntityTags()}
    ${resolvedFlag}
    | summarize total = count(), ok = countIf(resolved)
    | fieldsAdd kind = "hosts"
  ]`,

  // IN-02: CMDB rows (active applications) that carry a tier.
  cmdb: `${LOAD.cmdb}
| filter operational_status != "Retired"
| summarize total = count(), ok = countIf(isNotNull(business_criticality) and trim(business_criticality) != "")`,

  // IN-03: rows in the application ID map.
  map: `${LOAD.appciMap}
| summarize total = count()`,

  // IN-04: sampled recent logs that carry an `${APP_ID}` attribute (about 1 in 1000 is read).
  logs: `fetch logs, from:now()-2h, samplingRatio:1000
| summarize total = count(), ok = countIf(isNotNull(${APP_ID}))`,

  // IN-05: Kubernetes clusters whose name starts with a known application ID (the way the L1 check matches them).
  k8s: `fetch dt.entity.kubernetes_cluster
| fields name = entity.name
| fieldsAdd prefix = lower(arrayFirst(splitString(name, "-")))
| lookup [
    ${LOAD.cmdb}
    | fieldsAdd p = lower(${APP_ID})
    | fields p
  ], sourceField:prefix, lookupField:p, fields:{matched = p}
| summarize total = count(), ok = countIf(isNotNull(matched))`,

  // IN-06: cloud resources (AWS, Azure, GCP) that carry an `ApplicationCI` tag or label.
  cloud: `smartscapeNodes "AWS*"
| fieldsFlatten \`tags:aws\`, fields:{${CLOUD_TAG}}
| append [
    smartscapeNodes "AZURE*"
    | fieldsFlatten \`tags:azure\`, fields:{${CLOUD_TAG}}
  ]
| append [
    smartscapeNodes "GCP*"
    | fieldsFlatten \`tags:gcp_labels\`, fields:{${CLOUD_TAG}}
  ]
| summarize total = count(), ok = countIf(isNotNull(${CLOUD_TAG}))`,

  // IN-07: active RUM applications and synthetic tests that resolve to an application ID.
  rumSynthetic: `fetch dt.entity.application, from:now()-1000d
| filter lifetime[end] > now()-7d
${appIdFromEntityTags()}
${resolvedFlag}
| summarize total = count(), ok = countIf(resolved)
| fieldsAdd kind = "RUM apps"
| append [
    fetch dt.entity.synthetic_test
    ${appIdFromEntityTags()}
    ${resolvedFlag}
    | summarize total = count(), ok = countIf(resolved)
    | fieldsAdd kind = "synthetic tests"
  ]`,

  // IN-12: critical-services seed rows that resolved to a Dynatrace entity.
  seed: `${LOAD.criticalServices}
| summarize total = count(), ok = countIf(entity_ids != "-")`,

  // IN-13: deployment events, and how many carry the application_ci field the checks read.
  deployments: `fetch events, from:now()-30d
| filter event.type == "CUSTOM_DEPLOYMENT"
| summarize total = count(), ok = countIf(isNotNull(application_ci))`,

  // IN-14: finished SDLC validation events (Site Reliability Guardian runs).
  srgEvents: `fetch events, from:now()-30d
| filter event.kind == "SDLC_EVENT" and event.type == "validation" and event.status == "finished"
| summarize total = count()`,

  // IN-16: Automation workflows (that ran) whose title resolves to an application ID, by code or by map.
  workflows: `fetch dt.system.events, from:now()-30d
| filter event.provider == "AUTOMATION_ENGINE"
| filter event.kind == "WORKFLOW_EVENT" and event.type == "WORKFLOW_EXECUTION"
${appIdFromWorkflowTitle()}
| fieldsAdd resolvedWf = if(isNotNull(${APP_ID}), 1, else: 0)
| summarize resolvedWf = max(resolvedWf), by:{wfId = \`dt.automation_engine.workflow.id\`}
| summarize total = count(), ok = sum(resolvedWf)`,

  // IN-15: workflows named for alert routing (the L3 convention), plus workflows that call ServiceNow.
  alertRouting: `fetch dt.system.events, from:now()-30d
| filter event.provider == "AUTOMATION_ENGINE" and event.kind == "WORKFLOW_EVENT" and event.type == "WORKFLOW_EXECUTION"
| summarize total = countDistinct(\`dt.automation_engine.workflow.id\`), ok = countDistinct(if(matchesValue(\`dt.automation_engine.workflow.title\`, "* Production Dynatrace Alerts"), \`dt.automation_engine.workflow.id\`))
| fieldsAdd kind = "named"
| append [
    fetch dt.system.events, from:now()-30d
    | filter event.provider == "AUTOMATION_ENGINE" and event.type == "ACTION_EXECUTION"
    | filter \`dt.automation_engine.action.app\` == "dynatrace.servicenow"
    | summarize total = countDistinct(\`dt.automation_engine.workflow.id\`)
    | fieldsAdd kind = "servicenow"
  ]`,

  // IN-17 and IN-18, from one scan: Davis problems, and how many are on a non-default alerting profile.
  problems: `fetch dt.davis.problems, from:now()-7d
| filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
| fieldsAdd nonDefault = isNotNull(labels.alerting_profile) and toString(labels.alerting_profile) != "[\\"Default\\"]"
| summarize total = count(), ok = countIf(nonDefault)`,
} as const;

// The same probes for ONE application, so the Readiness page can tell an environment gap (the input exists
// nowhere) from an application gap (it exists elsewhere, not for this application). The application ID is interpolated
// into DQL, so it is checked first: anything but letters, digits, `_` and `-` matches nothing.
const safeAppId = (appId: string): string => (typeof appId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(appId) ? appId.toLowerCase() : "__invalid__");

export const readinessAppQueries = (appId: string) => {
  const a = safeAppId(appId);
  return {
    resolution: `fetch dt.entity.service
${appIdFromEntityTags()}
| expand ${APP_ID}
| filter ${APP_ID} == "${a}"
| summarize total = countDistinct(id)
| fieldsAdd kind = "services"
| append [
    fetch dt.entity.host
    | limit 100000
    | filter lifetime[end] > asTimestamp(now()-2h)
    ${appIdFromEntityTags()}
    | expand ${APP_ID}
    | filter ${APP_ID} == "${a}"
    | summarize total = countDistinct(id)
    | fieldsAdd kind = "hosts"
  ]`,

    cmdb: `${LOAD.cmdb}
| filter lower(${APP_ID}) == "${a}"
| summarize total = count(), ok = countIf(isNotNull(business_criticality) and trim(business_criticality) != "")`,

    map: `${LOAD.appciMap}
| filter lower(${APP_ID}) == "${a}"
| summarize total = count()`,

    logs: `fetch logs, from:now()-2h, samplingRatio:1000
| filter lower(${APP_ID}) == "${a}"
| summarize total = count()`,

    k8s: `fetch dt.entity.kubernetes_cluster
| fields name = entity.name
| filter lower(arrayFirst(splitString(name, "-"))) == "${a}"
| summarize total = count()`,

    cloud: `smartscapeNodes "AWS*"
| fieldsFlatten \`tags:aws\`, fields:{${CLOUD_TAG}}
| append [
    smartscapeNodes "AZURE*"
    | fieldsFlatten \`tags:azure\`, fields:{${CLOUD_TAG}}
  ]
| append [
    smartscapeNodes "GCP*"
    | fieldsFlatten \`tags:gcp_labels\`, fields:{${CLOUD_TAG}}
  ]
| filter lower(toString(${CLOUD_TAG})) == "${a}"
| summarize total = count()`,

    rumSynthetic: `fetch dt.entity.application, from:now()-1000d
| filter lifetime[end] > now()-7d
${appIdFromEntityTags()}
| expand ${APP_ID}
| filter ${APP_ID} == "${a}"
| summarize total = countDistinct(id)
| fieldsAdd kind = "RUM apps"
| append [
    fetch dt.entity.synthetic_test
    ${appIdFromEntityTags()}
    | expand ${APP_ID}
    | filter ${APP_ID} == "${a}"
    | summarize total = countDistinct(id)
    | fieldsAdd kind = "synthetic tests"
  ]`,

    seed: `${LOAD.criticalServices}
| filter lower(appId) == "${a}"
| summarize total = count(), ok = countIf(entity_ids != "-")`,

    deployments: `fetch events, from:now()-30d
| filter event.type == "CUSTOM_DEPLOYMENT"
| filter lower(application_ci) == "${a}"
| summarize total = count()`,

    srgEvents: `fetch events, from:now()-30d
| filter event.kind == "SDLC_EVENT" and event.type == "validation" and event.status == "finished"
| fieldsAdd srgAppId = lower(splitString(splitString(dt.srg.tags, "\\"${CLOUD_TAG}\\":[\\"")[1], "\\"")[0])
| filter srgAppId == "${a}"
| summarize total = count()`,

    workflows: `fetch dt.system.events, from:now()-30d
| filter event.provider == "AUTOMATION_ENGINE"
| filter event.kind == "WORKFLOW_EVENT" and event.type == "WORKFLOW_EXECUTION"
${appIdForWorkflowTitle(a, "wfCode")}
| filter wfCode == "${a}"
| summarize total = countDistinct(\`dt.automation_engine.workflow.id\`)`,

    alertRouting: `fetch dt.system.events, from:now()-30d
| filter event.provider == "AUTOMATION_ENGINE" and event.kind == "WORKFLOW_EVENT" and event.type == "WORKFLOW_EXECUTION"
| filter matchesValue(\`dt.automation_engine.workflow.title\`, "* Production Dynatrace Alerts")
| filter lower(arrayFirst(splitString(\`dt.automation_engine.workflow.title\`, " "))) == "${a}"
| summarize total = countDistinct(\`dt.automation_engine.workflow.id\`)`,

    problems: `fetch dt.davis.problems, from:now()-7d
| filter isNull(dt.davis.is_duplicate) or not(dt.davis.is_duplicate)
${appIdFromProblemTags()}
| filter appId == "${a}"
| fieldsAdd nonDefault = isNotNull(labels.alerting_profile) and toString(labels.alerting_profile) != "[\\"Default\\"]"
| summarize total = count(), ok = countIf(nonDefault)`,
  } satisfies Record<keyof typeof READINESS_QUERIES, string>;
};
