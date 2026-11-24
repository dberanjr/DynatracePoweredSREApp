# Getting Started with your Dynatrace App

This project was bootstrapped with Dynatrace App Toolkit.

It uses React in combination with TypeScript, to provide great developer experience.

## Available Scripts

In the project directory, you can run:

### `npm run start`

Runs the app in the development mode. A new browser window with your running app will be automatically opened.

Edit a component file in `ui` and save it. The page will reload when you make changes. You may also see any errors in the console.

### `npm run build`

Builds the app for production to the `dist` folder. It correctly bundles your app in production mode and optimizes the build for the best performance.

### `npm run deploy`

Builds the app and deploys it to the specified environment in `app.config.ts`.

### `npm run uninstall

Uninstalls the app from the specified environment in `app.config.ts`.

### `npm run generate:function`

Generates a new serverless function for your app in the `api` folder.

### `npm run update`

Updates @dynatrace-scoped packages to the latest version and applies automatic migrations.

### `npm run info`

Outputs the CLI and environment information.

### `npm run help`

Outputs help for the Dynatrace App Toolkit.

## Learn more

You can find more information on how to use all the features of the new Dynatrace Platform in [Dynatrace Developer](https://dt-url.net/developers).

To learn React, check out the [React documentation](https://reactjs.org/).

## Settings (Settings tab)

Customer-specific values are configured in the app, per browser, and applied after the page reloads:

- **Organization** — company name (defaults to `COMPANY_NAME` from `.env`) and an optional landing-page logo.
- **Application identifier** — the key your entity tags / records / app-managed lookups use for an application
  (default `appId`) and its display label (default "Application ID").
- **Lookup tables** — a mapping from your column names to the ones the app needs, for each lookup the app reads (CMDB,
  application-name map, critical services, SLOs, SLO dashboards, guardians). The tables themselves are fixed at
  `/lookups/dtsrepoweredapp/<table>` for every tenant. **Detect columns**
  reads a table and suggests names. The app renames your columns right after each `load`, so queries are otherwise
  unchanged.

**CMDB display.** On the Application catalog card you can rename how each field is labelled in the app, hide a field by
leaving its column blank (for example Operational status if you don't track it), add up to six extra columns to the
profile banner, and define **Tier values** (what each value in your tier column means and which count as critical for the
leaderboard's enterprise score; e.g. `yes` = Top tier / critical, `no` = Standard).

The Lookups tab edits the app's own tables (fixed paths and layout; the ID column is named after the identifier field).
If Settings point a table elsewhere, the tab says so.

**Workflows** are generated from the same query source. After changing settings, use **Export saved settings**, then
`npm run generate:workflows -- --config sre-maturity-settings.json` and redeploy. Without `--config` the defaults are used.

## Demo mode

The header's **Demo** toggle (or `?demo=1` / `?demo=0`) replaces every Grail query and app function with built-in sample
data (`ui/app/demo/`), so the app can be shown without a tenant. Saving lookups is blocked. The Readiness and Coverage
tabs have no sample data yet.

Not covered by settings: the "first 3 characters of the name" convention in the SLO/runbook/dashboard logic, and the
`workflow.import.servicenow.appci` bizevent fallback.
