# Dynatrace-Powered SRE

An application-level **SRE maturity and reliability intelligence** app built on the
[Dynatrace App Toolkit](https://developer.dynatrace.com/). It surfaces golden signals,
SLO scorecards, problem analytics, and AIOps insights for your application portfolio,
scored into an SRE maturity view.

> **Note:** This repository is sanitized for public use. Environment/tenant URLs are set to
> the placeholder `https://YOUR_TENANT.apps.dynatrace.com` — replace them with your own
> Dynatrace environment before running (see [Configuration](#configuration)).

## Features

- **SRE Maturity Scorecards** — per-application maturity scoring and a portfolio leaderboard.
- **Golden Signals** — latency, traffic, errors, and saturation views.
- **Problem Analytics** — Davis problem trends with deep links into the Problems app.
- **Proactive / AIOps** — anomaly and predictive insights powered by Davis.
- **Portfolio Overview** — overall score and reliability KPIs across applications.

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
        ├── components/           # KpiCard, ChartCard, MaturityLeaderboard, ...
        ├── pages/                # GoldenSignals, Scorecards, ProblemAnalytics, AiOps, Portfolio, ...
        └── hooks/                # useDqlWithCache, useSloApi
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

The app requests read scopes for logs, events, business events, metrics, entities,
Davis problems, and Smartscape topology (see `app.config.ts`).

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
