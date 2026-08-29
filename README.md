# Dynatrace-Powered SRE

An application-level **SRE maturity and reliability intelligence** app built on the
[Dynatrace App Toolkit](https://developer.dynatrace.com/). Every application in the portfolio
(keyed by `applicationci`) is scored across a five-level SRE maturity model, entirely from live
Dynatrace data — no spreadsheets, no manual assessment.

> **Note:** This repository is sanitized for public use. Environment/tenant URLs are set to
> the placeholder `https://YOUR_TENANT.apps.dynatrace.com` — replace them with your own
> Dynatrace environment before running (see [Configuration](#configuration)).

## Features

- **SRE Maturity Scorecards (L1–L5)** — 30 data-driven checks rendered as pass / warn / fail /
  n-a cards with a completion ring, plus a portfolio leaderboard across all applications.
- **Check detail modals** — click any check to open a modal with the underlying evidence:
  tables, bar and donut charts, trend lines, and deep links into Hosts, Services, Distributed
  Tracing, Logs, Problems, Dashboards, Notebooks, and SLOs.
- **Definitions tab** — a self-documenting reference rendering the description, pass logic,
  remediation guidance, and the exact **scorecard DQL** for all 30 checks, grouped by level.
  Generated from the same config the modals use, so it cannot drift from the UI.
- **Golden Signals** — latency, traffic, errors, and saturation, including a normalized
  four-signal overlay chart.
- **About page** — build-time version, git commit hash, and commit date, kept in sync
  automatically by `scripts/sync-version.mjs`.

The primary navigation is deliberately scoped to **Home, Golden Signals, Scorecards,
Definitions, and About**. Several earlier pages — Overview, AI Ops, Proactive, Problem
Analytics, Portfolio, and Explore Data — are still built and routable
(`/overview`, `/ai-ops`, `/proactive`, `/problem-analytics`, `/portfolio`, `/data`)
but are no longer linked from the header. Re-add them in
`ui/app/components/Header.tsx` if you want them surfaced.

## SRE maturity model

Each level is a fixed set of checks. Note that the **denominator is not always the check count**:
checks that are `n/a` for structural reasons are excluded from the score, while deliberate
capability gaps are scored as `fail` so they stay visible rather than being quietly dropped.

| Level | Theme | Checks | Score | Notes |
| ----- | ----- | ------ | ----- | ----- |
| **L1** | Full Observability | 7 | `/7` | OneAgent, tracing, logs, Smartscape, Kubernetes, cloud, RUM/Synthetics. K8s and cloud report `n/a` when the app has no such footprint. |
| **L2** | Measured Reliability | 6 | `/6` | Golden-signal SLIs, SLOs, Site Reliability Guardians, SLO dashboards, CMDB tier, Critical Services Tagged. |
| **L3** | AI-Assisted Operations | 7 | `/7` | Causal AI detection + correlation, CI/CD, ITSM routing, runbooks, alert noise, root-cause coverage, DORA. |
| **L4** | Proactive Reliability | 5 | `/5` | SLO burn-rate alerting, dynamic scaling / K8s autoscaling, predictive forecasting, release impact tracking, error budget gating. |
| **L5** | Autonomous Reliability | 5 | `/5` | Repetitive task identification, workflow automation, E2E remediation, incident auto-enrichment, AI postmortems. |

### Deliberate `fail` results

Two checks report `fail` for every application because the capability genuinely does not exist
in the reference tenant. This is intentional — scoring them `n/a` would hide the gap by shrinking
the denominator:

- **L4 Predictive Forecasting** — no Davis forecast analyzer runs anywhere in the tenant.
- **L4 Error Budget Gating** — no ServiceNow workflow action exists; alert routing goes to
  Microsoft Teams and email only.

### Known measurement caveats

The Definitions tab documents these per check; the important ones:

- **L4 SLO Burn Rate Alerting** detects burn-rate alerts that *fired*, not alert configs that
  *exist*. A correctly configured alert on a consistently healthy SLO will not appear, because
  alert definitions live in anomaly-detector settings objects that DQL cannot read.
- **L4 Dynamic Scaling** counts cloud autoscaling constructs (ASGs, Application Auto Scaling
  targets, EKS nodegroups). In-cluster autoscalers (HPA, KEDA, Karpenter) live in Kubernetes
  workload YAML and are not counted.
- **L3 DORA Metrics** is an interim view. A company-wide DORA standard — including formal change
  failure rate and MTTR definitions — is expected to refine it.
- **L3 ITSM Integration** proves that alert *routing* is automated, not that tickets are created.
- **L3 Runbooks Linked** currently reports `fail` for every application — verified 2026-08-29 that
  this tenant has zero runbook notebooks. Unlike the two deliberate fails above, this is not
  structural: it reads the Documents API live (see App functions below) and will start passing
  for any AppCI the moment a matching notebook exists.

## Data sources

Most checks run as Grail DQL through `useDqlWithCache`. Two other sources fill gaps DQL cannot
reach.

### Lookup tables

Refreshed by Dynatrace Workflows; the app only needs read access (`storage:files:read`).

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
> *Critical Services Tagged* is wired to `/lookups/critical_services`: a pass requires at least
> one listed service whose `entity_ids` resolved to a real Dynatrace entity, not merely being
> listed.

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
`application_ci` field is counted (GitHub Actions and Harness today).

## Tech stack

- React 18 + TypeScript
- Dynatrace Strato components & design tokens
- Dynatrace SDK (`@dynatrace-sdk/*`) for DQL, SLOs, settings, documents, IAM, and navigation
- `dt-app` (Dynatrace App Toolkit) for dev/build/deploy

## Project layout

```
.
├── app.config.ts                 # top-level app config (environmentUrl, scopes)
├── src/                          # top-level app source
└── dynatrace-sre-maturity-app/   # primary app project
    ├── app.config.json           # app id, name, version, environmentUrl, scopes
    ├── api/                      # server-side app functions (guardian/dashboard/SLO/runbook
    │                             #   detail, bulk runbook counts)
    ├── scripts/sync-version.mjs  # regenerates ui/app/version.ts on build & deploy
    └── ui/app/
        ├── components/           # CheckDetailModal, checkDetailConfigs (single source of
        │                         #   truth for modals + Definitions), checkExplanations
        │                         #   (tooltips), MaturityLeaderboard, ScorecardCard, ...
        ├── pages/                # Scorecards, Definitions, GoldenSignals, ProblemAnalytics,
        │                         #   AiOps, Proactive, Portfolio, About, Landing, ...
        └── hooks/                # useDqlWithCache, useSloApi, useLiveCheckOverride
```

### Keeping checks consistent

Four files must agree, all keyed by the exact check label the DQL emits:

- `ui/app/pages/ScorecardsPage.tsx` — the L1–L5 queries that produce each check's status for the
  per-app scorecard
- `ui/app/components/MaturityLeaderboard.tsx` — separate bulk queries (`BULK_L1_QUERY` ... `BULK_L5_QUERY`)
  that score every application at once for the portfolio leaderboard. DQL cannot join these to
  `ScorecardsPage.tsx`'s queries, so parity between the two is enforced by convention, not shared
  code — they drifted once already (Cloud, SLOs, Guardians, and Incident Auto-Enrichment were
  silently hardcoded to 0 here until a 2026-08-29 audit caught it) and can drift again.
- `ui/app/components/checkDetailConfigs.ts` — modal config **and** Definitions tab content
- `ui/app/components/checkExplanations.ts` — hover tooltip text

If you add or rename a check, update all four. The Definitions tab renders straight from
`checkDetailConfigs.ts`, so its `scorecardSnippet` must reflect what the scorecard actually runs.

## Prerequisites

- Node.js >= 16.13
- A Dynatrace environment (SaaS) with access to the App Toolkit
- The `dt-app` CLI (installed via dev dependencies) and a valid login to your environment

## Configuration

Set your Dynatrace environment URL — replace the `YOUR_TENANT` placeholder in:

- `app.config.ts` → `environmentUrl`
- `dynatrace-sre-maturity-app/app.config.json` → `environmentUrl`
- `dynatrace-sre-maturity-app/ui/app/pages/ProblemAnalyticsPage.tsx` → `problemsAppBase`

```
https://YOUR_TENANT.apps.dynatrace.com   →   https://<your-env>.apps.dynatrace.com
```

The app requests read-only scopes for logs, buckets, files (lookup tables), events, business
events, metrics, entities, system tables, spans, and Smartscape, plus `settings:objects:read`
(guardians), `document:documents:read` (dashboards and notebooks), `iam:users:read` (resolving
owner names), and `slo:slos:read` (Gen3 SLOs). The Gen3 SLO API also requires an explicit
`build.dynatraceDependencies` entry for `/platform/slo/v1`. See
`dynatrace-sre-maturity-app/app.config.json`.

## Getting started

```bash
cd dynatrace-sre-maturity-app
npm install
npm run start    # run in development mode
npm run build    # production build to dist/
npm run deploy   # build and deploy to the environment in app.config.json
npm run lint     # lint the UI source
```

`build` and `deploy` run `scripts/sync-version.mjs` first, regenerating `ui/app/version.ts` from
`app.config.json` plus the current git commit — so the in-app version footer and About page always
match what was deployed. Bump `app.version` in `app.config.json`; never edit `version.ts` by hand.

## License

Licensed under the [Apache License 2.0](./LICENSE).
