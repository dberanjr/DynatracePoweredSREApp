# Dynatrace-Powered SRE — How to Use, Set Up and Maintain

This guide is for the people who **run** the app: the platform or SRE engineers who install it,
feed it data, and keep it healthy, and the SREs who read its scorecards. The
[README](../../README.md) is the developer reference (architecture, every check, code layout);
this document is the operating manual.

---

## 1. What the app does

The app scores every application in your portfolio on a five-level SRE maturity model, using
live Dynatrace data. An application is identified by its **AppCI** (the `applicationci` value).

| Level | Theme | What it asks |
|---|---|---|
| L1 | Full Observability | Is the app instrumented: OneAgent, traces, logs, Smartscape, Kubernetes, cloud, RUM? |
| L2 | Measured Reliability | Does it have SLIs, SLOs, Guardians, SLO dashboards, a CMDB tier, tagged critical services? |
| L3 | AI-Assisted Operations | Davis detection, CI/CD, ITSM routing, runbooks, alert noise, DORA |
| L4 | Proactive Reliability | Burn-rate alerting, scaling, forecasting, release impact, error-budget gating |
| L5 | Autonomous Reliability | Automation, remediation, auto-enrichment, AI postmortems |

Nothing is entered by hand to score an app. Scores come from Grail queries, from a few
scheduled **lookup tables** that workflows refresh, and from a handful of on-demand API calls.
Two of those lookup tables **cannot be generated automatically** and are maintained by people
in the app's **Lookups** tab (section 5).

## 2. Who does what

| Role | What they can do | Permissions they need (section 4.2) |
|---|---|---|
| **Viewer** | Browse Home, Scorecards, Dependencies, Definitions | Run the app, plus read access to the data the checks query |
| **Lookup editor** | Everything a viewer can, plus add/edit/import rows on the Lookups tab | Viewer permissions plus Grail lookup table read/write |
| **Deployer / admin** | Configure, build, deploy; apply workflows; manage IAM | Rights to install apps and manage workflows in the environment |

## 3. Before you start

You need:

- Node.js 16.13 or later (Node 24 is the version `dt-app` officially supports) and `npm`
- A Dynatrace SaaS environment where you can install apps
- `dtctl` (the Dynatrace CLI), logged in to that environment, for applying workflows
- A list of the applications to score, each with an **AppCI**

### How the app finds an application's data (AppCI conventions)

The app does **not** discover applications from the CMDB table. The leaderboard and the daily snapshot
build their list of applications from **tagged entities** (levels 1 to 4) and from **workflow titles**
(level 5). The CMDB table only adds the name, owner and tier, and fills the AppCI picker in the header.
An application that has a CMDB row but no resolvable entities appears in the picker and scores nothing.

**An entity resolves to an AppCI in either of two ways** (both are used, so a tenant can mix them):

1. **It carries an `applicationci:<code>` tag.** Nothing else is needed.
2. **It carries an `Application:<Name>` tag, and that name is in the AppCI map.** Many tenants tag the
   application name, not a 3-letter code, for example `Application:BillingPortal::PRD`. The **AppCI map**
   (Lookups tab, `/lookups/appci_map`) translates the name to the code. Enter the name **without** the
   environment suffix: `billingportal` covers `::CRT`, `::SPT` and `::PRD`. Names match case-insensitively.
   Several names may share one code; a name has only one.

The same rule applies to hosts, Kubernetes workloads, RUM applications and synthetic tests, and to the
tags Davis problems carry. It does **not** apply to the other rows below that match by field or name.

Every check then matches resources by tag, field or name, so these conventions must hold. Use the same
lower-case code everywhere (the app lower-cases before comparing).

| Resource | Convention | Levels it affects |
|---|---|---|
| Services, hosts, Kubernetes workloads, RUM applications, synthetic tests | Tag `applicationci:<code>`, **or** tag `Application:<Name>` with the name in the AppCI map | L1, L2, L3, L4 (and defines which apps appear at all) |
| Logs | Log attribute `applicationci` | L1 |
| AWS, Azure and GCP resources | Tag or label with the key `ApplicationCI` | L1, L4 |
| Kubernetes clusters | Cluster name starts with the code, followed by `-` | L1 |
| SLOs | Name starts with the code | L2 |
| SLO dashboards | Name starts with the code and contains `SLO`; read from `/lookups/slo-dashboards` by the scorecard, leaderboard and snapshot alike | L2 |
| Site Reliability Guardians | Tag `applicationci:<code>` or `appci:<code>` | L2, L4 |
| Runbook notebooks | Name starts with the code and contains `Runbook` | L3 |
| Davis problems | Affected entities carry the `applicationci:<code>` tag or a mapped `Application:<Name>` tag | L3, L5 |
| Burn-rate alerts | Problem name starts with `<code> - ` | L4 |
| Automation workflows | L3 ITSM: title `<code> Production Dynatrace Alerts`. L5: title starts with the code, **or** with an application name in the AppCI map (a `_PRD` style suffix is ignored), e.g. `MemberHub Validation` | L3, L5 |
| CI/CD and deployment events | Field `application_ci` (with an underscore, unlike the tag) | L3 |
| CMDB owner mapping | `applicationci` column in the Lookups tab. A non-blank `business_criticality` is the tier the L2 SRE Assessment check looks for (a ServiceNow import event with a tier also counts) | L2 (tier), picker, names |
| AppCI map | `app_name` and `applicationci` columns in the Lookups tab | Everything in the first row of this table, when entities are tagged by name |
| Critical services seed | `appci` column in the Lookups tab; names must match services | L2 |

The code must be the **same in every table and every tag**: for example `fct` in the CMDB table, in
the critical services seed, in the service tag, and at the start of SLO names.

> **Keep AppCIs to three characters.** Many queries only keep codes of three characters or fewer
> (`stringLength(...) <= 3`), and several read the first three characters of a name. Longer codes (for
> example `BILPRD`) are filtered out of the leaderboard and the snapshot, and SLO matching breaks.

## 4. Setup

### 4.1 Install and deploy the app

```bash
cd dynatrace-sre-maturity-app
cp .env.example .env        # then edit .env (see below)
npm install
npm run deploy              # builds and deploys to the environment in .env
```

`.env` is **untracked** (it is never committed). It holds the values that differ per
customer or environment:

| Variable | Meaning |
|---|---|
| `DT_ENVIRONMENT_URL` | The environment to deploy to, e.g. `https://abc12345.apps.dynatrace.com` (no trailing slash) |
| `COMPANY_NAME` | Shown on the landing page and leaderboard |
| `APP_NAME` | App name in the manifest (default `DynatracePoweredSRE`) |

To try changes locally first, run `npm run start`. It opens the app against the same
environment and uses your login, so anything you save from the Lookups tab is written to that
real environment.

The first deploy asks you to approve the app's scopes, including `storage:files:write`
(needed by the Lookups tab).

### 4.2 Set up permissions (IAM)

The Lookups tab writes to Grail lookup tables, so access to it is controlled by the
**Grail lookup table permissions in IAM**, not by anything inside the app. Dynatrace checks
the permissions of the person using the app, limited to the scopes the app declares. If
someone lacks the permission, reads and saves fail with a clear message and nothing changes.

Create two policies in **Account Management → Identity & access management → Policies** and
bind them to groups:

**Lookup viewers** (can see lookup contents):

```
ALLOW storage:files:read;
```

**Lookup editors** (can also create and overwrite lookup tables):

```
ALLOW storage:files:read, storage:files:write;
```

Also make sure everyone who uses the app has permission to run it and to read the data the
scorecards query (logs, metrics, entities, spans, bizevents, Smartscape, settings, documents,
SLOs, IAM users). The full list of scopes the app requests is in `app.config.ts`.

Notes and cautions:

- **`storage:files:write` is broader than this app.** It lets a person write *any* lookup
  table or file, not just the two this app manages. If your policy editor supports a
  file-path condition, limit editors to `/lookups/`. Check the available conditions in the
  policy editor before relying on it.
- **Test it.** Sign in as a user in the viewer group and open **Lookups**. You should see
  the data but get "You don't have permission to write lookup tables" on Save. Then repeat as
  an editor.
- Workflows write lookup tables with their own workflow identity, so the group policies above
  do not affect them.

### 4.3 Load the three hand-maintained lookup tables

Open the app and go to **Lookups**. There are three tabs:

| Tab | Lookup path | What it is | Needed for |
|---|---|---|---|
| **CMDB owner mapping** | `/lookups/dynatrace/cmdb_appci_owner_mapping` | One row per application: AppCI, name, owner, criticality, status, support group | The AppCI picker, application names, owners and tiers everywhere in the app, and the L2 "CMDB tier" check |
| **Critical services seed** | `/lookups/entity_severity` | The services or endpoints that count as critical for each AppCI | The critical-services workflow, and the L2 "Critical Services Tagged" check |
| **AppCI map** | `/lookups/appci_map` | One row per application **name** (no environment suffix), giving its AppCI | Resolving `Application:<Name>` tags to an AppCI. **Every scoring query loads this table, so it must exist even if you tag `applicationci` directly** |

For each tab, either add rows with **+ Add row**, or import a spreadsheet with
**Import CSV…**. Sample files are in `lookups/`:

- `lookups/cmdb_appci_owner_mapping.sample.csv`
- `lookups/entity_severity.sample.csv`
- `lookups/appci_map.sample.csv`

**The AppCI map must exist.** Every scoring query reads it, and a query against a missing lookup fails.
If your entities already carry `applicationci:<code>` tags you do not need real rows, but you still need
the table: save a single placeholder row (for example `none` → `zzz`). Until the table exists, the app shows
an **AppCI map not found** banner on every page except Lookups. Use **Coverage** (below) to see which
application names still need a row.

Then press **Save…** and **Confirm save**. Nothing is written until you do.

### 4.4 Activate the workflows

Workflows keep the other lookup tables fresh and record daily maturity snapshots. Apply them
once from `dynatrace-sre-maturity-app/`:

```bash
dtctl apply -f workflows/sre-maturity-daily-snapshot.yaml
dtctl apply -f workflows/refresh-lookups-slo-slos-by-appci.workflow.json
dtctl apply -f workflows/refresh-lookups-guardians-srg-by-appci.workflow.json
dtctl apply -f workflows/refresh-lookups-slo-dashboards-slo-dashboards-by-appci.workflow.json
dtctl apply -f workflows/refresh-lookups-critical-services-entity-severity-resolved-to-entity-ids.workflow.json
```

The scripts of the snapshot workflow and the critical-services workflow are **generated** from the same
queries and AppCI resolver the app uses, so they cannot drift from it. After changing
`ui/app/queries/maturityQueries.ts`, run `npm run generate:workflows` and re-apply both workflows. `npm run check:workflows` exits non-zero if the committed workflow files are
out of date. The workflow needs Node 24 or later to generate.

Do **not** apply `refresh-lookups-runbooks-runbook-notebooks-by-appci.workflow.json`. The
`/lookups/runbooks` table is retired; the Runbooks Linked check now reads the Documents API
live.

| Workflow | Produces | Schedule |
|---|---|---|
| Refresh /lookups/slo | `/lookups/slo` | Hourly |
| Refresh /lookups/guardians | `/lookups/guardians` | Daily 06:00 UTC |
| Refresh /lookups/slo-dashboards | `/lookups/slo-dashboards` | Daily 06:15 UTC |
| SRE Maturity Daily Snapshot | One `sre_maturity` bizevent per app, feeding the 90-day trend chart | Daily 06:15 UTC |
| Refresh /lookups/critical_services | `/lookups/critical_services` (from `entity_severity`) | **No schedule set. Run it manually once, then add one** |

The critical-services workflow reads `/lookups/entity_severity`. If you run it before loading
that table in section 4.3 it fails with `The tabular file "/lookups/entity_severity" doesn't
exist`.

### 4.5 Verify

1. **Lookups** tab: all three tables load and show your rows.
2. Run the critical-services workflow manually. It should finish green.
3. Open **Coverage**. Every application you expect should show services and some of the other signals. The section **Application names with no AppCI** lists every `Application:<Name>` tag that resolves to nothing, with its count per entity type (services, hosts, RUM applications, synthetic tests): add those names to the AppCI map. The same application is often spelled differently per type (`BillingPortal` on services, `Billing Portal` on synthetic tests), and each spelling needs its own row. Fix remaining gaps (tags, names) until the apps you care about are mostly filled in.
4. Open **Scorecards**, pick an AppCI from the header picker, and confirm L1–L5 cards render.
5. The maturity trend chart stays empty until the snapshot workflow has run at least once.

## 5. Using the app

| Tab | Use it to |
|---|---|
| **Home** | Landing page; start here to jump into Scorecards |
| **Scorecards** | See one application's L1–L5 scorecard. Click any check for the evidence behind it. The leaderboard compares every application |
| **Dependencies** | Explore an application's upstream and downstream services and live problems |
| **Definitions** | Read exactly what each check measures, how it passes, how to fix a fail, and the query it runs |
| **Coverage** | Check, per application, how much of its data the scorecards can find (tagged services, hosts, SLOs, guardians, dashboards, critical services, workflows). Read-only. Start here when an app scores zero |
| **Lookups** | Maintain the two hand-managed tables (editors only) |
| **About** | Version, commit, build and deploy times |

**Reading a result.** A check is **pass**, **warn**, **fail** or **n/a**. Some checks are
structurally not applicable to an app (for example Kubernetes for an app with no cluster);
those show **n/a and count as a pass** so they do not drag the score down. If a result looks
wrong, open the check, then check **Definitions** for the exact rule. Several known
measurement limits are listed in the README under *Known measurement caveats*.

## 6. Maintaining the app

### 6.1 Editing lookup tables (Lookups tab)

1. Pick the tab, then **+ Add row**, **Edit**, **Delete**, or **Import CSV…**.
2. Edits stay on the page and are marked **Unsaved changes**. **Discard** throws them away.
3. **Save…** then **Confirm save** replaces the whole shared table. This changes the app for
   everyone.

**Importing a CSV**
- The first row must be a header. Column names match the table columns, in any order, in any
  letter case. `applicationci` and `name` are required for the CMDB table; `appci`,
  `entity_name` and `severity` for the critical services table; `app_name` and `applicationci` for the AppCI
  map. Unknown columns are ignored.
- Choose **Add / update** (merge by key; the default) or **Replace all rows**.
- If any row is invalid, **nothing** is imported and the first problems are listed with line
  numbers. Imported rows still need **Save** to take effect.

**Rules the app enforces**
- AppCI: letters, digits, `_` and `-` only. In the critical services table AppCI and severity are
  stored in lower case. In the AppCI map the name and the AppCI are both stored in lower case.
- AppCI map names must not contain `::` or a backslash: enter `BillingPortal`, not
  `BillingPortal::CRT`. The queries strip the environment suffix before matching, so a name that
  contains it could never match.
- No duplicates: AppCI for the CMDB table; AppCI plus entity name for critical services; application name for the AppCI map.
- A table cannot be saved empty.
- Empty optional values are saved as a single space and shown as blank. In DQL they are `" "`
  rather than null, so use `trim()` if you compare them.

**AppCI map: one row per application, not per environment.** `Application:BillingPortal::CRT`,
`...::SPT` and `...::PRD` are the same application, so one row `billingportal` → `bil` serves all three.
Use **Coverage → Application names with no AppCI** as the to-do list, and **AppCI map rows that point
outside the CMDB table** to catch a mistyped code. The map is read by every scoring query, so a saved
change shows up in the scorecards, leaderboard and daily snapshot after the next refresh.

**Critical services: `entity_name` must be a real Dynatrace name, not the CMDB application name.**
The critical-services workflow turns each row into a Dynatrace entity ID in three ways:

1. **A span endpoint with exactly that name**, for example an API path such as `/api/claims/submit`.
   This works with no tags at all.
2. **A service with exactly that name that belongs to that AppCI:** tagged `applicationci:<code>`, or tagged
   `Application:<Name>` where the name is in the AppCI map.
3. **A Smartscape node with exactly that name** (an Azure resource, a monitor, a host…) whose tags or custom
   metadata carry the AppCI, including an `Application` tag whose name is in the AppCI map.

A plain service name (for example `MyService:8301 (/AR)`) resolves only when that service belongs to
the AppCI (by tag or through the AppCI map). Names that are neither an endpoint nor a tagged service, such as an
application display name like `DocStore_PRD`, never resolve. The app cannot check this when you
save: the row is accepted but shows `id_count = 0` after the workflow runs.

**A row can disappear instead of showing `id_count = 0`.** If an endpoint name is found on a service that
belongs to a *different* AppCI, the row is dropped from `/lookups/critical_services` entirely (for example,
listing `/Logging/api/v1/Log` under `mem` when it belongs to a `doc` service). An AppCI whose rows all drop
has no rows left, and the L2 "Critical Services Tagged" check then reads as n/a, which counts as a pass.
If a critical service seems to be missing from the table, check which AppCI owns the endpoint.

To pick a name, find the endpoint in the Dynatrace Services or Distributed Tracing app, or run
`fetch spans | summarize count(), by:{endpoint.name}` and copy the exact value. After changing
this table, re-run the critical-services workflow and look for rows with `id_count = 0` in
`/lookups/critical_services`.

**Choosing critical services until the business gives you a list.** The right list is a business
decision: the endpoints whose failure hurts customers. To test with something real in the meantime, rank
an application's incoming request endpoints by traffic and failures, then pick from the top. Replace
`<Application tag>` with a tag that identifies the application's services (for example the
`Application:<name>` tag, or `applicationci:<code>` once you have tagged them):

```
fetch spans, samplingRatio:1000, from:now()-24h
| filter span.kind == "server" and isNotNull(endpoint.name)
| filter not matchesPhrase(endpoint.name, "health") and not matchesPhrase(endpoint.name, "swagger")
| summarize requests = count(), failures = countIf(request.is_failed == true), by:{endpoint.name, dt.smartscape.service}
| fieldsAdd tags = toString(entityAttr(toString(dt.smartscape.service), "tags", type:"dt.entity.service")),
    service = entityAttr(toString(dt.smartscape.service), "entity.name", type:"dt.entity.service")
| filter matchesPhrase(tags, "<Application tag>")
| sort requests desc
| limit 20
```

Copy the `endpoint.name` value exactly. Do not run this without the tag filter: across a whole
environment it is dominated by internal method and RMI spans. Traffic is only a stand-in for
importance. Replace these picks with the list the application owners give you.

**Two people editing at once.** The last Save wins and the other person's changes are lost.
Agree on who edits, or have one person import a CSV.

**Backups and restore.** Before every Save the previous table is copied to
`<path>_backup` (for example `/lookups/entity_severity_backup`). Only **one** previous
version is kept. There is no restore button yet. To roll back, run
`load "<backup path>"` in a Dynatrace notebook, export the result as CSV, and use
**Import CSV… → Replace all rows**, then Save.

**After you save.** The Lookups page keeps showing your saved rows. Other tabs read the lookup
through DQL and can lag for a short while, so allow a few minutes before concluding a change
did not take.

### 6.2 Routine tasks

| When | Do this |
|---|---|
| New application onboarded | Add it to the CMDB tab. Either tag its entities `applicationci:<appci>`, or add its application name to the AppCI map. Follow the naming conventions in section 3. If it has critical services, add them to the critical services tab and re-run the critical-services workflow |
| Application retired | Set its `operational_status` to `Retired` (the app hides retired applications from the AppCI picker). Remove its rows from the critical services tab if they are no longer valid |
| Owner, tier or support group changes | Edit the row in the CMDB tab |
| A service is renamed or replaced | Update its `entity_name` in the critical services tab, save, re-run the critical-services workflow |
| Weekly | Open Workflows and confirm the refresh workflows and the daily snapshot succeeded |
| After changing any workflow file | `dtctl apply -f` that file again (re-applying updates in place) |

### 6.3 Upgrading the app

1. Pull the latest code and run `npm install`.
2. Bump `version` in `app.config.ts` (never edit `ui/app/version.ts`; it is generated).
3. `npm run deploy`.
4. Check **About** shows the new version and commit.

## 7. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Critical-services workflow fails: `The tabular file "/lookups/entity_severity" doesn't exist` | The seed table has not been loaded. Load it in **Lookups → Critical services seed** (section 4.3), then re-run |
| AppCI picker is empty or falls back to tag-derived codes with no names | `/lookups/dynatrace/cmdb_appci_owner_mapping` is missing or empty. Load it on the CMDB tab |
| Lookups tab: "You don't have permission to read lookup tables" | The user lacks `storage:files:read`. Add them to the lookup viewers group |
| Save fails: "You don't have permission to write lookup tables" | The user lacks `storage:files:write`. Add them to the lookup editors group. Nothing was changed |
| Save succeeds but other tabs show old data | Lookup caching. Wait a few minutes and reload |
| A critical service never turns the check green | Its `entity_name` is not a real span endpoint name, or a service name with the matching `applicationci` tag. CMDB application names don't work. Look for `id_count = 0` in `/lookups/critical_services` and see the critical services note in section 6.1 |
| An application scores zero, or the leaderboard is empty | Open **Coverage**. A dash under *Services* means no service carries an `applicationci:<code>` tag matching the CMDB code. Tag the services (the code must match exactly, in any letter case) |
| Coverage shows a code under "Tagged codes that aren't in the CMDB table" | A tag value with no CMDB row: usually a typo or an unregistered application. Fix the tag or add the row on the Lookups tab |
| Coverage warns "> 3 chars" | The code is longer than three characters and is ignored by the scorecards. Use a 3-character code |
| Banner: "AppCI map not found" | `/lookups/appci_map` does not exist, so every scoring query fails. Open **Lookups → AppCI map** and save at least one row (section 4.3) |
| An application scores zero although its entities are tagged `Application:<Name>` | Its name is not in the AppCI map. Open **Coverage → Application names with no AppCI**, then add the name (no environment suffix) on the AppCI map tab |
| Coverage shows "AppCI map rows that point outside the CMDB table" | The map row's AppCI has no active CMDB row: usually a typo in the code. Correct it on the AppCI map tab |
| `npm run check:workflows` reports a file out of date | The queries changed but the snapshot workflow files were not regenerated. Run `npm run generate:workflows`, then re-apply the workflow with `dtctl` |
| Trend chart is empty | The daily snapshot workflow has not run yet. Run it once manually |
| Imported file rejected | Read the listed line numbers. Common causes: missing header, AppCI with spaces or other characters, duplicate AppCI |
| `npm run lint` or a bare `tsc` fails on a fresh clone with a missing `constants` import | `ui/app/constants.ts` is generated from `.env` when you run `npm run start`, `build` or `deploy`. Run one of them once |
| Deploy goes to `YOUR_TENANT` and fails | There is no `.env`, so placeholder values were used. Create it from `.env.example` |
| L1 Kubernetes shows `n/a` | No cluster name matched the AppCI. That is expected for apps that don't run on Kubernetes |

## 8. Reference

**Lookup schemas** (maintained in the app)

CMDB owner mapping: `applicationci` (key), `name`, `operational_status`,
`business_criticality`, `owned_by`, `managed_by`, `u_maintained_by`, `support_group`,
`managed_by.u_managing_director`, `managed_by.u_vp`, `managed_by.u_director`.

Critical services seed: `appci`, `entity_name`, `severity`, `business_impact`.

AppCI map: `app_name` (key, lower case, no environment suffix), `applicationci`.

**Where things live**

| Path | What |
|---|---|
| `app.config.ts` | App id, version, scopes; reads `.env` |
| `.env` / `.env.example` | Per-environment settings (untracked / template) |
| `workflows/` | Workflow definitions to apply with `dtctl` |
| `lookups/` | Sample CSVs for the three hand-maintained tables |
| `ui/app/queries/maturityQueries.ts` | The AppCI resolver and the bulk maturity queries; the single source for the app and the snapshot workflow |
| `scripts/generate-snapshot-workflow.mjs` | Generates the snapshot workflow's script from that module (`npm run generate:workflows`) |
| `api/saveLookup.function.ts` | Server-side validation, backup and write for the Lookups tab |
| `ui/app/pages/lookupTables.ts` | Column definitions for the Lookups tab |
| `scripts/sync-version.mjs` | Generates `version.ts` and `constants.ts` on start, build and deploy |
