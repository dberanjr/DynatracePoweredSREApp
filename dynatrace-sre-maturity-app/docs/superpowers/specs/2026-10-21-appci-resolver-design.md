# AppCI Resolver: scoring tenants that do not tag `applicationci`

## Motivation

Every score in the app is keyed on a 3-letter AppCI, and the queries found it in exactly one way: an
`applicationci:<code>` entity tag. That convention came from the tenant the app was first built for.
In the customer's tenants (read-only queries, 2026-10-20/21) it does not hold:

| Tenant | Services | With `Application:` tag | With `applicationci` tag | CMDB lookup |
|---|---|---|---|---|
| Non-prod test tenant | 2,665 | ~96% | **0** | 4 sample rows |
| The customer's prod tenant | 2,556 | 2,403 (94%) | **0** | **does not exist** |

Hosts show the same pattern (0 of 967 in nonprod). The tag the customer does use is
`Application:<Name>::<ENV>`, for example `Application:Gateway::PRD` (nonprod uses `::CRT` and `::SPT`;
problem `entity_tags` carry both `Application:VendorxEncounters` and
`Application:VendorxEncounters::CRT`). The 3-letter code exists only in the CMDB, which is not a tag.

With the old contract the leaderboard, scorecards and snapshot returned nothing for these tenants:
`L1`–`L4` produced zero rows and only `L5` (workflow titles) returned data.

This branch exists to make the app work in a tenant it was not written for, so the contract has to
become configurable data, not a convention baked into about 80 queries.

## Decision

Add an **AppCI map** lookup, `/lookups/appci_map`, and resolve an entity's AppCI from **either** source:

1. an `applicationci:<code>` tag (unchanged behavior), or
2. an `Application:<Name>` tag whose name has a row in the map.

The two are unioned, so a tenant that already tags `applicationci` keeps working, and a tenant can mix
both. The resolution is done **in the queries**, not in the tenant.

### Alternatives considered

| Option | Why not (or when) |
|---|---|
| **Tenant-side tagging**: a workflow creates `applicationci:<code>` auto-tagging rules from the CMDB | Needs settings-write permission and creates per-tenant configuration, which many customers will not grant a third-party app. It also has an unverified rule-count limit, and I did not confirm a rule can match on an existing `Application:` value. It *would* fix every query shape at once, so it remains the better fix for a tenant that allows it. |
| **Join on the CMDB `name`** | The CMDB names carry the environment (`MemberHub_CRT`); the tag name does not necessarily match per environment, and prod has no CMDB. Environment would also need a row per environment. |
| **Do nothing; require customers to tag `applicationci`** | Defeats the goal of a universal app. |

## The map

`/lookups/appci_map`, maintained on the Lookups tab (same editor, validation and backup as the other
hand-maintained tables).

| Column | Rule |
|---|---|
| `app_name` (key) | Lower case. The application name **without** its environment suffix. Must not contain `::` or a backslash. Unique. |
| `applicationci` | Lower case, letters/digits/`_`/`-`. Several names may share one code. |

**Why the environment is dropped.** `Application:BillingPortal::CRT`, `::SPT` and `::PRD` are one
application. Keying on the name gives one row for all of them. The cost: an application cannot be scored
separately per environment through this table.

**Name normalization** (one definition, `applicationNameExpr` in the shared module): take the first
`Application:` tag, remove backslashes (Dynatrace stores the colons of a value escaped, so the raw tag is
`Application:Gateway\:\:PRD`), cut at `::`, lower-case.

## Where it applies

One module, `ui/app/queries/maturityQueries.ts`, has no imports so the snapshot workflow generator can load
it with Node's built-in type stripping. It exports:

- `appciFromEntityTags()`: replaces the two `fieldsAdd applicationci = ...` statements before
  `| expand applicationci` on any `dt.entity.*` fetch. Leaves `applicationci` as an array of codes.
- `appciFromProblemTags()`: replaces the `appci = splitString(... entity_tags ...)` line on
  `dt.davis.problems`. Leaves a scalar `appci` (the tag, otherwise the mapped code).
- `unmappedApplicationsQuery()` and `APPCI_MAP_ROWS_QUERY`: the Coverage page's to-do lists.
- `BULK_L1_QUERY`…`BULK_L5_QUERY`: moved out of `MaturityLeaderboard.tsx`.

| Shape | Sites | Files |
|---|---|---|
| Entity tags → AppCI array | 25 (+ 8 in the generated snapshot) | leaderboard bulk queries, `ScorecardsPage`, `checkDetailConfigs`, `CoveragePage` |
| Problem tags → `appci` | 13 (+ 2 in the snapshot) | leaderboard, `ScorecardsPage`, `checkDetailConfigs` |
| `expand tags` + `parse` row-per-tag | 5 | `ServiceGoldenSignalsTable`, `UpstreamDownstreamPage`, `checkDetailConfigs` (RUM), `App.tsx` picker fallback, `useDependencyChain` |

### The workflows use the same resolver

Two workflows are generated from the shared module, not hand-copied:

- **Daily snapshot**: the five bulk queries (below).
- **Critical-services refresh**: its three tag-to-AppCI steps. Stage 1 (span endpoint → service) uses
  `appciFromEntityTags` on `entityAttr(...)` output through its field-name options; stage 2 (service by name)
  uses it unchanged; stage 3 (any other Smartscape node by name) reads the `Application` tag-map value and maps
  it with `appciMappedFromTagValue`. The workflow's chunking, flattening and upload code is untouched.

Behavior change worth knowing: in stage 1 the old filter kept an endpoint's service when it had *no*
`applicationci` tag, so in an untagged tenant every seed row matched the first service found, **whichever AppCI
it was listed under**. Now a service that resolves to an AppCI is only used for that AppCI, so a row listed under
the wrong AppCI is dropped. See the consequences below.

### The snapshot workflow is generated, not copied

The workflow cannot import app code, so it embedded a hand-copied duplicate of the leaderboard queries.
The copies drifted: the deployed workflow ran stale L1–L4 logic (fixed in the previous change) and, in
the non-prod test tenant, failed on every scheduled run for a month before anyone noticed.

`scripts/generate-snapshot-workflow.mjs` now builds the script from the shared module and a template
(`workflows/sre-maturity-daily-snapshot.script.template.js`), writing the `.workflow.json` and `.yaml`.
`npm run check:workflows` exits 1 if either is stale. The generated `QUERIES` block was verified to equal
the module's strings exactly, and the rest of the script is byte-identical to the previously deployed one.

### Not covered (still read their sources as before)

- **Un-navigated legacy pages** (Overview, Golden Signals, AI Ops, Proactive, Portfolio, Data, Problem
  Analytics): routed in `App.tsx` but absent from the navigation, and no other component links to them
  (checked by search), so they are reachable only by typing the URL. About 25 further sites use two more
  tag-parsing shapes (`expand tags` + `parse`; events' `affected_entity_tags`), and Problem Analytics has
  two more problem-tag sites. Changing unverified queries on pages nobody navigates to was judged a net
  risk. They keep working for tenants that tag `applicationci`.
- **Problems-app deep link** in `ProblemAnalyticsPage`: it filters on `applicationci:<code>`, which will
  match nothing in a tenant that only has `Application:` tags. It needs a reverse map (code → name).
- **Other sources of an AppCI.** Measured in prod unless noted: logs (attribute `applicationci`) **0
  of 32,774** sampled; Azure resources (`ApplicationCI` tag) **0 of 130,546**; deployment events
  (`CUSTOM_DEPLOYMENT`) **0** in 30 days; SRG validation events **0** in 30 days; no `workflow.*` bizevents at
  all in 7 days; Kubernetes clusters are named for sites (`site-a-prd-dmz`, `site-b-prd-mpn-2`), not AppCIs.
  SLO, Guardian, dashboard and runbook naming in prod is **unverified** (not queryable from the tools used);
  nonprod SLOs are `Frontend Availability SLO`, `CPU utilization`, `Service availability`. These checks read as
  missing until the customer supplies the inputs; see "Second pass" for what was fixed in code.

## Second pass: gaps fillable in code

A check-by-check audit of what the original design assumes against what the customer's prod tenant has found four gaps
that need no customer input. All four are fixed and verified:

1. **L2 SRE Assessment** read ServiceNow import bizevents (`workflow.import.servicenow.appci`); none exist in
   prod. It now passes when the application's CMDB row has a non-blank `business_criticality` **or** such an
   import event carried a tier (`hasTierLookup`). This is what the how-to guide already said the check did, and
   it matches the identity bar, which treats the CMDB table as primary and the import as the fallback.
   Nonprod: L2 for `mem`, `doc`, `bil` went 1 → 2.
2. **L5 workflows** required the first word of a workflow title to be the 3-letter code. Prod's titles are
   `MemberHub Validation`, `BillingServices - …`, `CrmSuite_PRD open problems alert`. The title now also resolves
   through the AppCI map, ignoring a `_PRD` style suffix (`appciFromWorkflowTitle`). Verified on prod's real
   titles with an inline map: `MemberHub…`→`mem`, `BillingServices…`→`bil`, `CrmSuite_PRD…`→`dcr`; generic workflows
   stay unresolved. Nonprod L5 for `mem`: absent → 3. The L3 ITSM check (`* Production Dynatrace Alerts`) is a
   different convention and was **not** changed: no such workflow exists in prod, so it fails tenant-wide there
   until the check is redefined (not done).
3. **Dashboards source.** The leaderboard and snapshot counted `workflow.summary.dashboard` bizevents (none in
   prod, so always 0) while the Scorecards page read `/lookups/slo-dashboards`. All three now read the lookup, so
   one application can no longer pass on one surface and fail on another.
4. **Multi-value Smartscape tags.** A monitor tagged with several `Application` values returns a list whose
   text form broke the name (`["care manager", "care manager`). The first value is now used (`appciMappedFromTagValue`).
   Verified: a monitor tagged `["MemberHub::CRT", "PDP"]` was unresolved before and resolves now. For classic
   services only the first `Application` tag is used; this affects 6 of 2,542 prod services (0.2%) that carry two
   different applications, so it was left.

New hard dependencies: scoring queries now also load the CMDB table (fix 1) and `/lookups/slo-dashboards`
(fix 3), joining `/lookups/appci_map`, `/lookups/slo`, `/lookups/guardians` and `/lookups/critical_services`. A
tenant missing any of them fails the affected query, as before for the others.

## Failure modes and how they are handled

| Failure | Behavior |
|---|---|
| The map does not exist | Every scoring query fails (`UNKNOWN_TABULAR_FILE`). `App.tsx` probes once and shows an **AppCI map not found** banner linking to the Lookups tab (hidden on that tab). Documented as a required setup step; a tenant that tags `applicationci` still needs the table (one placeholder row). |
| An application name has no row | It silently does not appear. Mitigation: **Coverage → Application names with no AppCI** lists every such name with its service count. |
| A map row points at an AppCI missing from the CMDB | **Coverage → AppCI map rows that point outside the CMDB table**. |
| A name is entered with its suffix (`billingportal::crt`) | Rejected on save (it could never match). |
| Environment variants map to different codes | Not expressible. By design: one name, one code. |

## Verification performed (the non-prod test tenant, read-only apart from the items below)

- All five bulk queries, run through `dtctl query`: **3 rows each for L1–L4, 2 for L5**, scores populated
  (for example L1 = 5 for `bil`, `doc`, `mem`). Before this change L1–L4 returned zero rows in the tenant.
- Every macro site in `ScorecardsPage` (8 of 8) and `checkDetailConfigs` (19 of 19) executed against the
  tenant for `bil` and returned data (for example 40 services, 3 problems with root causes). Each template
  was extracted with the TypeScript parser, so placeholders could not be silently left unresolved. Plus the
  five `row-per-tag` sites, the dependency-chain join and the Coverage queries.
- `tsc --noEmit` on the UI passes. ESLint: 66 errors before and after (all pre-existing); the two new files
  are clean.
- **Critical-services workflow, old script vs new script, same stand-in seed, no writes.** Service names
  (`bil`, `doc`, `mem`): old **0 of 4 resolved**, new **4 of 4** (a CMDB-style name used as a control correctly
  stayed unresolved). Smartscape-only names (an Azure server farm, two HTTP monitors): old 0 of 3, new 3 of 3.
  Span endpoint names with a cross-app control row: old attributed a `doc` endpoint to `mem`; new rejected it.
  `Default Web Site:80`, which exists in several apps, resolved only to the two `bil`-tagged services.
  The updated workflow was then deployed and run once: `SUCCESS`, and the lookup was rewritten with the same
  4 rows (unresolved, as before) because the tenant's real seed holds CMDB names.
- The regenerated snapshot workflow was deployed to nonprod and run once: `SUCCESS`, 5 applications
  processed, 1 batch ingested, 0 failures.
- Not exercised in a browser or running app: the Lookups tab with the new table, `saveLookup`'s new
  validation, the banner, and the Coverage page's new sections. Their queries were run; the React is
  type-checked only.

Changes made in the tenant for this: `/lookups/appci_map` created with 4 rows taken from the tenant's own
CMDB table (`billingportal`→`bil`, `memberhub`→`mem`, `docstore`→`doc`, `caremanager`→`crm`), and the
snapshot workflow updated and run once (adding another set of `sre_maturity` events for the day).

## Consequences and open questions

- **The map needs real content.** Prod has 62 distinct `Application` values. Until they are mapped, only
  mapped applications score. **Coverage** is the work list. The source of truth for name → code (CMDB
  export? an owner?) is not yet identified.
- **`::CRT`/`::SPT`/`::PRD` are treated as environments of one application**, which is an inference. If the
  CMDB treats them as separate CIs with separate codes, the map cannot express it and this needs revisiting.
- **Performance** is not a concern at this size (one small `lookup` per subquery over about 2.5k
  entities). It would be worth re-measuring with a much larger estate, since the lookup is added to every
  nested subquery.
- **Snapshot history is not comparable across this change** for any tenant whose scores move. Annotate the
  trend chart at the cutover.
- **A seed row can vanish rather than show `id_count = 0`.** If an endpoint belongs to a different AppCI, the
  row is dropped from `critical_services` (the old filter also dropped rows whose service carried a different
  `applicationci` tag, but a resolved AppCI makes this reachable in every tenant). An AppCI left with no rows
  scores n/a on the L2 "Critical Services Tagged" check, which counts as a pass. Not changed: surfacing dropped
  rows would need a different join shape. Documented in the how-to guide.
- **Duplicate snapshot events**: nothing deduplicates same-day reruns. Not addressed here.
- **A missing-map failure is loud on every page.** A more forgiving design (create an empty map on first
  run, or have the Lookups save accept zero rows with a sentinel, as the refresh workflows do) was not
  built.
