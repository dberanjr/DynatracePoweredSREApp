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

The app reads these tables from Grail (`load "/lookups/..."`). Paths are configurable in Settings. See
[HOW-TO-USE.md section 4.3](HOW-TO-USE.md) for the sample CSVs in [lookups/](../lookups/).

| Table | Purpose | Who maintains it | Default path |
|---|---|---|---|
| CMDB | Application catalog: name, tier, owner, status | Customer (source data) | `/lookups/cmdb_appci_owner_mapping` |
| Application-name map | Display name per identifier | Customer, or generated from the CMDB | `/lookups/appci_map` |
| Critical services | Entities marked critical (seeds L2 checks) | Workflow, from `entity_severity` | `/lookups/critical_services` |
| Entity severity | Seed list: which entities are critical | **Customer, by hand** | `/lookups/entity_severity` |
| SLOs / SLO dashboards / Guardians | Per-application lookups | Workflows | `/lookups/slo`, `/lookups/slo_dashboards`, `/lookups/guardians` |

### 2.1 Upload the CMDB table

```
dtctl apply -f <lookup-definition>.yaml      # or upload the CSV from the Lookups tab / Notebooks
```

**TODO:** pin down the exact `dtctl` command for lookup upload (the NM tables were created through the
`lookup:upload` API with a `^` delimiter; see `scripts/workflow-scripts/refresh-lookups-utan-active*.js`).

### 2.2 Drop identifiers that have no live entities (recommended)

A CMDB lists applications that are retired or never instrumented. They clutter the picker and score zero.
NM solved this with a workflow, **Refresh /lookups/utan_active**
([workflows/refresh-lookups-utan-active.workflow-template.yaml](../workflows/refresh-lookups-utan-active.workflow-template.yaml)):

- Reads the source table, keeps only identifiers that have at least one live Smartscape node tagged with them in
  the last 24 hours, writes the result to `/lookups/utan_active`.
- Throws if it would keep zero rows, so a broken query never wipes the table.
- Runs daily. **Edit the constants at the top of the script** (source path, destination path, tag key, columns)
  for the new customer.

Point the app's CMDB path at the destination table (step 5).

### 2.3 Create the name map

The map is two columns: the identifier and a display name. NM generated it from the CMDB export
(`/lookups/utan_map`, 784 rows). The name of the table is up to you; set it in Settings.

### 2.4 Create placeholders for the hand-maintained tables

Workflows fail with `UNKNOWN_TABULAR_FILE` if a table they `load` does not exist, and an **empty** table breaks
consumers. Until the customer supplies real data, create each of these with a single sentinel row whose values
are `__none__`:

- `/lookups/entity_severity` (seed for the critical-services workflow)
- `/lookups/critical_services` (read by the snapshot workflow)

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
| CMDB path | `/lookups/utan_active` | Use **Detect columns**, then map each column. |
| Operational status column | blank | A mapped column that does not exist makes the picker show only "N/A". The Settings page warns in red. |
| Name map path | `/lookups/utan_map` | |
| Tier values | `yes` = Top tier (critical), `no` = Not top tier | |
| SLOs table: Application ID column | `appci` (after the SLO workflow has run once) | Blank = first 3 characters of the SLO name. |

Use **Export saved settings** to produce the JSON that drives the workflow generator in step 6. A worked example
is [scripts/settings/nm.json](../scripts/settings/nm.json).

Tables you point at your own paths are shown read-only in the Lookups tab.

## 6. Generate and deploy the workflows

The workflows embed the same queries as the app, so they are generated from the app's code and your settings.

```
npm run generate:workflows -- --config <exported-settings>.json
npm run check:workflows -- --config <exported-settings>.json    # confirm nothing is out of date
```

Without `--config`, the generator produces the United defaults.

**The generated files are templates**, wrapped in `metadata:` / `workflow:`. `dtctl apply` treats that wrapper as a
dashboard, so deploy by flattening the `workflow:` block into its own YAML (add `id:` to update an existing
workflow in place), then `dtctl apply -f <flattened>.yaml`.

**TODO:** add a script that flattens and applies all workflows so this is one command.

Workflows to deploy:

| Workflow | Writes | Schedule |
|---|---|---|
| Refresh /lookups/utan_active (customer-specific, step 2.2) | `/lookups/utan_active` | daily |
| Refresh /lookups/critical_services | `/lookups/critical_services` | daily |
| Refresh /lookups/guardians | `/lookups/guardians` | daily |
| Refresh /lookups/slo_dashboards | `/lookups/slo_dashboards` | daily |
| Refresh /lookups/slo | `/lookups/slo` | daily |
| SRE Maturity Daily Snapshot | bizevents `workflow.summary.sre_maturity` | daily |

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
- Tell them who owns the CMDB source table and how often it changes. The `utan_active` workflow only filters; it
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
| `UNKNOWN_TABULAR_FILE` in a card or workflow | A lookup the query loads does not exist | Create it (placeholder in step 2.4) or fix the path in Settings. |
| `FIELD_DOES_NOT_EXIST` | A column name in Settings is not a column of the table | Re-run **Detect columns**. |
| Lookups tab: 403 on save | Missing `storage:files:write` | Add it to the user's policy. |
| Snapshot "succeeds" but no bizevents | Older versions swallowed ingest errors | Regenerate and redeploy; the current script throws on failure. |
| Snapshot fails with 403 on ingest | Actor lacks `openpipeline:bizevents:ingest` | Step 3. |
| SLO-dashboards workflow reports 0 matches | The 3-character name convention does not fit | See known gaps (not yet configurable). |
