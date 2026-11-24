# Runbook: Getting the SRE Maturity App Working in a New Tenant

**Status: draft.** Written from the NM (`nwm-prod`) onboarding. Items marked **TODO** are not yet verified or written.

This runbook is the ordered checklist for standing the app up for a new customer. It does not repeat everything
in [HOW-TO-USE.md](HOW-TO-USE.md) (what each level checks, the Lookups tab, day-to-day use) or the
[README](../README.md) (architecture, Settings reference). Follow those links when a step says "see".

Time estimate for a tenant whose CMDB data is already in a clean table: about half a day. Most of the time goes to
step 2 (understanding the customer's data), not to the mechanics.

---

## 0. Prerequisites

| Item | Notes |
|---|---|
| Node 24+ and npm | The workflow generator uses Node's built-in TypeScript type stripping. |
| `dtctl` CLI, logged in to the target tenant | `dtctl config get-contexts` should list it. Use it for lookups, workflows and verification queries. |
| Permission to deploy apps | `app-engine:apps:install` (or equivalent) on the tenant. |
| A service user for the workflows (recommended) | See step 3. Without one, workflows run as whichever person owns them, and break when that person leaves or lacks a permission. |
| The customer's application inventory (CMDB export) | One row per application with an identifier, a name, and ideally a tier and owner. |

## 1. Collect the customer facts

Fill this table before touching anything. Every later step depends on it.

| Question | NM answer (example) | Customer answer |
|---|---|---|
| What is the **application identifier** called? (the tag / field that ties entities to an application) | `utan` (about 5 digits) | |
| How are entities tagged? (`utan:<code>`, a Kubernetes label, a cloud tag) | `utan:<code>`; Kubernetes `nm.kubernetes/utan` | |
| How long can an identifier be? | 10 | |
| Where is the CMDB data, and which columns hold name, tier, owner, director, support group, status? | `/lookups/utan_data` (`SNOW_app_name`, `top_tier`, `managed_by`, `ownership_by`, `maintained_by`) | |
| What do the tier values mean, and which count as critical? | `yes` = Top tier (critical), `no` = Not top tier | |
| Is there an operational-status column? | No, so leave the mapping blank | |
| Cloud tag key for cloud resources (optional) | none | |

**Check the data quality now** (step 2 shows how). Malformed rows and identifiers with no live entities are the
most common cause of an empty or confusing app.

## 2. Load and clean the lookup tables

**Every tenant uses the same location: `/lookups/dtsrepoweredapp/`.** The location is not a setting. The app, the
Lookups tab and the workflows all use it, so one set of workflows deploys everywhere. If you already have data
elsewhere, copy it into these tables; do not point the app at your own paths. Your **column names** can differ: map
them in Settings (step 5). See [HOW-TO-USE.md section 4.3](HOW-TO-USE.md) for the sample CSVs in
[lookups/](../lookups/).

| Table | Purpose | Who maintains it | Path |
|---|---|---|---|
| **Source table (the only one you choose)** | Your initial application data, in **your own** columns and at a path you pick | **Customer** | any `/lookups/...` path, set in the catalog workflow |
| Application catalog (CMDB) | Fixed-column catalog the app reads: name, tier, owner, status | Workflow, from your source table | `/lookups/dtsrepoweredapp/cmdb` |
| Application-name map | Display name per identifier | Customer, or generated from the CMDB | `/lookups/dtsrepoweredapp/app_map` |
| Critical services | Entities marked critical (seeds L2 checks) | Workflow, from `entity_severity` | `/lookups/dtsrepoweredapp/critical_services` |
| Entity severity | Seed list: which entities are critical | **Customer, by hand** | `/lookups/dtsrepoweredapp/entity_severity` |
| SLOs / SLO dashboards / Guardians | Per-application lookups | Workflows | `/lookups/dtsrepoweredapp/slo`, `…/slo_dashboards`, `…/guardians` |

### 2.1 Upload your source table

Upload your application data as a lookup table at any path you like, with **your own column names** (one row per
application; it needs at least an identifier). You do not reshape it: the catalog workflow does that.

```
dtctl apply -f <lookup-definition>.yaml      # or upload the CSV from a Notebook
```

**TODO:** pin down the exact `dtctl` command for lookup upload (the NM tables were created through the
`lookup:upload` API with a `^` delimiter; see `scripts/workflow-scripts/refresh-application-catalog.script.template.js`).

### 2.2 Build the application catalog (workflow)

The standard workflow **DT-SRE APP: Build /lookups/dtsrepoweredapp/cmdb (application catalog from your AppId source table)**
([workflows/refresh-application-catalog.workflow-template.yaml](../workflows/refresh-application-catalog.workflow-template.yaml))
reads your source table, **maps your columns onto the app's fixed catalog columns**, and writes
`/lookups/dtsrepoweredapp/cmdb`. It keeps a row **only if its application ID has at least one live Smartscape node**
in the tenant (tagged with the ID in the last 24 hours), so retired or never-instrumented applications never reach
the picker or the leaderboard. It throws if it would keep zero rows, so a broken query never wipes the catalog.

What you tell it, as constants at the top of the script (or in the settings JSON, `catalogSource`, when generating):

| Setting | Meaning | NM example |
|---|---|---|
| `path` | Your source table | `/lookups/updated_utan_data` |
| `columns` | Which of your columns holds each catalog field (`appId`, `name`, `tier`, `status`, `director`, `owner`, `supportGroup`); `""` = you have none (written blank) | `appId: utan`, `name: SNOW_app_name`, `tier: top_tier` |
| `passThrough` | Extra columns copied as they are (usable as profile-banner extras in Settings) | `Engineering_lead`, `portfolio` |
| `activeTagKeys` | Smartscape tag keys that carry the ID, besides the identifier and the cloud tag key | `nm.kubernetes/utan` |
| `activeWindow` | How recent "live" is | `24h` |

The same workflow serves every customer; only these values differ. It never modifies your source table.

### 2.3 Create the name map

The map has two columns: the application name from your `Application` tag and the identifier. NM generated it from the
CMDB export (784 rows) and uploaded it to `/lookups/dtsrepoweredapp/app_map`.

### 2.4 Create placeholders for the hand-maintained tables

Workflows fail with `UNKNOWN_TABULAR_FILE` if a table they `load` does not exist, and an **empty** table breaks
consumers. Until the customer supplies real data, create each of these with a single sentinel row whose values
are `__none__`:

- `/lookups/dtsrepoweredapp/entity_severity` (seed for the critical-services workflow; ID column named after your identifier)
- `/lookups/dtsrepoweredapp/critical_services` (read by the snapshot workflow)

Replace them with real data later (see step 8).

### 2.5 Check for known data problems

- Identifiers that appear as entity tags but not in the CMDB. NM had about 335 of these; they are invisible in
  the app until added to the source table.
- Malformed rows (embedded delimiters, truncated lines). NM's `updated_utan_data` had some (for example
  identifier `10014`).

## 3. Create the service user and its permissions

Workflows run as an **actor**. Use a service user so scheduled runs do not depend on a person.

1. In Account Management, create a service user and a policy with the statements below, bind the policy to a
   group, and add the service user to that group.
2. Open each workflow and set the actor to the service user. The person who does this needs
   `iam:service-users:use` and `automation:workflows:admin`.

```
ALLOW openpipeline:bizevents:ingest;
ALLOW storage:files:read, storage:files:write;
ALLOW storage:buckets:read, storage:entities:read, storage:smartscape:read,
      storage:spans:read, storage:logs:read, storage:metrics:read,
      storage:events:read, storage:bizevents:read, storage:system:read;
ALLOW settings:objects:read;
ALLOW slo:slos:read;
ALLOW document:documents:read;
ALLOW automation:workflows:read, automation:workflows:write, automation:workflows:run;
ALLOW app-engine:apps:run, app-engine:functions:run;
```

Notes:

- Without `openpipeline:bizevents:ingest` the snapshot workflow fails with
  `403: User is missing required permission: openpipeline:bizevents:ingest`.
- To limit file writes to lookups, add `WHERE storage:file-path startsWith "/lookups/"` to the `storage:files:*`
  statement.
- The docs do not say which permissions a JavaScript task needs, so run each workflow once and read any 403.
- Users who view the app need the permissions in [HOW-TO-USE.md section 4.2](HOW-TO-USE.md).

## 4. Deploy the app

1. `cp .env.example .env` and set `DT_ENVIRONMENT_URL`, `COMPANY_NAME`, `APP_NAME`.
2. `npm ci`
3. `npm run deploy`

`app.config.ts` defaults the URL to the NM tenant if `DT_ENVIRONMENT_URL` is unset, so confirm `.env` before
deploying.

## 5. Configure Settings in the app

Settings are stored **per browser** (`localStorage` key `sre-maturity.settings.v1`), so each user has to do this
once, or import the same settings export. Save reloads the page.

| Setting | NM value | Notes |
|---|---|---|
| Application identifier field | `utan` | Must be a plain identifier. |
| Longest identifier (characters) | `10` | Default is 3. A value that is too small silently drops every application. |
| Application catalog | nothing to map | Its columns are fixed; the catalog workflow fills them from your source table. Use **Detect columns** to list pass-through columns for the profile banner. |
| Operational status column | blank | A mapped column that does not exist makes the picker show only "N/A". The Settings page warns in red. |
| Name map columns | name `app_name`, ID = identifier | |
| Tier values | `yes` = Top tier (critical), `no` = Not top tier | |
| SLOs table: Application ID column | the identifier (`$APPCI`) | Blank = first 3 characters of the SLO name. Set it only after the SLO workflow has written the column. |

Use **Export saved settings** to produce the JSON that drives the workflow generator in step 6. A worked example
is [scripts/settings/nm.json](../scripts/settings/nm.json).

Tables whose columns you remapped are shown read-only in the Lookups tab, so an edit never overwrites your extra columns.

## 6. Generate and deploy the workflows

The workflows embed the same queries as the app, so they are generated from the app's code. The files in
[workflows/](../workflows/) are the **standard set**: `/lookups/dtsrepoweredapp/…` paths and the default identifier
`appId`. A tenant whose identifier differs (NM: `utan`) generates its own copy. **Only the identifier, its maximum
length, the cloud tag key and the source-table settings (`catalogSource`) change, never the lookup paths.**

```
# 1. Write the customer's settings file (start from scripts/settings/nm.json or Settings > Export saved settings)
# 2. Generate their workflows into their own folder
node scripts/generate-snapshot-workflow.mjs --config scripts/settings/<customer>.json --out workflows/customers/<customer>
```

A tenant that uses the default identifier deploys `workflows/` as is. Existing sets:
[workflows/customers/nm/](../workflows/customers/nm/) and [workflows/customers/united/](../workflows/customers/united/)
(`npm run generate:customers` regenerates both). `npm run check:workflows` checks the standard set.

**Deploy with the script.** The generated files are templates wrapped in `metadata:` / `workflow:`, which
`dtctl apply` would treat as a dashboard. [scripts/deploy-workflows.mjs](../scripts/deploy-workflows.mjs) flattens
each one and updates the workflow with the same title in place (or creates it):

```
npm run deploy:workflows -- --context <dtctl-context> --dry-run                                          # standard set
npm run deploy:workflows -- --context <dtctl-context> --dir workflows/customers/<customer> --dry-run   # a customer's set
npm run deploy:workflows -- --context <dtctl-context> --dir workflows/customers/<customer>             # deploy all
npm run deploy:workflows -- --context <dtctl-context> --dir workflows/customers/<customer> --run       # deploy, then run each and wait
npm run deploy:workflows -- --context <dtctl-context> --dir workflows/customers/<customer> --only slo  # one workflow
```

`--context` is required so a deploy never lands on the default tenant by accident. Lookup refreshes deploy and run
before the snapshot. If two workflows share a title the script stops for that one; delete the extra first.
Set each workflow's actor to the service user afterwards (step 3); the script does not change actors.

Workflows to deploy:

| Workflow | Writes | Schedule |
|---|---|---|
| DT-SRE APP: Build /lookups/dtsrepoweredapp/cmdb (application catalog from your AppId source table) (step 2.2) | `/lookups/dtsrepoweredapp/cmdb` | daily |
| DT-SRE APP: Refresh /lookups/dtsrepoweredapp/critical_services (entity_severity resolved to entity IDs) | `/lookups/dtsrepoweredapp/critical_services` | none; run manually |
| DT-SRE APP: Refresh /lookups/dtsrepoweredapp/guardians (SRG by AppId) | `/lookups/dtsrepoweredapp/guardians` | daily |
| DT-SRE APP: Refresh /lookups/dtsrepoweredapp/slo_dashboards (SLO dashboards by AppId) | `/lookups/dtsrepoweredapp/slo_dashboards` | daily |
| DT-SRE APP: Refresh /lookups/dtsrepoweredapp/slo (SLOs by AppId) | `/lookups/dtsrepoweredapp/slo` | hourly |
| DT-SRE APP: Daily Maturity Snapshot (one bizevent per AppId) | bizevents `workflow.summary.sre_maturity` | daily |

Deploy and run the lookup refreshes **before** the snapshot, since it reads them.

## 7. Verify

Run the snapshot workflow once from the Automations app, then check:

**Business events were written**

```dql
fetch bizevents, from: now()-2h
| filter event.type == "workflow.summary.sre_maturity"
| summarize events = count(), apps = countDistinct(utan), latest = max(timestamp)
```

Replace `utan` with the customer's identifier field. Expect one event per application. NM produced 522.

**Scores are not all zero**

```dql
fetch bizevents, from: now()-2h
| filter event.type == "workflow.summary.sre_maturity"
| summarize apps = count(), avgPct = avg(pct), nonZero = countIf(pct > 0) by grade
```

Low scores are expected until the critical-services data is real.

**In the app:** the picker lists applications (not only "N/A"), the leaderboard shows data, and the trend view has
at least one snapshot.

## 8. Hand over

- Give the customer the `entity_severity` format ([lookups/entity_severity.sample.csv](../lookups/entity_severity.sample.csv))
  and a process for keeping it current.
- Tell them who owns the CMDB source table and how often it changes. The catalog workflow only filters and reshapes; it
  does not fix bad source data.
- Record the service user, the workflow IDs, and the exported settings JSON somewhere the customer controls.
- **TODO:** decide how Settings are shared across users (per-browser storage means each user repeats step 5).

## Known gaps for non-United customers

These are conventions in the app that settings do not cover yet:

- **SLOs are handled.** If your SLOs carry an `<identifier>:<id>` tag (NM: 3,945 of 3,973 do), map the **Application ID**
  column of the SLOs lookup in Settings (`appci` is what the refresh workflow writes). The workflow then writes a
  second column with each SLO's ID, taken from the tag, falling back to the name up to its first separator. The
  app's SLO counts and the SLO detail modal use the same rule. Leave the column blank to keep the original
  "first 3 characters of the SLO name" rule. Redeploy the SLO workflow and run it **before** changing the setting,
  because the old table has no ID column.
- The **dashboard, runbook, burn-rate alert and workflow-title** checks still assume the first 3 characters of the
  name are the identifier (the `== 3` filters). NM has no such naming convention, so these checks score zero for NM
  until a rule is agreed (for example a tag, or a different name pattern).
- The `workflow.import.servicenow.appci` bizevent fallback is not configurable.
- The picker query filters out `operational_status != "Retired"`, so a missing status column must be handled with a
  blank mapping (step 5), not left unmapped.
- `davis:problems:read` does not appear in the IAM docs. Whether `storage:events:read` is enough for
  `dt.davis.problems` is unverified.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Picker shows only "N/A" | Mapped column (usually operational status) does not exist in the table | Clear that mapping in Settings. |
| Picker is empty after changing the identifier | Longest-identifier setting is below the real length | Raise it in Settings. |
| `UNKNOWN_TABULAR_FILE` in a card or workflow | A lookup the query loads does not exist | Create it in `/lookups/dtsrepoweredapp/` (placeholder in step 2.4); the location is fixed, so it can't be fixed in Settings. |
| `FIELD_DOES_NOT_EXIST` | A column name in Settings is not a column of the table | Re-run **Detect columns**. |
| Lookups tab: 403 on save | Missing `storage:files:write` | Add it to the user's policy. |
| Snapshot "succeeds" but no bizevents | Older versions swallowed ingest errors | Regenerate and redeploy; the current script throws on failure. |
| Snapshot fails with 403 on ingest | Actor lacks `openpipeline:bizevents:ingest` | Step 3. |
| SLO-dashboards workflow reports 0 matches | The 3-character name convention does not fit | See known gaps (not yet configurable). |
