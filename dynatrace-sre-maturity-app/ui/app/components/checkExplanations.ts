// Human-readable explanations of how each scorecard check is calculated.
// Keyed by the exact check label (column name) produced by the L1-L5 DQL
// queries in ScorecardsPage.tsx. Shown in the hover tooltip next to each check.
// Keep these in sync whenever a query's logic changes.

export const CHECK_EXPLANATIONS: Record<string, string> = {
  // L1 - Full Observability
  "1. OneAgent Deployed":
    "Counts hosts (dt.entity.host) tagged with this applicationci that were alive in the last 2 hours, and shows how many run Full-Stack vs the total. PaaS-injected hosts (ECS Fargate, EKS Fargate, etc.) report a blank monitoringMode but are inherently full-stack, so they're counted as Full-Stack too. Pass = at least one host found.",
  "2. Tracing Validated":
    "Counts services (dt.entity.service) tagged with this applicationci. Pass = at least one traced service.",
  "3. Logs Correlated":
    "Checks for log records (sampled) carrying this applicationci in the selected timeframe. Pass = any matching logs found.",
  "4. Smartscape Discovery":
    "Derived from service discovery: if any tagged services exist, Smartscape topology is considered active. Pass = at least one service.",
  "5. Kubernetes":
    "Counts Kubernetes clusters (dt.entity.kubernetes_cluster) whose name's leading token (before the first '-') matches this AppCI, since clusters follow a '<appci>-<region>-<env>' naming convention. N/A (counted as a pass) when no clusters match — not every app runs on K8s. When clusters do exist, Pass requires all three: the Cloud Native Full Stack OneAgent Operator DaemonSet is present and fully ready (app.kubernetes.io/component == cloudnativefullstack, status.numberReady == status.desiredNumberScheduled), K8s-scoped tracing (dt.service.request.count grouped by k8s.cluster.name) is flowing, and K8s-scoped logs (fetch logs filtered to k8s.cluster.name) are flowing. Fail = clusters exist but the operator isn't healthy or a signal is missing.",
  "6. Cloud":
    "Counts AWS, Azure, and GCP cloud resources tagged with this applicationci, sourced from smartscapeNodes (the same unified inventory the Clouds app uses) across all resource types. N/A (counted as a pass) when no cloud resources are tagged — this check has no fail state.",
  "7. RUM / Synthetics":
    "Counts RUM applications (dt.entity.application) active in the last 7 days plus synthetic tests (dt.entity.synthetic_test), both tagged with this applicationci. Pass = at least one active RUM app or synthetic test.",

  // L2 - Measured Reliability
  "1. Golden Signal SLIs":
    "Counts services (dt.entity.service) tagged with this applicationci that emit golden-signal metrics. Pass = at least one service.",
  "2. SLOs Created":
    "Counts SLOs for this AppCI from the /lookups/slo table, where the AppCI is the first 3 characters of each SLO name. Pass = at least one SLO.",
  "3. Site Reliability Guardians Created":
    "Number of Site Reliability Guardians (SRGs) created for this AppCI. The scorecard counts guardians tagged applicationCI/appci = this AppCI (case-insensitive) from the /lookups/guardians table, which a workflow refreshes daily at 06:00 UTC from the guardian Settings API, itemized per guardian. Pass = at least one guardian. The modal instead reads the Settings API live via the getGuardianDetail app function, so objectives stay current even if the daily refresh lags.",
  "4. SLO Dashboards Published":
    "Counts dashboards for this AppCI from the /lookups/slo-dashboards table - dashboards whose name starts with a 3-letter AppCI token and contains 'SLO' (standalone uppercase). The table is refreshed daily at 06:00 UTC by a workflow reading the documents API, itemized per dashboard. Pass = at least one dashboard. The modal reads the Documents API live via the getDashboardDetail app function.",
  "5. SRE Assessment in ARD":
    "Checks ServiceNow CMDB import bizevents (last 24h) for a tier assigned to this applicationci. Pass = a tier is present.",
  "6. Critical Services Tagged":
    "Whether this app's critical services are tagged in Dynatrace, so ITSM can route them at priority. Reads /lookups/critical_services: Pass = at least one listed critical service resolves to a real entity ID. Fail = critical services are listed for this AppCI but none resolve. N/A (counted as a pass) = no critical services are listed for this AppCI at all.",

  // L3 - AI-Assisted Operations
  "1. Causal AI Detection + Event Correlation":
    "Counts Davis problems for this applicationci in the last 7 days, split into Active vs Closed, plus how many Davis correlated across more than one entity. FILTER: only problems in the ERROR and SLOWDOWN categories with an event count > 1 are counted; Davis duplicates are excluded. Pass = at least one qualifying problem. CORRECTED: correlation now reads affected_entity_ids (populated on 100% of records) instead of affected_entities, which is null on every record and made this always report 0 correlated; the correlation count is also now measured over the same 7d window as the rest of the check.",
  "2. CI/CD Integration":
    "Counts deployments for this AppCI over the last 30 days from CUSTOM_DEPLOYMENT events, across any CI/CD platform that reports an application_ci field - every deployment in this tenant currently comes from GitHub Actions, but Harness is counted automatically once it reports. Shows successful/total deploys. Pass = at least one deployment detected.",
  "3. ITSM Integration":
    "Looks for an Automation Engine workflow whose name follows the pattern '<AppCI> Production Dynatrace Alerts' that has run in the last 30 days. Matches on the workflow title's leading AppCI token. Pass = at least one such workflow exists. WHAT IT PROVES: these workflows route to Microsoft Teams and email - there are zero ServiceNow actions anywhere in this tenant - so a pass means alert routing is automated, not that tickets are created. The modal donut shows the real channel mix.",
  "4. Runbooks Linked":
    "Counts runbook notebooks for this AppCI - notebooks whose name starts with a 3-letter AppCI token and contains the word 'Runbook' (any case). Pass = at least one runbook. TWO SOURCES: the scorecard's pass/fail reads /lookups/runbooks (bulk DQL drives the whole card grid and leaderboard), while the modal reads the Documents API live via the getRunbookDetail app function and also lists near-miss notebooks with the reason each was excluded. The lookup holds only an empty sentinel row even though its refresh workflow reports success daily, so the live function is what distinguishes a real gap from a broken pipeline. Verified 2026-08-28: this tenant has zero runbook notebooks, so both sources agree today.",
  "5. Alert Noise Review":
    "The inverse of Causal AI Detection: of all this AppCI's Davis problems in the last 7 days, the share that are noise. NOISE = problems with an event count of 1 in the AVAILABILITY, RESOURCE_CONTENTION, CUSTOM_ALERT, or MONITORING_UNAVAILABLE categories. Shows noise/total and the noise %. Warn when noise exceeds 50%. Note the denominator is ALL problems, so problems that are neither causal nor noise count against the percentage. N/A (counted as a pass) when there were zero problems in the last 7 days - nothing to be noisy about.",
  "6. Problems with Root Cause":
    "Of the same last-7-day causal problems, the share with an identified root cause (root_cause_entity_id is set). FILTER: only ERROR and SLOWDOWN category problems with an event count > 1 are counted (Davis duplicates excluded). Pass >= 40%, warn >= 30%, otherwise fail. The modal names the actual root cause entity per problem, so recurring culprits are visible. N/A (counted as a pass) when there were zero causal problems in the last 7 days.",
  "7. DORA Metrics":
    "DORA metrics derived from deployment events (last 30 days): deployment frequency, average lead time (avg-release-age from 'new' deployments only, ~a quarter of events), and change failure rate from failed/cancelled deploy outcomes, which are present on 100% of events. Pass = deployment data available. NOTE: this is an interim view - a company-wide DORA standard (including a formal change failure and MTTR definition) is coming and these calculations will be aligned to it.",

  // L4 - Proactive Reliability
  "1. SLO Burn Rate Alerting":
    "Counts distinct SLO burn-rate alerts that fired for this AppCI in the last 30 days. Source: Davis CUSTOM_ALERT problems whose name matches the tenant convention '<AppCI> - SLO <name> for Availability or Performance Burn Rate is above <threshold>'; the AppCI is the 3-character token before the first ' - '. Pass = at least one distinct burn-rate alert fired. CAVEAT: this detects alerts that FIRED, not alert configs that EXIST - a correctly configured alert on a consistently healthy SLO will not appear, because alert definitions live in anomaly-detector settings objects that DQL cannot read.",
  "2. Dynamic Scaling / K8s Autoscaling":
    "Counts real autoscaling constructs tagged with this ApplicationCI, from the same smartscapeNodes inventory the Clouds app uses: EC2/EKS Auto Scaling Groups, Application Auto Scaling scalable targets (ECS service autoscaling), and EKS managed nodegroups. Pass = at least one autoscaling target. Fail = the app has cloud resources but none of them autoscale. N/A (counted as a pass) = the app has no cloud footprint at all. KNOWN GAP: in-cluster autoscalers (HPA, KEDA, Karpenter) are not counted - they live in Kubernetes workload YAML and each needs its own evaluation.",
  "3. Predictive Forecasting":
    "Detects whether Davis predictive forecasting is in use for this app. No forecast analyzer runs anywhere in the tenant today (30 days of workflow executions show zero forecast actions), so this reports fail for every app - a deliberate, visible capability gap rather than a hidden N/A.",
  "4. Release Impact Tracking":
    "Correlates deployments with Site Reliability Guardian validations over the last 30 days. Deployments come from CUSTOM_DEPLOYMENT events; validations from SRG SDLC_EVENT records, matched to the app via dt.srg.tags.ApplicationCI. Pass = a guardian validation was triggered BY a deployment event. Warn = guardian validations are running but only on a cron schedule. Fail = deployments happen with no guardian validation at all.",
  "5. Error Budget Gating":
    "Checks whether error budget data is pushed into the change-management process to gate releases. No ServiceNow workflow action exists anywhere in the tenant (alert routing goes to Microsoft Teams and email only), so there is nothing to measure and this reports fail for every app - a visible process gap.",

  // L5 - Autonomous Reliability
  "1. Repetitive Tasks Identified":
    "Counts workflow bizevents (event.type containing 'workflow') for this applicationci in the last 7 days. Pass = at least one workflow event.",
  "2. Workflow Automation":
    "Pass when any workflow events exist for this applicationci in the last 7 days.",
  "3. E2E Remediation Automated":
    "Not yet detected - reported as fail by default.",
  "4. Incident Auto-Enrichment":
    "Of all Davis problems, the share enriched via a non-default alerting profile. Shows enriched/total and %. Pass >= 50%, otherwise warn.",
  "5. AI Postmortem / PTASK in ARD":
    "Not yet detected - reported as fail by default.",
};
