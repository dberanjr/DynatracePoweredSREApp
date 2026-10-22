# Dynatrace-Powered SRE

An application-level **SRE maturity and reliability intelligence** app built on the
[Dynatrace App Toolkit](https://developer.dynatrace.com/). Every application in the portfolio
(keyed by `applicationci`) is scored across a five-level SRE maturity model, entirely from live
Dynatrace data — no spreadsheets, no manual assessment.

> **New to the app?** Read the [How to use, set up and maintain guide](dynatrace-sre-maturity-app/docs/HOW-TO-USE.md)
> for setup, permissions, the hand-maintained lookup tables and routine upkeep. This README is the
> developer reference.

> **Note:** This repository is sanitized for public use. Environment/tenant URLs and company
> branding are set to placeholder values — replace them with your own before running
> (see [Configuration](#configuration)).

## Features

- **SRE Maturity Scorecards (L1–L5)** — 30 data-driven checks rendered as pass / warn / fail /
  n-a cards with a completion ring, plus a portfolio leaderboard across all applications. Each
  row shows a level-scoped index (e.g. `L1-5`), a headline metric parsed from the check's own
  status text, and a persistent status tint at rest for anything that isn't a clean pass — so
  only what needs attention draws the eye. A shimmering skeleton, sized to the exact row count
  of the level it's replacing, keeps the page from reflowing while the (often slow) L1 query
  and its four siblings resolve.
- **Executive-mode hero** — a dark, gradient-lit header combining the app identity strip and the
  overall maturity spine: concentric per-level completion rings, a "checks met" rollup with
  quick-win/platform-gap counts, and a **90-day maturity trend chart** (hand-rolled SVG, no
  charting library) plotting this app's overall score over time from daily snapshot bizevents —
  see [Maturity trend snapshots](#maturity-trend-snapshots) below.
- **Check detail modals** — click any check to open a modal with the underlying evidence:
  tables, bar/stacked-bar/donut charts, trend lines, and deep links into Hosts, Services,
  Distributed Tracing, Logs, Kubernetes, Problems, Dashboards, Notebooks, and SLOs. Rows that
  resolve to a Smartscape entity also get a **View menu** — five topology drill-down links
  (related nodes, direct calls, hierarchy, downstream/upstream call chain) opened straight from
  the row, without leaving the modal.
- **Definitions tab** — a self-documenting reference rendering the description, pass logic,
  remediation guidance, and the exact **scorecard DQL** for all 30 checks, grouped by level and
  deep-linkable per level (`/definitions?level=L3`) from each scorecard's "def ↗" link. Generated
  from the same config the modals use, so it cannot drift from the UI.
- **Dependencies tab** — an interactive upstream/downstream call-chain explorer for any service
  in the selected AppCI, up to 8 levels deep in each direction. A sortable services table
  (golden signals, criticality, live problems, dependency counts) drives two topology maps —
  Tiles or compact Nodes render styles, Horizontal/Vertical/Force-directed layout, and
  Standard/Perf (traffic- and latency-scaled edges/nodes)/Critical (filtered to critical
  services and their direct neighbors) view modes, each expandable to fullscreen. A per-level
  chip list and a narrow "direct dependencies" rail sit beside each map; live Davis problems
  render as clickable `P-*` links straight to the Problems app. Criticality (High/Medium/Low)
  is a single-hue violet ordinal ramp everywhere on this tab — deliberately not red/amber/green,
  since those are reserved for live incident state (root cause vs. impacted) elsewhere in the
  same view.
- **Golden Signals** — latency, traffic, errors, and saturation, including a normalized
  four-signal overlay chart.
- **About page** — build-time version and git commit hash, plus separately-tracked **build**
  and **deploy** timestamps (a `dt-app build` and a `dt-app deploy` are different events; the
  About page now shows both), kept in sync automatically by `scripts/sync-version.mjs`.

The primary navigation is deliberately scoped to **Home, Scorecards, Dependencies, Definitions,
Lookups, and About**. Several earlier pages — Overview, Golden Signals, AI Ops, Proactive, Problem
Analytics, Portfolio, and Explore Data — are still built and routable
(`/overview`, `/golden-signals`, `/ai-ops`, `/proactive`, `/problem-analytics`, `/portfolio`,
`/data`) but are no longer linked from the header. Re-add them in
`ui/app/components/Header.tsx` if you want them surfaced.

## SRE maturity model

Each level is a fixed set of checks, scored against a **fixed denominator that never shrinks**
(L1 `/7`, L2 `/6`, L3 `/7`, L4 `/5`, L5 `/5`). Rather than excluding structurally-inapplicable
checks from the denominator, or letting them read as a hidden non-answer, this app scores them
explicitly — see [N/A-as-pass scoring](#na-as-pass-scoring) below.

| Level | Theme | Checks | Score | Notes |
| ----- | ----- | ------ | ----- | ----- |
| **L1** | Full Observability | 7 | `/7` | OneAgent, tracing, logs, Smartscape, Kubernetes, cloud, RUM/Synthetics. Kubernetes is `n/a` (counted as a pass) when no cluster matches this AppCI; when one does, pass requires the Cloud Native Full Stack Operator to be healthy plus K8s-scoped tracing and logs both flowing. Cloud is `n/a` (counted as a pass) when the app has no tagged cloud resources. |
| **L2** | Measured Reliability | 6 | `/6` | Golden-signal SLIs, SLOs, Site Reliability Guardians, SLO dashboards, CMDB tier, Critical Services Tagged. |
| **L3** | AI-Assisted Operations | 7 | `/7` | Causal AI detection + correlation, CI/CD, ITSM routing, runbooks, alert noise, root-cause coverage, DORA. |
| **L4** | Proactive Reliability | 5 | `/5` | SLO burn-rate alerting, dynamic scaling / K8s autoscaling, predictive forecasting, release impact tracking, error budget gating. |
| **L5** | Autonomous Reliability | 5 | `/5` | Repetitive task identification, workflow automation, E2E remediation, incident auto-enrichment, AI postmortems. |

### N/A-as-pass scoring

A check reports **n/a** when the capability it measures is structurally inapplicable to this
app — not every app runs on Kubernetes, not every app has tagged cloud resources, not every app
has a critical-services list, and an app with zero problems in the measurement window has
nothing to be noisy or un-root-caused about. Since the denominator never shrinks, these checks
score as a **pass**: the alternative — excluding them from the denominator — would let an app
look more mature just by having less surface area to measure, and reporting them as `fail` would
flag a non-problem as if it were a gap. A genuine capability gap (the thing could exist here and
doesn't) still scores `fail` or is hardcoded to `fail` so it stays visible — see
[Deliberate fail results](#deliberate-fail-results). Applies today to: L1 Kubernetes, L1 Cloud,
L2 Critical Services Tagged, L3 Alert Noise Review, L3 Problems with Root Cause, and L4 Dynamic
Scaling.

### Deliberate `fail` results

Two checks report `fail` for every application because the capability genuinely does not exist
in the reference tenant. This is intentional — scoring them `n/a` would hide the gap by shrinking
the denominator:

- **L4 Predictive Forecasting** — no Davis forecast analyzer runs anywhere in the tenant.
- **L4 Error Budget Gating** — no ServiceNow workflow action exists; alert routing goes to
  Microsoft Teams and email only.

### Known measurement caveats

The Definitions tab documents these per check; the important ones:

- **L1 Kubernetes** detects a cluster by matching its name's leading token against the
  ApplicationCI, not by workload tags — a shared EKS cluster's workloads are often tagged with a
  sub-application's CI, which under-detects the parent app. Pass, when a cluster matches,
  requires the Cloud Native Full Stack OneAgent Operator DaemonSet present and fully ready
  *and* K8s-scoped tracing *and* K8s-scoped logs; any one missing is a `fail`, not a partial
  credit.
- **L4 SLO Burn Rate Alerting** detects burn-rate alerts that *fired*, not alert configs that
  *exist*. A correctly configured alert on a consistently healthy SLO will not appear, because
  alert definitions live in anomaly-detector settings objects that DQL cannot read.
- **L4 Dynamic Scaling** counts cloud autoscaling constructs (ASGs, Application Auto Scaling
  targets, EKS nodegroups). In-cluster autoscalers (HPA, KEDA, Karpenter) live in Kubernetes
  workload YAML and are not counted.
- **L5 Repetitive Tasks Identified / Workflow Automation** — **fixed 2026-08-30**: previously
  counted *any* bizevent whose `event.type` merely contained the substring "workflow", which
  matched near-universal noise (ServiceNow CMDB import events, other teams' cost-reporting
  workflows, even this app's own daily maturity-snapshot bizevent feeding back into itself) and
  inflated pass rates tenant-wide. Now requires an actual Automation Engine
  `WORKFLOW_EXECUTION` whose title starts with the app's 3-letter code — the same convention
  the L3 ITSM Integration check already used.
- **L3 DORA Metrics** is an interim view. A company-wide DORA standard — including formal change
  failure rate and MTTR definitions — is expected to refine it.
- **L3 ITSM Integration** proves that alert *routing* is automated, not that tickets are created.
- **L3 Runbooks Linked** currently reports `fail` for every application — verified 2026-08-29 that
  this tenant has zero runbook notebooks. Unlike the two deliberate fails above, this is not
  structural: it reads the Documents API live (see App functions below) and will start passing
  for any AppCI the moment a matching notebook exists. It's also the one check the trend
  workflow can't compute (see below), so a 90-day trend line can under-report L3 by up to 1
  point relative to the live scorecard for any app whose only missing L3 signal is runbooks.
- **Dependencies tab, Perf mode edge/node sizing** uses each dependency's own total request
  volume and p95 as a proxy for "how much traffic touches this path" — there is no simple
  dimensional lookup for a true caller→callee edge-level metric, so a service with high overall
  traffic looks heavily used on every edge that leads to it, not just the busiest one.

## Data sources

Most checks run as Grail DQL through `useDqlWithCache`. A daily workflow and two app-function
sources fill gaps DQL cannot reach live.

### Maturity trend snapshots

`workflows/sre-maturity-daily-snapshot.yaml` runs daily at 06:15 UTC, computes every AppCI's
L1–L5 score using the same bulk queries the portfolio leaderboard runs
(`BULK_L1_QUERY`…`BULK_L5_QUERY` in `ui/app/queries/maturityQueries.ts`; the workflow's script is
**generated** from them by `npm run generate:workflows`, so the two cannot drift), and ingests one
`workflow.summary.sre_maturity` bizevent per app. `ScorecardsPage.tsx`'s `trendQuery` reads the
last 90 days of these events for the selected AppCI, and `MaturityTrendChart.tsx` renders them as
a fixed-0–100%-domain SVG line in the Executive-mode hero. It runs as a single
`run-javascript` task calling `queryExecutionClient` directly rather than a native
`execute-dql-query` task, specifically to get `maxResultRecords` honored — the native task
silently caps at 1,000 records regardless of that input, and this tenant has ~1,987 non-retired
AppCIs. Apply or update it with `dtctl apply -f workflows/sre-maturity-daily-snapshot.yaml` (the
file carries its own `id:`, so re-applying updates the existing workflow rather than duplicating
it). `npm run check:workflows` fails if the committed workflow files are out of date relative to
the queries; run it before committing a change to `maturityQueries.ts`. The same generator also builds the
tag-resolution parts of the critical-services refresh workflow. Known gap: it excludes the Documents-API-driven Runbooks Linked signal — see
[Known measurement caveats](#known-measurement-caveats).

### How an AppCI is resolved

Everything is keyed on a 3-letter AppCI. An entity resolves to one in either of two ways, and both are
used together (a union), so a tenant can mix them:

1. an `applicationci:<code>` tag, as the app has always read it; or
2. an `Application:<Name>` tag whose name (environment suffix `::PRD` / `::CRT` / … removed, lower
   case) has a row in `/lookups/appci_map`.

The second path exists for tenants that tag the application name, not a code. The logic lives in one
place, `ui/app/queries/maturityQueries.ts` (`appciFromEntityTags`, `appciFromProblemTags`), and is
spliced into every scoring query, the Coverage page and the snapshot workflow. The map is required: a
query against a missing lookup fails, so the app shows an **AppCI map not found** banner until the table
exists. Design and trade-offs: [docs/superpowers/specs/2026-10-21-appci-resolver-design.md](dynatrace-sre-maturity-app/docs/superpowers/specs/2026-10-21-appci-resolver-design.md).
Not covered: logs (`applicationci` attribute), deployment events (`application_ci`), SRG tags, cloud
tags, Kubernetes cluster names and the legacy un-navigated pages (Overview, Golden Signals, AI Ops,
Proactive, Portfolio, Data, Problem Analytics) still read their sources as before.

### Lookup tables

Most tables are refreshed by Dynatrace Workflows and the app only reads them (`storage:files:read`).
Three are **maintained by people in the app's Lookups tab**, which needs `storage:files:write`
(gated by the user's own IAM permissions — see the how-to guide):

| Table | Contents | Maintained |
| ----- | -------- | ---------- |
| `/lookups/dynatrace/cmdb_appci_owner_mapping` | One row per application: name, owner, criticality, status, support group | Lookups tab |
| `/lookups/entity_severity` | Critical services/endpoints per AppCI (seed for `critical_services`) | Lookups tab |
| `/lookups/appci_map` | Application tag name (no environment suffix) → AppCI | Lookups tab |

The rest:

| Table | Contents | Refresh |
| ----- | -------- | ------- |
| `/lookups/slo` | SLOs per AppCI | Hourly |
| `/lookups/guardians` | Site Reliability Guardians per AppCI, one row each | Daily, 06:00 UTC |
| `/lookups/slo-dashboards` | SLO dashboards per AppCI, one row each | Daily, 06:00 UTC |
| `/lookups/critical_services` | Critical services with severity, business impact, and resolved entity IDs (~9,000 rows / ~360 AppCIs; ~38% have resolved entity IDs) | Daily, 06:00 UTC |

> **Retired 2026-08-29: `/lookups/runbooks`.** It held only a `__none__` sentinel row while its
> refresh workflow still reported success daily, so a lookup-only check could not distinguish "no
> runbooks exist" from "the pipeline is broken". *Runbooks Linked* now reads the Documents API
> live everywhere instead — scorecard, leaderboard, and modal alike (see App functions below) —
> and the table is no longer read anywhere in the app.
>
> *Critical Services Tagged* reads `/lookups/critical_services`: **pass** when at least one
> listed critical service for this AppCI resolves to a real Dynatrace entity ID; **fail** when
> critical services are listed but none resolve; **n/a (counted as a pass)** when no critical
> services are listed for this AppCI at all.

### App functions (`dynatrace-sre-maturity-app/api/`)

Server-side functions called on demand by the detail modals, so modal contents stay live even
when a scheduled lookup refresh lags:

| Function | Reads | Used by |
| -------- | ----- | ------- |
| `getGuardianDetail` | Guardian Settings API | L2 Site Reliability Guardians (modal only) |
| `getDashboardDetail` | Documents API (dashboards) | L2 SLO Dashboards Published (modal only) |
| `getSloDetail` | Gen3 SLO API (`/platform/slo/v1`) | L2 SLOs Created (modal only) |
| `getRunbookDetail` | Documents API (notebooks) | L3 Runbooks Linked — per-app scorecard card + modal |
| `getAllRunbookCounts` | Documents API (notebooks), bulk across every AppCI in one call | L3 Runbooks Linked — portfolio leaderboard |

For Guardians, SLO Dashboards, and SLOs Created, the scorecard grid and leaderboard are still
driven by a **single bulk DQL query across every application**, so their pass/fail reads the
lookup tables above and these functions enrich the per-app modal only.

*Runbooks Linked* is the one exception (since 2026-08-29): its Documents API dependency has no
Grail/DQL equivalent at all, so every surface — per-app scorecard card, portfolio leaderboard, and
modal — calls one of the two functions above live, via the `useLiveCheckOverride` hook
(`ui/app/hooks/useLiveCheckOverride.ts`), which layers the result onto the DQL-computed score
client-side rather than reading a lookup table. The Definitions tab states this explicitly.

### Events

CI/CD, DORA, and release-impact checks read `CUSTOM_DEPLOYMENT` events and Site Reliability
Guardian `SDLC_EVENT` validations directly from Grail. Any CI/CD platform reporting an
`application_ci` field is counted (GitHub Actions and Harness today). The **L1 Kubernetes**
check's detail modal reads real Kubernetes operational events (`event.provider ==
"KUBERNETES_EVENT"`, restarts/failed-scheduling/failed-health-probe reasons) plus the
`dt.kubernetes.container.oom_kills` metric — OOM kills never surface as a discrete K8s event in
this tenant, so that one category has to come from the metric side — unioned into one
events-by-type chart. Clicking the chart, or any workload row in the table above it, opens that
cluster or workload directly in the Kubernetes app. **L5** reads Automation Engine
`WORKFLOW_EXECUTION` events (`dt.system.events`, `event.provider == "AUTOMATION_ENGINE"`) for
Repetitive Tasks Identified and Workflow Automation.

## Tech stack

- React 18 + TypeScript
- Dynatrace Strato components & design tokens
- Dynatrace SDK (`@dynatrace-sdk/*`) for DQL, SLOs, settings, documents, IAM, and navigation
- `dt-app` (Dynatrace App Toolkit) for dev/build/deploy
- No charting library — every chart (bar, stacked bar, donut, trend line, normalized overlay) is
  hand-rolled SVG/CSS, kept lightweight and themeable without an extra dependency

## Project layout

```
.
├── app.config.ts                 # top-level app config (environmentUrl, scopes)
├── src/                          # top-level app source
└── dynatrace-sre-maturity-app/   # primary app project
    ├── app.config.ts             # app id, name, version, scopes; environmentUrl/name come from .env
    ├── api/                      # server-side app functions (guardian/dashboard/SLO/runbook
    │                             #   detail, bulk runbook counts)
    ├── scripts/sync-version.mjs  # regenerates ui/app/version.ts on build & deploy
    ├── scripts/generate-snapshot-workflow.mjs  # generates the snapshot workflow script from the queries
    ├── workflows/                # Dynatrace Workflow definitions applied via `dtctl apply`
    │                             #   (sre-maturity-daily-snapshot.yaml — see Data sources)
    └── ui/app/
        ├── components/           # CheckDetailModal, checkDetailConfigs (single source of
        │                         #   truth for modals + Definitions), checkExplanations
        │                         #   (tooltips), MaturitySpine + MaturityTrendChart (Executive
        │                         #   hero), ScorecardCard + SkeletonBar (card grid + loading),
        │                         #   MaturityLeaderboard, DependencyGraphPanel +
        │                         #   DependencySummaryPanel (Dependencies tab topology +
        │                         #   chips), SmartscapeViewMenu (per-row topology drilldown), ...
        ├── pages/                # Scorecards, Definitions, UpstreamDownstream (Dependencies),
        │                         #   GoldenSignals, ProblemAnalytics, AiOps, Proactive,
        │                         #   Portfolio, About, Landing, ...
        └── hooks/                # useDqlWithCache, useSloApi, useLiveCheckOverride,
                                  #   useDependencyChain
```

### Keeping checks consistent

Five files must agree, all keyed by the exact check label the DQL emits:

- `ui/app/pages/ScorecardsPage.tsx` — the L1–L5 queries that produce each check's status for the
  per-app scorecard
- `ui/app/components/MaturityLeaderboard.tsx` — separate bulk queries (`BULK_L1_QUERY`…`BULK_L5_QUERY`)
  that score every application at once for the portfolio leaderboard
- `ui/app/queries/maturityQueries.ts` — the bulk queries themselves, shared by the leaderboard and
  (through `npm run generate:workflows`) the daily trend-chart snapshot workflow, plus the AppCI
  resolver that every query uses

  The leaderboard and the snapshot now share one source. `ScorecardsPage.tsx`'s per-app queries
  still differ in shape (DQL cannot join them), so parity with the bulk queries is enforced by
  convention — they drifted once already (Cloud, SLOs, Guardians, and Incident Auto-Enrichment were
  silently hardcoded to 0 in the leaderboard until a 2026-08-29 audit caught it; the L5
  workflow-automation signal separately matched near-universal noise until 2026-08-30) and can
  drift again.
- `ui/app/components/checkDetailConfigs.ts` — modal config **and** Definitions tab content
- `ui/app/components/checkExplanations.ts` — hover tooltip text

If you add or rename a check, update all five. The Definitions tab renders straight from
`checkDetailConfigs.ts`, so its `scorecardSnippet` must reflect what the scorecard actually runs.

### `appFunction` remount gotcha

**Fixed 2026-09-14**: the Dynatrace SDK's `useAppFunction` hook only re-invokes on a change to
its `data` argument — never on a change to `name` (`useAppFunction({ name, data }, ...)` passes
`[JSON.stringify(data)]`, not `name`, as its refetch dependency). Every `appFunction`/
`secondaryAppFunction` call in `CheckDetailModal.tsx` sends `data: { appCI }`, which is identical
across every check for a given app. That meant switching to a different app-function-driven check
via the sibling sidebar or arrow-key navigation — without closing and reopening the modal — never
re-fired the new check's function; only opening a check fresh from the scorecard page (a genuine
new mount) did. `DataPanel` and `SecondaryDataPanel` are now `key={checkKey}`, forcing a real
remount on every check switch specifically to route around this. If you add a new
`appFunction`-driven check, this is already handled — just don't remove those keys.

## Prerequisites

- Node.js >= 16.13
- A Dynatrace environment (SaaS) with access to the App Toolkit
- The `dt-app` CLI (installed via dev dependencies) and a valid login to your environment
- `dtctl` (optional, only needed to apply/update `workflows/sre-maturity-daily-snapshot.yaml` —
  the maturity trend chart has no data until that workflow has run at least once)

## Configuration

### Local settings (`.env`)

Customer- and tenant-specific values live in an **untracked** `.env` file in `dynatrace-sre-maturity-app/`, so they never get committed. The tracked `.env.example` is the template.

**Setup (once per clone):**

```bash
cd dynatrace-sre-maturity-app
cp .env.example .env
# edit .env, then:
npm run start      # or build / deploy
```

Example `.env`:

```
DT_ENVIRONMENT_URL=https://abc12345.apps.dynatrace.com
COMPANY_NAME=Acme Health
APP_NAME=DynatracePoweredSRE
```

| Variable | Default if unset | Used for |
|---|---|---|
| `DT_ENVIRONMENT_URL` | `https://YOUR_TENANT.apps.dynatrace.com` | Deploy target (`environmentUrl` in `app.config.ts`). Trailing slash is stripped. The UI's Davis Problems links read the live tenant URL at runtime instead. |
| `COMPANY_NAME` | `YourCompany` | Landing page heading and leaderboard subtitle (the only value the UI reads from `.env`) |
| `APP_NAME` | `DynatracePoweredSRE` | Manifest name in `app.config.ts`. The header, landing footer and About page show it via `getAppName()` at runtime. |

**How it works**
- `app.config.ts` reads `.env` itself, since `dt-app` doesn't load it.
- `scripts/sync-version.mjs` (run by `npm run start`, `build` and `deploy`) writes the gitignored `ui/app/constants.ts` (just `COMPANY_NAME`) from `.env`. Don't edit or commit that file; edit `.env` instead.
- Real environment variables override `.env`, e.g. `DT_ENVIRONMENT_URL=... npm run deploy` or in CI.
- Changing `.env` takes effect on the next `npm run start`/`build`/`deploy`. Restart a running dev server.

**Gotchas**
- After a fresh clone, `ui/app/constants.ts` doesn't exist until one of those three scripts has run once. `npm run lint` or a bare `tsc` will fail on the missing import until then.
- Without a `.env` you get a warning and placeholder values. `deploy` would then target `YOUR_TENANT` and fail, so create the file first.
- Keep `version: "x.y.z"` on a single line in `app.config.ts`; `sync-version.mjs` reads it with a regex.

The app requests read-only scopes for logs, buckets, files (lookup tables), events, business
events, metrics, entities, system tables, spans, and Smartscape, plus `settings:objects:read`
(guardians), `document:documents:read` (dashboards and notebooks), `iam:users:read` (resolving
owner names), and `slo:slos:read` (Gen3 SLOs). The Gen3 SLO API also requires an explicit
`build.dynatraceDependencies` entry for `/platform/slo/v1`. See
`dynatrace-sre-maturity-app/app.config.ts`.

## Getting started

```bash
cd dynatrace-sre-maturity-app
cp .env.example .env   # then edit it — see "Local settings" above
npm install
npm run start    # run in development mode
npm run build    # production build to dist/
npm run deploy   # build and deploy to the environment in app.config.ts
npm run lint     # lint the UI source
npm run generate:workflows   # regenerate the snapshot and critical-services workflow scripts from ui/app/queries/maturityQueries.ts
npm run check:workflows      # fail if those files are out of date

# activate all workflows (run once, or whenever a workflow changes)
dtctl apply -f workflows/sre-maturity-daily-snapshot.yaml
dtctl apply -f workflows/refresh-lookups-slo-slos-by-appci.workflow.json
dtctl apply -f workflows/refresh-lookups-guardians-srg-by-appci.workflow.json
dtctl apply -f workflows/refresh-lookups-runbooks-runbook-notebooks-by-appci.workflow.json
dtctl apply -f workflows/refresh-lookups-slo-dashboards-slo-dashboards-by-appci.workflow.json
dtctl apply -f workflows/refresh-lookups-critical-services-entity-severity-resolved-to-entity-ids.workflow.json
```

### Manual prerequisite — `/lookups/entity_severity`

The critical services pipeline requires a human-curated seed table uploaded to your tenant before the `refresh-lookups-critical-services` workflow will produce output. It defines which services/endpoints are considered critical for each AppCI.

Schema (see `lookups/entity_severity.sample.csv` for a template):

| Column | Description |
|---|---|
| `appci` | 3-letter AppCI code (lowercase) |
| `entity_name` | A real span endpoint name (e.g. an API path), or the exact name of a service that belongs to the AppCI (an `applicationci:<code>` tag, or an `Application:<Name>` tag mapped in `/lookups/appci_map`) — not the CMDB application name |
| `severity` | e.g. `critical`, `high`, `medium` |
| `business_impact` | e.g. `revenue`, `regulatory`, `member-experience` |

Add the rows (or **Import CSV…**) in the app's **Lookups → Critical services seed** tab and Save, which writes `/lookups/entity_severity`, then run the `refresh-lookups-critical-services` workflow manually to resolve entity IDs and publish `/lookups/critical_services`. After that first run, set a schedule on the workflow to keep entity IDs current as services move.

`build` and `deploy` run `scripts/sync-version.mjs` first, regenerating `ui/app/version.ts` from
`app.config.ts` plus the current git commit and real build/deploy wall-clock times — so the
in-app version footer and About page always match what was actually built and deployed, not just
committed. Bump `app.version` in `app.config.ts`; never edit `version.ts` by hand.

## License

Licensed under the [Apache License 2.0](./LICENSE).
