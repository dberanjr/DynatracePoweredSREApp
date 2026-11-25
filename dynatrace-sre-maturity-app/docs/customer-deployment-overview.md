# Dynatrace-Powered SRE Maturity App: Deployment Overview for [Customer]

Version 2.72.0 · prepared [date] · items in **[brackets]** are still to be confirmed with [Customer].

> **How to use this template (delete this box before sending).** It is the same for every customer. Copy the file,
> replace `[Customer]` and `[date]`, answer or delete each **[bracket]**, and send the result. The brackets are:
> the identifier (section 3), the target environment (section 6, item 7), the naming-rule samples (section 6, item 4),
> the service-user policy check (section 4), and the support contacts (section 9). Keep other customers' names out of
> the copy you send.

## 1. What this is

A Dynatrace app that scores each application on a five-level SRE maturity model, using data already in your tenant
(entities, logs, traces, metrics, problems, SLOs, Guardians, workflows). Nothing is installed on hosts, and nothing
leaves the tenant: the app and its workflows call only Dynatrace platform APIs inside the tenant.

## 2. What will be added to the tenant

| # | Item | Details |
|---|---|---|
| 1 | **App** `my.dynatrace.sre.maturity.app` ("DynatracePoweredSRE") | One custom app installed from our build. Requests the 15 scopes in section 5. |
| 2 | **Six Automation workflows** | Listed below: five build lookup tables and one writes the daily snapshot. All are identical for every customer; they read your values (source table and column mapping, the application ID tag keys) from the app's Settings at run time. |
| 3 | **Lookup tables** (Grail) | All in one fixed folder, `/lookups/dtsrepoweredapp/` (not configurable): see below. One of them, `config`, holds your settings; the app's Settings page writes it (it needs permission to write lookup tables) and every workflow reads it. |
| 4 | **Business events, in their own bucket** | One event per application per day, type `workflow.summary.sre_maturity`, stored in a dedicated Grail bucket `dtsrepoweredapp_snapshots` (table `bizevents`, retention of your choice, default 365 days). An OpenPipeline route sends them there. See section 3. |
| 5 | **OpenPipeline pipeline and route** | A custom bizevents pipeline that assigns the snapshot bucket, and one entry added to the bizevents routing settings (your existing entries are kept). Created once by an administrator. |
| 6 | **App settings** | Stored in the lookup `config` (item 3), shared by all users. **Nothing is written to Dynatrace tenant Settings.** |

**Workflows** (every title starts with `DT-SRE APP:`, so they are easy to find in the Automations list)

| Workflow | Schedule (UTC) | Reads | Writes |
|---|---|---|---|
| DT-SRE APP: Refresh /lookups/dtsrepoweredapp/slo (SLOs by AppId) | hourly (`0 * * * *`) | Gen3 SLO API | `slo` lookup |
| DT-SRE APP: Refresh /lookups/dtsrepoweredapp/guardians (SRG by AppId) | daily 06:00 | Guardian settings objects | `guardians` lookup |
| DT-SRE APP: Refresh /lookups/dtsrepoweredapp/slo_dashboards (SLO dashboards by AppId) | daily 06:15 | Dashboard documents | `slo_dashboards` lookup |
| DT-SRE APP: Seed /lookups/dtsrepoweredapp/entity_severity (starter list of user-facing services) (optional) | **none** (run manually, once) | cmdb, Smartscape services | `entity_severity` lookup, only if you have no list yet; never overwrites your own |
| DT-SRE APP: Refresh /lookups/dtsrepoweredapp/critical_services (entity_severity resolved to entity IDs) | **none** (run manually, or we add a schedule) | `entity_severity` seed lookup, Smartscape, services | `critical_services` lookup |
| DT-SRE APP: Build /lookups/dtsrepoweredapp/cmdb (application catalog from your AppId source table) | daily 05:00 | **your source table** (any path, any column names), Smartscape | `cmdb` lookup: your columns normalised, only applications with live nodes |
| DT-SRE APP: Daily Maturity Snapshot (one bizevent per AppId) | daily 06:15 | Grail (5 scoring queries), lookups | Business events |

**Lookup tables**

| Table | Filled by | Purpose |
|---|---|---|
| **Your source table** | **[Customer]** (your CMDB export, any columns, any `/lookups/...` path) | Your initial application data; the one table whose path and column names you choose |
| `cmdb` (application catalog) | Workflow, from your source table | Fixed-column catalog the app reads; only applications with live nodes |
| Application name map | **[Customer]**, or generated from the CMDB | Name to application ID |
| Entity severity (critical-services seed) | **[Customer]**, by hand | Which services count as critical |
| `slo`, `slo_dashboards`, `guardians`, `critical_services` | Workflows | Scoring inputs |

The source table can have any column names and any path; the catalog workflow maps and filters it. The other tables
are at the fixed location above.

Saving a table from the app's Lookups tab also writes a `*_backup` copy of the previous version.

## 3. Installing and deploying (needs an administrator)

- **Installing the app:** a user with permission to install custom apps (`app-engine:apps:install`) deploys it once.
  Installation shows the 15 scopes for approval.
- **Creating the workflows:** a user with `automation:workflows:write` creates them (we supply them as files).
- **Assigning the service user as each workflow's actor:** needs `iam:service-users:use` and
  `automation:workflows:admin`.
- **Snapshot bucket and route (once, by an administrator):** `scripts/setup-snapshot-bucket.mjs` creates the bucket, the pipeline and the route. The person running it needs `storage:bucket-definitions:write` and settings write access for the OpenPipeline bizevents pipelines and routing schemas. This is separate from the workflows' service user. Until it is done the snapshot workflow stops with a clear error and writes nothing.
- **Identifier:** the app needs the field that ties your entities to an application (the tag key on your entities,
  for example `appId`). [Customer]: **[identifier name, example values, length]**.

## 4. Service account for the workflows

Workflows run as the **actor** you assign. We recommend a dedicated **service user**, so scheduled runs don't depend
on a person's account.

**Policy for the service user** (permission names checked against the Dynatrace IAM documentation):

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

**What this grants, in plain terms**
- **Write:** only `storage:files:write` (lookup tables) and `openpipeline:bizevents:ingest` (the daily snapshot
  events). It cannot change entities, settings, dashboards, SLOs or alerting.
- **Everything else is read-only.**
- **Optional tightening:** limit `storage:files:*` to lookups with
  `WHERE storage:file-path startsWith "/lookups/"`. Add `/dtsrepoweredapp/` to narrow it further.
- **Without `openpipeline:bizevents:ingest`** the snapshot fails with
  `403: User is missing required permission: openpipeline:bizevents:ingest`. Without `storage:files:write`, lookup
  refreshes fail.

**Caveat:** Dynatrace's documentation does not list which permissions JavaScript workflow tasks need, so we confirm
by running each workflow once after setup and reading any 403. **[Sender: confirm the policy against a service user that has run these workflows; the list is checked against the
documentation, not against a live policy.]**

## 5. Permissions for people who use the app

**App scopes** (declared by the app, shown at install; users need the matching permissions):
`storage:logs:read`, `storage:buckets:read`, `storage:files:read`, `storage:files:write`, `storage:events:read`,
`storage:bizevents:read`, `storage:metrics:read`, `storage:entities:read`, `storage:system:read`,
`storage:spans:read`, `storage:smartscape:read`, `settings:objects:read`, `document:documents:read`,
`iam:users:read` (resolves dashboard owner IDs to names), `slo:slos:read`.

**Suggested groups**
- **Viewers:** `storage:files:read` plus read access to the data above.
- **Lookup editors:** also `storage:files:write`. This permission is broader than the app (it allows writing any
  lookup file), so use the file-path condition if your policy editor supports it.

## 6. What we need from [Customer] before go-live

1. The application identifier, how entities carry it, and its maximum length.
2. Your application data as a lookup table, in any columns (one row per application: ID, name, ideally tier, owner,
   support group), plus which column holds what. The catalog workflow maps it to the app's fixed columns.
3. Which CMDB column means "critical" and which values count as critical.
4. SLO, dashboard, runbook, burn-rate alert and workflow naming: SLOs are matched by tag. Dashboards, runbooks, alerts and
   workflows are matched by name: **the application ID must appear in the name as a separate word, anywhere in it**
   (for example `CRM 47689 Runbook`, or a workflow titled `Loans sync (47689)`). Runbooks also need the word `Runbook`,
   SLO dashboards the word `SLO` in capitals, burn-rate alerts the words `burn rate`.
5. An initial critical-services seed list (or we start with an empty placeholder).
6. The service user, group, and the person who will assign it to the workflows.
7. **[Which Dynatrace environment(s), and whether production-only or a lower tenant first.]**

## 7. Data and volume

- **Read:** entity, span, log, metric, event, business-event, problem and Smartscape data via DQL; SLOs; Guardian
  settings objects; dashboard documents.
- **Written:** the lookup tables above, and the daily business events (into the snapshot bucket).
- **Business events:** one per application per day. A reference deployment with about 500 applications produces roughly 500 per day. Fields:
  the identifier, `snapshotDate`, `l1Score` to `l5Score`, `total`, `totalMax`, `pct`, `grade`, plus the standard
  CloudEvents attributes. Retention follows the snapshot bucket's own setting, so you choose it, and its records can be deleted if needed. The field holding the application ID is always called `appId`.
- **Query volume:** the daily snapshot runs five scoring queries. On a reference tenant they scanned about **87 GB in total**
  (roughly 9, 1, 27, 51 and 0.2 GB), about 10 seconds of run time, once per day. The other workflows scan little
  (the SLO, Guardian and dashboard refreshes read APIs, not Grail). **Your volume will differ with data size;
  we have not measured it for your tenant, and we have not converted this into a consumption cost.**
- **Network:** no external calls. The only outbound reference is an optional logo URL a user may set in the app.

## 8. Backing out

- Uninstall the app (removes it and its UI).
- Disable or delete the workflows.
- Delete the lookup tables under `/lookups/dtsrepoweredapp/` (and the `*_backup` copies).
- Remove the snapshot route from the bizevents routing settings, delete the pipeline, and delete the `dtsrepoweredapp_snapshots` bucket (deleting the bucket removes the stored snapshots).
- Delete the service user and its policy.

## 9. Support and ownership

**[Name/contact at Dynatrace for support; who at [Customer] owns the CMDB data and the critical-services seed.]**
