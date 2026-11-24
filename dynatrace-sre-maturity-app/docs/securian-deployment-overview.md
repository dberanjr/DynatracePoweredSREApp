# Dynatrace-Powered SRE Maturity App — Deployment Overview for Securian (Production)

Version 2.72.0 · prepared 2026-11-24 · items in **[brackets]** are still to be confirmed with Securian.

## 1. What this is

A Dynatrace app that scores each application on a five-level SRE maturity model, using data already in your tenant
(entities, logs, traces, metrics, problems, SLOs, Guardians, workflows). Nothing is installed on hosts, and nothing
leaves the tenant: the app and its workflows call only Dynatrace platform APIs inside the tenant.

## 2. What will be added to the tenant

| # | Item | Details |
|---|---|---|
| 1 | **App** `my.dynatrace.sre.maturity.app` ("DynatracePoweredSRE") | One custom app installed from our build. Requests the 15 scopes in section 5. |
| 2 | **Six Automation workflows** | Listed below. Five refresh lookup tables; one writes the daily snapshot. The sixth, the "active applications" filter, is optional and depends on your CMDB data ([confirm]). |
| 3 | **Lookup tables** (Grail) | Under `/lookups/sre/` by default (paths are configurable): see below. |
| 4 | **Business events** | One event per application per day, type `workflow.summary.sre_maturity`, in your default business-events bucket. |
| 5 | **Per-user app settings** | Stored in each user's browser only. **Nothing is written to tenant Settings.** |

**Workflows**

| Workflow | Schedule (UTC) | Reads | Writes |
|---|---|---|---|
| Refresh /lookups/slo | hourly (`0 * * * *`) | Gen3 SLO API | `slo` lookup |
| Refresh /lookups/guardians | daily 06:00 | Guardian settings objects | `guardians` lookup |
| Refresh /lookups/slo-dashboards | daily 06:15 | Dashboard documents | `slo_dashboards` lookup |
| Refresh /lookups/critical_services | **none** (run manually, or we add a schedule) | `entity_severity` seed lookup, Smartscape, services | `critical_services` lookup |
| Refresh active applications (optional) | daily 05:00 | CMDB lookup, Smartscape | active-applications lookup |
| SRE Maturity Daily Snapshot | daily 06:15 | Grail (5 scoring queries), lookups | Business events |

**Lookup tables**

| Table | Filled by | Purpose |
|---|---|---|
| CMDB (application catalog) | **Securian** (from your CMDB export) | Application name, tier, owner |
| Application name map | **Securian**, or generated from the CMDB | Name to application ID |
| Entity severity (critical-services seed) | **Securian**, by hand | Which services count as critical |
| `slo`, `slo_dashboards`, `guardians`, `critical_services` | Workflows | Scoring inputs |

Saving a table from the app's Lookups tab also writes a `*_backup` copy of the previous version.

## 3. Installing and deploying (needs an administrator)

- **Installing the app:** a user with permission to install custom apps (`app-engine:apps:install`) deploys it once.
  Installation shows the 15 scopes for approval.
- **Creating the workflows:** a user with `automation:workflows:write` creates them (we supply them as files).
- **Assigning the service user as each workflow's actor:** needs `iam:service-users:use` and
  `automation:workflows:admin`.
- **Identifier:** the app needs the field that ties your entities to an application (tag key / field). Our NM
  deployment uses `utan`. Securian: **[identifier name, example values, length]**.

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
  `WHERE storage:file-path startsWith "/lookups/"`. Add `/sre/` to narrow it further.
- **Without `openpipeline:bizevents:ingest`** the snapshot fails with
  `403: User is missing required permission: openpipeline:bizevents:ingest`. Without `storage:files:write`, lookup
  refreshes fail.

**Caveat:** Dynatrace's documentation does not list which permissions JavaScript workflow tasks need, so we confirm
by running each workflow once after setup and reading any 403. **[Before sending: confirm which policy the NM service
user actually used; this list has been checked against the documentation, but not against an exact NM policy.]**

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

## 6. What we need from Securian before go-live

1. The application identifier, how entities carry it, and its maximum length.
2. A CMDB export (one row per application: ID, name, ideally tier, owner, support group).
3. Which CMDB column means "critical" and which values count as critical.
4. SLO, dashboard and runbook naming: the app's SLO matching works by tag or by name prefix. Dashboard, runbook and
   alert-name checks currently expect the first three characters of the name to be the application code.
   **[We need sample names to see if a rule fits.]**
5. An initial critical-services seed list (or we start with an empty placeholder).
6. The service user, group, and the person who will assign it to the workflows.
7. **[Which Dynatrace environment(s), and whether production-only or a lower tenant first.]**

## 7. Data and volume

- **Read:** entity, span, log, metric, event, business-event, problem and Smartscape data via DQL; SLOs; Guardian
  settings objects; dashboard documents.
- **Written:** the lookup tables above, and the daily business events.
- **Business events:** one per application per day. Our own tenant onboarding produces about 530 per day. Fields:
  the identifier, `snapshotDate`, `l1Score` to `l5Score`, `total`, `totalMax`, `pct`, `grade`, plus the standard
  CloudEvents attributes. Retention follows the bucket's existing policy.
- **Query volume:** the daily snapshot runs five scoring queries. On our tenant they scanned about **87 GB in total**
  (roughly 9, 1, 27, 51 and 0.2 GB), about 10 seconds of run time, once per day. The other workflows scan little
  (the SLO, Guardian and dashboard refreshes read APIs, not Grail). **Securian's volume will differ with data size;
  we have not measured it for your tenant, and we have not converted this into a consumption cost.**
- **Network:** no external calls. The only outbound reference is an optional logo URL a user may set in the app.

## 8. Backing out

- Uninstall the app (removes it and its UI).
- Disable or delete the six workflows.
- Delete the lookup tables under `/lookups/sre/` (and the `*_backup` copies).
- Delete the service user and its policy.
- Business events already written expire with the bucket's retention; individual events can't be deleted.

## 9. Support and ownership

**[Name/contact at Dynatrace for support; who at Securian owns the CMDB data and the critical-services seed.]**
