// Human-readable explanations of how each scorecard check is calculated.
// Keyed by the exact check label (column name) produced by the L1-L5 DQL
// queries in ScorecardsPage.tsx. Shown in the hover tooltip next to each check.
// Keep these in sync whenever a query's logic changes.

export const CHECK_EXPLANATIONS: Record<string, string> = {
  // L1 - Full Observability
  "1. OneAgent Deployed":
    "Counts hosts (dt.entity.host) tagged with this applicationci that were alive in the last 2 hours, and shows how many run Full-Stack vs the total. Pass = at least one host found.",
  "2. Tracing Validated":
    "Counts services (dt.entity.service) tagged with this applicationci. Pass = at least one traced service.",
  "3. Logs Correlated":
    "Checks for log records (sampled) carrying this applicationci in the selected timeframe. Pass = any matching logs found.",
  "4. Smartscape Discovery":
    "Derived from service discovery: if any tagged services exist, Smartscape topology is considered active. Pass = at least one service.",
  "5. K8s / Cloud":
    "Counts Kubernetes / cloud workloads (dt.entity.cloud_application) tagged with this applicationci. N/A when the app has none (not every app runs on K8s).",
  "6. RUM / Synthetics":
    "Counts RUM applications active in the last 7 days plus synthetic tests, both tagged with this applicationci. Pass = at least one RUM app or synthetic test.",

  // L2 - Measured Reliability
  "1. Golden Signal SLIs":
    "Counts services (dt.entity.service) tagged with this applicationci that emit golden-signal metrics. Pass = at least one service.",
  "2. SLOs Created":
    "Counts SLOs for this AppCI from the /lookups/slo table, where the AppCI is the first 3 characters of each SLO name. Pass = at least one SLO.",
  "3. Site Reliability Guardians Created":
    "Number of Site Reliability Guardians (SRGs) created for this AppCI. Counts guardians tagged applicationCI/appci = this AppCI (case-insensitive), sourced from the /lookups/guardians table that a workflow refreshes daily from the guardian Settings API. Pass = at least one guardian.",
  "4. SLO Dashboards Published":
    "Counts dashboards for this AppCI from the /lookups/slo-dashboards table - dashboards whose name starts with a 3-letter AppCI token and contains 'SLO' (standalone uppercase). The table is refreshed daily by a workflow reading the documents API. Pass = at least one dashboard.",
  "5. SRE Assessment in ARD":
    "Checks ServiceNow CMDB import bizevents (last 24h) for a tier assigned to this applicationci. Pass = a tier is present.",

  // L3 - AI-Assisted Operations
  "1. Causal AI Detection + Event Correlation":
    "Counts Davis problems for this applicationci in the last 7 days, split into Active vs Closed, plus how many Davis correlated across more than one entity. FILTER: only problems in the ERROR and SLOWDOWN categories with an event count > 1 are counted; Davis duplicates are excluded. Pass = at least one qualifying problem.",
  "2. CI/CD Integration":
    "Counts GitHub Actions deployments for this AppCI over the last 30 days, from CUSTOM_DEPLOYMENT 'cdk deploy' events (the source behind the 'GitHub Actions DORA Metrics' dashboard). Shows successful/total deploys. Pass = at least one deployment detected.",
  "3. ITSM Integration":
    "Looks for an Automation Engine workflow whose name follows the pattern '<AppCI> Production Dynatrace Alerts' that has run in the last 30 days. Matches on the workflow title's leading AppCI token. Pass = at least one such workflow exists.",
  "4. Runbooks Linked":
    "Not yet measured automatically - reported as fail until notebook / runbook attachment detection is added.",
  "5. Alert Noise Review":
    "The inverse of Causal AI Detection: of all this AppCI's Davis problems in the last 7 days, the share that are noise. NOISE = problems with an event count of 1 in the AVAILABILITY, RESOURCE_CONTENTION, CUSTOM_ALERT, or MONITORING_UNAVAILABLE categories. Shows noise/total and the noise %. Warn when noise exceeds 50%.",
  "6. Problems with Root Cause":
    "Of the same last-7-day problems, the share with an identified root cause (root_cause_entity_id is set). FILTER: only ERROR and SLOWDOWN category problems with an event count > 1 are counted (Davis duplicates excluded). Pass >= 40%, warn >= 30%, otherwise fail.",
  "7. DORA Metrics":
    "DORA metrics derived from GitHub Actions deployments (last 30 days): deployment frequency and average lead time (avg-release-age from 'new' deployments). Pass = deployment data available. NOTE: this is an interim view - a new company-wide standard for DORA metrics (including change failure rate and MTTR) is coming and these definitions will be updated to match it.",

  // L4 - Proactive Reliability
  "1. Resource Saturation Alerts":
    "Assumes Davis resource-saturation alerting is always active - reported as pass by default.",
  "2. Dynamic Scaling Metrics":
    "Counts AWS cloud resources tracked for this applicationci from the latest cloud inventory bizevent (last 24h). Pass = at least one AWS resource.",
  "3. K8s Autoscaling Visible":
    "Counts Kubernetes workloads and EKS resources tagged with this applicationci. N/A when the app has none.",
  "4. Predictive Forecasting":
    "Not yet enabled - reported as fail by default.",
  "5. Cloud Capacity Reviewed":
    "Pass when any AWS resources are inventoried for this applicationci in the last 24h cloud-summary bizevent.",
  "6. Deployment Events":
    "Counts CUSTOM_DEPLOYMENT Davis events affecting this applicationci in the last 7 days. Pass = at least one deployment event.",
  "7. Release Impact Tracking":
    "Not yet enabled - reported as fail by default.",
  "8. Pre/Post Dashboards":
    "Not yet detected - reported as fail by default.",
  "9. Error Budget Gating":
    "Not yet configured - reported as fail by default.",

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
