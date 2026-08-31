# Upstream/Downstream dependency viewer — design spec

Date: 2026-08-31
Status: approved by user in chat, pending spec review

## Goal

Add a new top-level tab, "Upstream/Downstream" (route `/upstream-downstream`),
that lets a user:

1. Pick an ApplicationCI (via the app's existing shared header picker).
2. See a table of that AppCI's services with golden signals (traffic, errors,
   p95 latency) and a critical-service severity badge.
3. Select a service from that table, which drives two independent panels: an
   interactive Smartscape **upstream** call-chain graph and a **downstream**
   call-chain graph, each defaulting to depth 1 with a slider (1-8) to expand
   further.
4. Under each graph, see: (a) the direct (level-1) dependencies with their
   AppCI(s) and the set of unique AppCIs among them, and (b) full-chain stats
   — total levels discovered (up to the depth-8 cap), a count per level, and
   the set of all unique AppCIs found across every level.

This is new subsystem work — no in-app call-chain traversal or graph
rendering exists in this codebase today (confirmed during research; see
"Current state" below).

## Non-goals

- No changes to the shared global AppCI picker's filter (`App.tsx:32-33`,
  `operational_status != "Retired"`, i.e. In Production + Implementing). That
  picker is used by every other tab; changing it is out of scope. Instead,
  this tab adds its own local guard (see "Production-status guard" below).
- No automated test suite. This repo has none today (only ESLint) — verification
  is manual smoke-testing against the live tenant, consistent with how every
  other feature here has been verified.
- No attempt to compute *true* unbounded depth. Hard-capped at 8 levels per
  direction (see "Depth cap and cycle safety").
- No modification to `/lookups/critical_services` or
  `/lookups/dynatrace/cmdb_appci_owner_mapping` — both are read-only inputs
  refreshed by existing workflows.
- Not replacing or removing the existing L1-4 "Smartscape Discovery" check or
  its `SmartscapeViewMenu` deep-link pattern — this tab reuses that pattern
  for a per-node "Open in Smartscape" link, it doesn't supersede it.

## Current state (for reference)

Patterns confirmed reusable during research, with exact locations:

- **Global AppCI picker**: `App.tsx:59-90` holds `selectedAppCI` state and
  `App.tsx:113-132` renders the `Select`. Every route receives the resulting
  `appCI` as a prop (`App.tsx:140-149`). The new route follows the same
  convention — no separate picker.
- **Golden-signals query** (table basis): `checkDetailConfigs.ts:595-627`,
  the L2 "Golden Signal SLIs" `detailQuery` — fetches AppCI-tagged services,
  joins a `timeseries` lookup for request count / failure count / p95. Already
  parameterized purely by `appCI` string interpolation (no backend function).
- **Critical-service lookup**: `checkDetailConfigs.ts:873-881`, the L2
  "Critical Services Tagged" `detailQuery` — loads `/lookups/critical_services`
  filtered by `appci`, with severity-rank fallback logic (`severityRank` at
  lines 876-878) that already tolerates bad/missing severity values. **Gotcha
  found during this spike and not yet handled anywhere in this codebase**:
  `entity_ids` is not always a single ID — some rows pack up to 153
  space-separated service IDs into one string. Any join against `entity_ids`
  (not just an `appci`-scoped filter) must `splitString(entity_ids, " ") | expand`
  first, or it silently misses matches.
- **AppCI owner/status lookup**: `/lookups/dynatrace/cmdb_appci_owner_mapping`
  is already queried in three places — `App.tsx:32-38`, `AppIdentityBar.tsx:55-65`,
  `AppContextBanner.tsx`. `AppIdentityBar` is a ready-made component (name,
  `business_criticality`, `operational_status`, owner, director, support
  group given just an `appCI` prop) — reusable as-is for this tab's header.
- **Smartscape deep-link pattern**: `CheckDetailModal.tsx:174-228`
  (`SmartscapeViewMenu`) builds `${envUrl}/ui/apps/dynatrace.smartscape/view/dynatrace.smartscape.${view}/${entityId}#from=now()-2h&to=now()`
  for 5 native Smartscape views including `upstream-call-chain` and
  `downstream-call-chain`. This is a link-out, not an in-app renderer — no
  actual traversal/graph-rendering code exists anywhere in the repo.
- **Fetch-once / lifted-selection pattern**: `ScorecardsPage.tsx:729-748`
  fetches once via `useDqlWithCache`, holds selection state at the page level,
  passes plain props to presentational children, renders one shared modal
  driven by that lifted state. The new page follows the same shape: lifted
  `selectedServiceId` + per-direction level state, presentational table and
  panel components below it.

### Validated DQL findings (live, against united-preprod, this spike)

- `smartscapeNodes "SERVICE" | traverse edgeTypes:{calls}, targetTypes:{SERVICE}, direction:forward|backward`
  is the correct topology-walk primitive. Chained hops are fast (150ms-1.5s
  even at 3 hops in testing) and there is no native recursive/variable-depth
  query — each depth level must be its own fully-chained query (DQL's
  documented pattern for "any depth" is literally `append`-ing separately
  chained traversals).
- `calls` is a **dynamic** edge — cycles are structurally possible (none
  observed in the sample tested, but must not be assumed impossible).
- `smartscapeNodes "SERVICE"` does **not** expose the `applicationci` custom
  tag (`tags` field returns `{}` via direct access, `getNodeField()`, and the
  `` `tags:custom` `` namespace — all tested, all empty). The tag only exists
  on the classic `fetch dt.entity.service` model for the same entity ID. AppCI
  derivation for any traversed node therefore requires a **hybrid join**:
  walk topology via `smartscapeNodes`/`traverse`, then join each resulting
  node's ID back to `fetch dt.entity.service | fields id, tags` and parse
  every `applicationci:*` tag value found (a service can legitimately carry
  more than one — observed 3 on one node in testing).
- Tag-derivation coverage (3/3 resolved in the sample tested) is far better
  than resolving AppCI via `/lookups/critical_services` alone (1/3 in the same
  sample, consistent with that table's tenant-wide ~38% resolution rate). Tag
  derivation is therefore the **primary** AppCI-resolution path; the
  critical-services lookup is used only for the severity/criticality badge,
  not for AppCI resolution.
- `fetch dt.entity.service | fields id, tags` used as the right side of the
  tag-join is not filtered to just the traversed IDs — it's a full entity-set
  scan (~5.6M records, ~1.6s observed). Acceptable for a handful of nodes per
  level; worth tightening later (e.g. an `in [...]` filter) if a level's
  fan-out grows large.

## Target architecture

### 1. Routing & nav

- `App.tsx`: add `<Route path="/upstream-downstream" element={<ErrorBoundary><UpstreamDownstreamPage appCI={appCI} /></ErrorBoundary>} />`.
- `Header.tsx`: add a `navItems` entry — `{ to: "/upstream-downstream", label: "Dependencies" }`.
- New file: `ui/app/pages/UpstreamDownstreamPage.tsx`.

### 2. New dependency

Add to `package.json`: `reactflow` (canvas, pan/zoom/drag, custom node
renderer) and `dagre` (hierarchical auto-layout). First visualization
dependency in this app — everything else today is hand-rolled divs/CSS (see
`custom-bar-chart-css-pattern` precedent) or a Strato chart type. Confirmed
via package inspection and Dynatrace's own docs that no Strato "NodeGraph" or
topology component exists (stable or preview, as of `3.2.0`).

### 3. Production-status guard

`UpstreamDownstreamPage` checks the current `appCI`'s `operational_status` via
the same `/lookups/dynatrace/cmdb_appci_owner_mapping` query `AppIdentityBar`
already runs (reuse the component or its query). If `operational_status !==
"In Production"`, render an inline notice — *"Call chain analysis requires an
In-Production application — `{appCI}` is currently `{status}`."* — and skip
the service-table and traversal queries entirely. The shared header picker is
untouched (still allows Implementing apps for other tabs).

### 4. Data layer

**`ServiceGoldenSignalsTable`** — adapts the existing L2 golden-signals query
(`checkDetailConfigs.ts:595-627`) for this AppCI, plus a critical-service
join: `load "/lookups/critical_services" | filter lower(appci)==lower(appCI)`
(this AppCI-scoped join needs no explode-fix, matching the existing L2
"Critical Services Tagged" pattern exactly since it's already filtered to one
AppCI). Adds a severity badge column. Row click → `onSelect(serviceId)`.

**`useDependencyChain(serviceId, direction, maxLevels = 8)`** — the shared
hook used by both the graph and the summary panel:

- Issues up to 8 independent, fully-chained `traverse` queries in parallel
  (level 1 = 1 hop, level 2 = 2 chained hops, ... level 8 = 8 chained hops),
  each starting fresh from `serviceId`. Parallel dispatch is viable given the
  sub-2s-per-query timings observed during this spike.
- For each level's result set, dedups nodes globally against all
  lower-numbered levels already seen — a node keeps its first-seen
  (shallowest) level and is not expanded further from a later re-encounter.
  This bounds cost and prevents cycles from inflating counts.
- For the resulting unique node set, runs the two enrichment joins described
  above: AppCI tag-derivation (`fetch dt.entity.service` join, collecting
  *all* `applicationci:*` tags per node) and criticality (global
  explode-join against `/lookups/critical_services`, no AppCI filter, using
  `splitString(entity_ids, " ") | expand` first).
- Returns `{ levels: Map<levelNumber, Node[]>, totalLevels: number | "8+",
  perLevelCounts, uniqueAppCIsAllLevels, isLoading }`. `totalLevels` is the
  first level number that returned zero new (not-yet-seen) nodes, or `"8+"`
  if level 8 was still producing new nodes (capped, not necessarily complete).
- This eager stats computation (up to the cap) runs regardless of the
  slider's current position, so "total levels" and per-level counts are
  always available immediately — the slider only controls which levels are
  rendered in the graph.

### 5. Components

- `UpstreamDownstreamPage.tsx` — owns `selectedServiceId`, `upstreamLevels`,
  `downstreamLevels`; renders the guard, `AppIdentityBar`,
  `ServiceGoldenSignalsTable`, and the two `DependencyGraphPanel` +
  `DependencySummaryPanel` pairs.
- `DependencyGraphPanel.tsx` — React Flow canvas + dagre layout for
  `direction: "upstream" | "downstream"`; renders nodes 1..`levels` from the
  shared hook's data; custom node component shows service name, AppCI
  badge(s), and a criticality dot (color from severity rank); each node has
  an "Open in Smartscape" link reusing the `SmartscapeViewMenu` URL pattern
  with the matching `upstream-call-chain`/`downstream-call-chain` view.
- `DependencyLevelSlider.tsx` — native `<input type="range" min={1} max={8}>`
  styled to match, plus "Viewing N of up to 8 levels" (or "up to 8+ levels"
  if capped) readout.
- `DependencySummaryPanel.tsx` — two sub-sections per direction: **(1)**
  direct (level-1) dependencies table (service, AppCI(s)) + unique-AppCIs
  chip list for level 1 only; **(2)** full-chain stats — total levels,
  per-level count breakdown, all unique AppCIs across every level up to the
  cap.

### 6. Error handling & edge cases

- No service selected yet → empty-state placeholder in both panels.
- AppCI not In Production → guard notice, no table/traversal queries fired.
- Root/leaf service with zero deps in a direction → "No upstream/downstream
  dependencies" state, not an empty canvas.
- Node with no `applicationci` tag at all → "Unresolved AppCI" badge, node
  still rendered.
- Node with no critical-service match → renders without a criticality dot
  (absence of data, not an error).
- Level 8 still producing new nodes → stats report `"8+ (capped)"` rather
  than implying that is the true full depth.

### 7. Testing

No automated test infra exists in this repo. Verification is manual, in the
dev server, against the live tenant: confirm a known AppCI's direct
dependency set matches what was seen during this spike's live queries,
confirm the slider 1→8 updates the rendered graph without re-firing the
already-computed stats query, confirm a service known to carry multiple
`applicationci` tags renders all of its AppCI badges, confirm the
production-status guard fires for an "Implementing" AppCI.

## Known limitations carried into implementation

- AppCI tag-join right-hand side (`fetch dt.entity.service`) is an unfiltered
  full-entity-set scan per hook invocation — acceptable now, a candidate for
  tightening if real-world fan-out proves larger than tested.
- `totalLevels` beyond the cap is reported as `"8+"`, not exact — a
  deliberate cost/completeness tradeoff, not a bug.
- Services with zero `applicationci` tags anywhere (neither classic entity
  tag nor critical-services match) will show as "Unresolved AppCI" — this is
  a data-hygiene ceiling in the tenant, not something this feature can fix.
