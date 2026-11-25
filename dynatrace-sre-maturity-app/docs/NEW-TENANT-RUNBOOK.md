# Runbook: Getting the SRE Maturity App Working in a New Tenant

**Status: draft.** Written from the NM (`nwm-prod`) onboarding and updated for the shared Settings (`/lookups/dtsrepoweredapp/config`). Items marked **TODO** are not yet verified or written.

This runbook is the ordered checklist for standing the app up for a new customer. It does not repeat everything
in [HOW-TO-USE.md](HOW-TO-USE.md) (what each level checks, the Lookups tab, day-to-day use) or the
[README](../README.md) (architecture, Settings reference). Follow those links when a step says "see".

**To brief a customer before you start,** copy [customer-deployment-overview.md](customer-deployment-overview.md): it
lists what will be added to their tenant, the service-user policy and what you need from them.

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
| How are entities tagged, and under **which tag keys**? Several are fine (`utan:<code>`, a Kubernetes label, a cloud tag); list every key that carries the ID | `utan:<code>`; Kubernetes `nm.kubernetes/utan` | |
| Which **column of their CMDB holds the same value the tags carry**? (CMDBs often have several ID-like columns; check, do not assume: step 2.5) | NM's table has `utan` and `app_number`; the tags follow `app_number` far more often | |
| How long can an identifier be? | 10 | |
| Where is the CMDB data, and which columns hold name, tier, owner, director, support group, status? | `/lookups/utan_data` (`SNOW_app_name`, `top_tier`, `managed_by`, `ownership_by`, `maintained_by`) | |
| What do the tier values mean, and which count as critical? | `yes` = Top tier (critical), `no` = Not top tier | |
| Is there an operational-status column? | No, so leave the mapping blank | |
| Cloud tag key for cloud resources (optional) | none | |

**Check the data quality now** (step 2 shows how). Malformed rows and identifiers with no live entities are the
most common cause of an empty or confusing app.

## 2. Load and clean the lookup tables

**The app's own tables are in a fixed location, `/lookups/dtsrepoweredapp/`.** That is not a setting: the app, the Lookups
tab and the workflows all use it, so one set of workflows deploys everywhere. The one table that is yours is the **source
table** with your application data (step 2.1): put it at any path you like, with your own column names, and tell the app
where it is and what its columns mean in Settings (step 5). The catalog workflow normalises it into
`/lookups/dtsrepoweredapp/cmdb`. See [HOW-TO-USE.md section 4.3](HOW-TO-USE.md) for the sample CSVs in
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

Upload a CSV with `dtctl` (it reads the header row and builds the parse pattern; see `dtctl create lookup --help`):

```
dtctl --context <ctx> create lookup -f applications.csv --path /lookups/my_applications \
  --lookup-field <id column> --display-name "Application data"
```

**Grail keeps one row per `--lookup-field` value**, so choose a column that is unique per application; duplicate values
collapse to one row. For values with commas or odd characters, use `--parse-pattern` with a delimiter that never occurs
in the data (the NM tables use `^`). Not yet re-tested end to end for a fresh customer.

### 2.2 Build the application catalog (workflow)

The standard workflow **DT-SRE APP: Build /lookups/dtsrepoweredapp/cmdb (application catalog from your AppId source table)**
([workflows/refresh-application-catalog.workflow-template.yaml](../workflows/refresh-application-catalog.workflow-template.yaml))
reads your source table, **maps your columns onto the app's fixed catalog columns**, and writes
`/lookups/dtsrepoweredapp/cmdb`. It keeps a row **only if its application ID has at least one live Smartscape node**
in the tenant (tagged with the ID in the last 24 hours), so retired or never-instrumented applications never reach
the picker or the leaderboard. It throws if it would keep zero rows, so a broken query never wipes the catalog.

What you tell it is entered **in the app, on the Settings page** (step 5), not in the workflow, and stored in
`/lookups/dtsrepoweredapp/config`, which the workflow reads each time it runs:

| Setting (Settings > Application catalog) | Meaning | NM example |
|---|---|---|
| Your lookup table | Your source table | `/lookups/updated_utan_data` |
| Your column, per catalog field | Which of your columns holds each catalog field (Application ID, name, tier, status, director, owner, support group); blank = you have none (written blank) | Application ID = `utan`, name = `SNOW_app_name`, tier = `top_tier` |
| Extra fields | Extra columns copied as they are and shown in the profile banner | `Engineering_lead`, `portfolio` |
| Live within | How recent "live" is | `24h` |
| Entity tag keys (Settings > Application identifier) | Tags that carry the ID; also used to decide which applications are live | `utan, nm.kubernetes/utan` |

The workflow is identical for every customer; there is nothing to edit in it. It never modifies your source table.

**To change the ID column later** (for example from `utan` to `app_number`): open Settings, choose the other column next to
Application ID, Save, then run the **Build /lookups/dtsrepoweredapp/cmdb** workflow again (and the critical_services workflow,
and the starter seed if you use it). The workflow stops with an error, leaving the old catalog in place, if the new setting
would keep no rows. Check first that the column has no blanks or duplicates, and that its values are what your entities
carry in the ID tag.

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

**Seed table format.** `entity_severity` has one row per critical service, with columns `appId`, `entity_name` (the exact
Dynatrace service name), `severity` (`high`, `medium`, `low`) and `business_impact`. **A Grail lookup keeps one row per
lookup-field value**, so when you create it yourself (for example with `dtctl create lookup`) add a fifth column,
`row_key` = `appId|entity_name` in lower case, and use it as the lookup field; with `appId` as the key only one service per
application would survive. Saving the table from the app's Lookups tab adds `row_key` for you.

**Starter seed.** If the customer has no list yet, a starter can be derived from the data: for each top-tier application, its
services that are called by a real-user application, or are web entry points that no other service calls. Run the
**"Seed /lookups/dtsrepoweredapp/entity_severity"** workflow to build it (after the cmdb workflow, before the critical_services
workflow); it leaves a table alone that holds rows it did not write, so it never overwrites a real list. Mark it clearly
as a starter and replace it with the customer's real list. On NM this gave 42 services across 16 of 65 top-tier
applications, and 38 resolved to entity IDs on the first run.

### 2.5 Check for known data problems

- Identifiers that appear as entity tags but not in the CMDB. NM had about 335 of these; they are invisible in
  the app until added to the source table.
- Malformed rows (embedded delimiters, truncated lines). NM's `updated_utan_data` had some (for example
  identifier `10014`).
- **An ID column that does not match the tags.** NM's table had two ID-like columns, and 1,252 of its 2,254 rows had
  different values in them. The tags followed `app_number` (397 of 511 tag values) more than `utan` (354), so with `utan`
  mapped, applications such as 48259 were missing from the picker. Before choosing the column for Application ID in
  Settings, compare each candidate with the tags (replace `utan` with the customer's tag key and the columns with theirs):

```
fetch dt.entity.service
| fieldsAdd tag = arrayDistinct(iCollectArray(splitString(arrayRemoveNulls(iCollectArray(if(matchesPhrase(tags[], "*utan*"), lower(tags[]))))[], ":")[1]))
| expand tag
| filter isNotNull(tag)
| summarize services = count(), by:{tag}
| lookup [load "/lookups/my_applications" | fields app_number, hit_a = app_number], sourceField:tag, lookupField:app_number, fields:{hit_a}
| lookup [load "/lookups/my_applications" | fields utan, hit_b = utan], sourceField:tag, lookupField:utan, fields:{hit_b}
| summarize tag_values = count(), in_app_number = countIf(isNotNull(hit_a)), in_utan = countIf(isNotNull(hit_b)),
    in_neither = countIf(isNull(hit_a) and isNull(hit_b))
```

  Pick the column with the higher count, check it has no blanks or duplicates, and ask the customer to confirm it is the one
  their teams use. Tag values in neither column need adding to the source table or correcting at the source.

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
- Whoever saves the app's **Settings** (step 5) writes a lookup table, so they also need `storage:files:write`. Everyone else sees the settings read-only.

## 4. Deploy the app

1. `cp .env.example .env` and set `DT_ENVIRONMENT_URL`, `COMPANY_NAME`, `APP_NAME`.
2. `npm ci`
3. `npm run deploy`

`app.config.ts` defaults the URL to the NM tenant if `DT_ENVIRONMENT_URL` is unset, so confirm `.env` before
deploying.

## 5. Configure Settings in the app

Open **Settings** in the app. The settings are stored in **`/lookups/dtsrepoweredapp/config`**, shared by every user and
read by every workflow, so this is done **once per tenant**, not per user. The first Save creates the table; it needs
permission to write lookup tables (`storage:files:write`). A user without it sees the settings read-only with a message
saying so. Until the table exists the workflows stop with "Cannot read /lookups/dtsrepoweredapp/config". Save reloads the page.

| Setting | NM value | Notes |
|---|---|---|
| Entity tag keys | `utan, nm.kubernetes/utan` | One or several, comma separated. An entity carrying `<key>:<id>` for **any** of them belongs to application `<id>`. The values must be the same IDs your source table uses. |
| Cloud resource tag key | blank | Case-sensitive key on AWS/Azure/GCP resources and guardians; blank = the first tag key. |
| Longest identifier (characters) | `10` | Default is 3. A value that is too small silently drops every application. |
| Your lookup table and columns | `/lookups/updated_utan_data` | Your source table and which column fills each catalog field (see 2.2). Use **Detect columns** to list its columns. |
| Operational status column | blank | A column that does not exist in your table makes the picker show only "N/A". The Settings page warns in red. |
| Tier values | `yes` = Top tier (critical), `no` = Not top tier | |

Settings other than these (the lookup tables' names and columns, the Application ID alias `appId`) are fixed.

## 6. Create the snapshot bucket, then deploy the workflows

### 6.1 Snapshot bucket (once per tenant, needs an administrator)

The daily snapshot events are stored in their **own Grail bucket**, `dtsrepoweredapp_snapshots` (table `bizevents`),
which gives them their own retention and lets their records be deleted. The workflow stops with a clear error until the
bucket exists and an OpenPipeline route sends the events there.

```
node scripts/setup-snapshot-bucket.mjs --context <dtctl-context> --dry-run      # preview
node scripts/setup-snapshot-bucket.mjs --context <dtctl-context> --retention 365
```

It creates the bucket, a custom bizevents pipeline that assigns it, and **one entry** in the tenant-wide bizevents
routing settings (existing entries are kept). The person running it needs `storage:bucket-definitions:write` and
settings write access for the OpenPipeline bizevents pipelines and routing schemas. This is separate from the
workflows' service user.

### 6.2 The workflows

Every workflow is **identical for every customer**. The scripts read the customer's values (the application ID tag keys,
the cloud tag key, the longest ID, and for the catalog workflow the source table and column mapping) at run time from
`/lookups/dtsrepoweredapp/config`, which the Settings page writes (step 5). So the standard files in [workflows/](../workflows/)
deploy as they are. `npm run check:workflows` checks that the generated scripts match the app's queries.

**Deploy with the script.** The files are templates wrapped in `metadata:` / `workflow:`, which `dtctl apply` would treat as
a dashboard. [scripts/deploy-workflows.mjs](../scripts/deploy-workflows.mjs) flattens each one and updates the workflow with the
same title in place (or creates it):

```
npm run deploy:workflows -- --context <dtctl-context> --dry-run
npm run deploy:workflows -- --context <dtctl-context> --run
npm run deploy:workflows -- --context <dtctl-context> --only slo
```

`--context` is required so a deploy never lands on the default tenant by accident. The lookups deploy and run first, the critical-services
workflow after them (it reads the seed table), and the snapshot last. If two workflows share a title the script stops for that one;
delete the extra first. Set each workflow's actor to the service user afterwards (step 3); the script does not change actors.

Workflows to deploy:

| Workflow | Writes | Schedule |
|---|---|---|
| DT-SRE APP: Build /lookups/dtsrepoweredapp/cmdb (application catalog from your AppId source table) (step 2.2) | `/lookups/dtsrepoweredapp/cmdb` | daily |
| DT-SRE APP: Seed /lookups/dtsrepoweredapp/entity_severity (starter list of user-facing services) (optional, step 2.4) | `/lookups/dtsrepoweredapp/entity_severity` (only if it is missing, a placeholder or an earlier starter) | none; run manually |
| DT-SRE APP: Refresh /lookups/dtsrepoweredapp/critical_services (entity_severity resolved to entity IDs) | `/lookups/dtsrepoweredapp/critical_services` | none; run manually |
| DT-SRE APP: Refresh /lookups/dtsrepoweredapp/guardians (SRG by AppId) | `/lookups/dtsrepoweredapp/guardians` | daily |
| DT-SRE APP: Refresh /lookups/dtsrepoweredapp/slo_dashboards (SLO dashboards by AppId) | `/lookups/dtsrepoweredapp/slo_dashboards` | daily |
| DT-SRE APP: Refresh /lookups/dtsrepoweredapp/slo (SLOs by AppId) | `/lookups/dtsrepoweredapp/slo` | hourly |
| DT-SRE APP: Daily Maturity Snapshot (one bizevent per AppId) | bizevents `workflow.summary.sre_maturity` in bucket `dtsrepoweredapp_snapshots` | daily |

Save the Settings first (step 5): without `/lookups/dtsrepoweredapp/config` the workflows stop with "Cannot read
/lookups/dtsrepoweredapp/config". Then run the catalog first, then the lookup refreshes, then the snapshot.

## 7. Verify

Run the snapshot workflow once from the Automations app, then check:

**Business events were written to the snapshot bucket**

```dql
fetch bizevents, from: now()-2h
| filter dt.system.bucket == "dtsrepoweredapp_snapshots" and event.type == "workflow.summary.sre_maturity"
| summarize events = count(), apps = countDistinct(appId), latest = max(timestamp)
```

Expect one event per application. The field is always `appId`, whatever your identifier is called.

**Scores are not all zero**

```dql
fetch bizevents, from: now()-2h
| filter dt.system.bucket == "dtsrepoweredapp_snapshots" and event.type == "workflow.summary.sre_maturity"
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
- Record the service user and the workflow IDs somewhere the customer controls. The settings live in `/lookups/dtsrepoweredapp/config` (the app keeps a copy of the previous version in `config_backup` on each save).

## Known gaps for non-United customers

These are conventions in the app that settings do not cover yet:

- **SLOs are handled.** The SLO workflow writes each SLO's application ID (its `<tag key>:<id>` tag, for any of the
  configured tag keys, falling back to the name up to its first separator). The app's SLO counts and the SLO detail modal
  use the same rule. There is nothing to configure.
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
| Snapshot stops: bucket does not exist, or no events reached it | The snapshot bucket or its OpenPipeline route is missing | Step 6.1. |
| A workflow stops: cannot read `/lookups/dtsrepoweredapp/config` | The catalog workflow has not run yet | Run it first (step 6.2). |
| SLO-dashboards workflow reports 0 matches | The 3-character name convention does not fit | See known gaps (not yet configurable). |
