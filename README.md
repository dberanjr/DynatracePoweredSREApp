# Dynatrace-Powered SRE

An application-level **SRE maturity and reliability intelligence** app built on the
[Dynatrace App Toolkit](https://developer.dynatrace.com/). It surfaces golden signals,
SLO scorecards, problem analytics, and AIOps insights for your application portfolio,
scored into an SRE maturity view.

> **Note:** This repository is sanitized for public use. Environment/tenant URLs are set to
> the placeholder `https://YOUR_TENANT.apps.dynatrace.com` — replace them with your own
> Dynatrace environment before running (see [Configuration](#configuration)).

## Features

- **SRE Maturity Scorecards (L1–L5)** — every application (keyed by `applicationci`) is scored
  across five maturity levels, each a set of **data-driven checks** rendered as pass / warn / fail
  cards with a completion ring, plus a portfolio leaderboard. Hover the **ⓘ** on any check to see
  exactly how it is calculated.
- **Golden Signals** — latency, traffic, errors, and saturation views.
- **Problem Analytics** — Davis problem trends with deep links into the Problems app.
- **Proactive / AIOps** — anomaly and predictive insights powered by Davis.
- **Portfolio Overview** — overall score and reliability KPIs across applications.

## SRE maturity model

The Scorecards page evaluates each application across five levels, entirely from live Dynatrace
data (Grail DQL, SLO/Settings/Documents APIs, and curated lookup tables):

| Level | Theme | Representative checks |
| ----- | ----- | --------------------- |
| **L1** | Full Observability | OneAgent coverage, tracing, logs, Smartscape, K8s/cloud, RUM/Synthetics |
| **L2** | Measured Reliability | Golden-signal SLIs, **SLOs created**, **Site Reliability Guardians**, **SLO dashboards**, SRE assessment (CMDB tier) |
| **L3** | AI-Assisted Operations | Causal AI detection + event correlation, **CI/CD integration** (GitHub Actions deployments), ITSM routing, runbooks, alert-noise review, root-cause coverage, **DORA metrics** (deployment frequency & lead time) |
| **L4** | Proactive Reliability | Resource saturation, dynamic scaling, K8s autoscaling, deployment events, cloud capacity |
| **L5** | Autonomous Reliability | Workflow automation, incident auto-enrichment, end-to-end remediation |

> DORA metrics are an interim view — a company-wide DORA standard (incl. change failure rate and
> MTTR) is expected to refine these definitions.

## Data sources & lookup tables

Most checks run as Grail DQL via `useDqlWithCache`. A few signals are sourced from **Grail lookup
tables** that are kept fresh by Dynatrace Workflows (the app only needs read access):

- `/lookups/slo` — SLOs per AppCI
- `/lookups/guardians` — Site Reliability Guardians per AppCI, refreshed daily from the guardian
  Settings API (matched on the `applicationCI`/`appci` tag)
- `/lookups/slo-dashboards` — SLO dashboards per AppCI, refreshed daily from the documents API
  (dashboards whose name starts with a 3-letter AppCI token and contains `SLO`)

CI/CD and DORA checks read GitHub Actions `CUSTOM_DEPLOYMENT` events directly from Grail.

## Tech stack

- React 18 + TypeScript
- Dynatrace Strato components & design tokens
- Dynatrace SDK (`@dynatrace-sdk/*`) for DQL queries, SLOs, and navigation
- `dt-app` (Dynatrace App Toolkit) for dev/build/deploy

## Project layout

```
.
├── app.config.ts                 # top-level app config (environmentUrl, scopes)
├── src/                          # top-level app source
└── dynatrace-sre-maturity-app/   # primary app project
    ├── app.config.json           # app id, name, environmentUrl
    └── ui/app/
        ├── components/           # ScorecardCard, checkExplanations (tooltip text), MaturityLeaderboard, ...
        ├── pages/                # GoldenSignals, Scorecards, ProblemAnalytics, AiOps, Portfolio, ...
        └── hooks/                # useDqlWithCache
```

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

The app requests read scopes for logs, events, business events, metrics, entities, system tables,
Davis problems, Smartscape topology, and lookup tables (`storage:files:read`, used by the SLO /
guardian / SLO-dashboard checks). See `dynatrace-sre-maturity-app/app.config.json`.

## Getting started

```bash
cd dynatrace-sre-maturity-app
npm install
npm run start    # run in development mode
npm run build    # production build to dist/
npm run deploy   # build and deploy to the environment in app.config.json
npm run lint     # lint the UI source
```

## License

Licensed under the [Apache License 2.0](./LICENSE).
