# Scorecards page redesign — design spec

Date: 2026-08-29
Status: approved by user in chat, pending spec review

## Goal

Replace the visual design of the `/scorecards` route with the design produced
in Claude Design (handoff bundle: `Dynatrace SRE Scorecards Redesign-handoff.zip`,
project file `SRE Scorecards - Redesign.dc.html`). Same items, same checks,
same underlying DQL/scoring logic — new look, new information density, a
couple of new interaction patterns, and one new (bounded) piece of logic: a
"next best moves" recommendation band.

Also: remove the "Golden Signals" tab from top nav (route/page stay in place).

## Non-goals (explicitly out of scope, per user decisions)

- No ⌘K command palette / starred-apps / prev-next app cycling. Keep today's
  AppCI `Select` dropdown (in `App.tsx`'s `Page.Header`), just fit it visually
  into the new chrome.
- No deletion of `GoldenSignalsPage.tsx` or its route — nav link only.
- No historical trend storage. The mockup's "90-day trend" sparkline in the
  modal renders as an honest empty state ("history not stored yet"), matching
  the pattern already used in this codebase for known gaps — e.g. the
  `"4. Runbooks Linked"` entry in `checkExplanations.ts` explicitly documents
  a verified empty result ("this tenant has zero runbook notebooks") rather
  than fabricating data.
- No persistence of the Engineer/Executive toggle across sessions. Local
  component state, defaults to Engineer. (Straightforward to add later via
  `useUserAppState` from `@dynatrace-sdk/react-hooks` if wanted — not built now.)
- Do not import the Claude Design handoff's exported `_ds_bundle.css/js`
  static assets into the app. Those are the Claude Design prototyping tool's
  own copy of Strato, meant for the design canvas — the handoff's own
  `README.md` says to recreate the design "in whatever technology makes sense
  for the target codebase... don't copy the prototype's internal structure."
  This app already depends on the real `@dynatrace/strato-components` /
  `-preview` packages; keep using those, plus inline style objects matching
  the codebase's existing convention (see `OverallScore.tsx`, `ScorecardCard.tsx`).

## Current state (for reference)

- `ui/app/pages/ScorecardsPage.tsx` — owns the 5 DQL query strings (L1-L5) and
  renders `AppContextBanner`, `OverallScore`, and a 5-column grid of
  `ScorecardCard`.
- `ui/app/components/AppContextBanner.tsx` — app identity + tier/status/MD/
  owner/support, stacked 2-row layout.
- `ui/app/components/OverallScore.tsx` — dark hero card: score ring + grade +
  5 per-level progress bars.
- `ui/app/components/ScorecardCard.tsx` — one card per level: ring + list of
  clickable check rows (`CheckItem`), opens `CheckDetailModal` on click.
- `ui/app/components/CheckDetailModal.tsx` — per-check modal: status header,
  chart/table (from `checkDetailConfigs.ts`'s `detailQuery`), guidance text.
- `ui/app/components/checkDetailConfigs.ts` — one entry per check (30 total):
  `level`, `levelColor`, `description`, `passLogic`, `guidance`, `chartType`,
  `detailQuery`.
- `ui/app/components/checkExplanations.ts` — one short explanation string per
  check, shown in a hover tooltip today.
- `ui/app/components/Header.tsx` — top nav, `navItems` array drives both link
  and route-highlighting.
- `ui/app/App.tsx` — routes, including `/golden-signals` → `GoldenSignalsPage`.
- `ui/app/theme.css` — `--sre-*` CSS custom properties for light/dark, used by
  `Home.tsx`, `MaturityLeaderboard.tsx`, `PortfolioPage.tsx`, etc. **These stay
  untouched** — this redesign only touches the Scorecards page tree, and other
  pages still depend on `--sre-*`.

Exactly 4 of the 30 checks are structurally "always fail for every app" (their
DQL literally assigns a hardcoded fail string, not a computed one):
`L4 "3. Predictive Forecasting"`, `L4 "5. Error Budget Gating"`,
`L5 "3. E2E Remediation Automated"`, `L5 "5. AI Postmortem / PTASK in ARD"`.
This is the basis for the "platform gap" classification below.

## Target architecture

No new routes. All changes are within the `/scorecards` page's component tree,
plus a one-line nav change in `Header.tsx`.

### 1. `Header.tsx`
Remove the `{ to: "/golden-signals", label: "Golden Signals" }` entry from
`navItems`. Nothing else changes.

### 2. App identity bar — new `AppIdentityBar.tsx` (not a restyle of `AppContextBanner.tsx`)
**Self-review correction**: `AppContextBanner.tsx` is also used by `Home.tsx`
(confirmed via grep) — restyling it in place would change the Home page's
look too, which is out of scope (this redesign only touches the Scorecards
page tree, per the Current State section above). Instead, add a new
`AppIdentityBar.tsx` component, used only by `ScorecardsPage.tsx`; leave
`AppContextBanner.tsx` completely untouched so `Home.tsx` is unaffected.
`AppIdentityBar` duplicates `AppContextBanner`'s `PROFILE_LOOKUP`/
`PROFILE_FALLBACK` queries (same data, deliberately not shared — the two
components' layouts are different enough that parametrizing one component
for both would be more convoluted than the small duplication). Single-row
layout matching the mockup: app name + AppCI badge on the left, Tier/Status/
Managing Director/Owner/Support Group as inline chips filling the rest of the
row. No command palette — the app name is static text, not a click target.

### 3. Hero banner — replace `OverallScore.tsx` with a new component
(e.g. `MaturitySpine.tsx`) with two render modes toggled by local state
(`mode: "engineer" | "executive"`, default `"engineer"`):
- **Engineer mode**: current-level badge (e.g. "L4 · Proactive"), "checks
  passing X/Y" count, and a horizontal per-level strip of small colored cells
  (one per check, colored by pass/fail/warn/n/a) that are hoverable/clickable
  — same interaction target as the card grid below (see §5).
- **Executive mode**: score ring (like today's `ScoreRing`, reused) plus the
  same per-level cell strips, condensed, with less text.
A toggle control (small segmented button, top-right of the banner) switches
`mode`. Same underlying data as today (`levels: LevelResult[]` computed from
the 5 DQL queries) — no new queries.

### 4. Card grid — replace `ScorecardCard.tsx` with a new per-level card
Rendered in the same 5-column grid `ScorecardsPage.tsx` already lays out.
Two render paths driven by the same `mode` state as the hero banner (lifted to
`ScorecardsPage` and passed down, so banner and grid switch together):
- **Engineer mode**: header (level id/name, "def ↗" link to `/definitions`,
  thin progress bar + score), then one row per check (name, 2-line detail
  clamp, live metric value) — hover-highlighted, click opens the modal. This
  replaces `ScorecardCard`'s current ring+list layout with the mockup's
  denser row-list.
- **Executive mode**: small donut (reuse `ScoreRing`), level name/outcome text
  (new short static string per level, listed below), a row of small heatmap
  cells (same 6-7 cells as Engineer mode, just bigger/simpler), and a short
  "top open items" list split into **Quick wins** (owner = "App team") vs
  **Platform gaps** (owner = "Platform team") — see §6 for the owner field.

**New per-level `outcome` string** (static, level-level not per-app metadata).
`checkDetailConfigs.ts` already exports a `LEVEL_META` map (`title`, `color`,
`summary` per level, used today by `CheckDetailModal.tsx` and
`DefinitionsPage.tsx`) — add `outcome` as a new field there rather than a
separate map; `summary` is the longer Definitions-page copy, `outcome` is the
short card-friendly line below, taken directly from the mockup:
- L1: "Everything this application does is visible — hosts, traces, logs, cloud, users."
- L2: "Reliability is formally defined and measured: SLIs, SLOs, guardians, dashboards."
- L3: "Davis correlates problems; deploys, alert routing and DORA are integrated."
- L4: "Outages are predicted and prevented before customers notice."
- L5: "Reliability is maintained without human intervention."

### 5. Hover preview + modal
Hovering a check cell/row shows a small floating popover (metric value, "how
it's calculated" one-liner, "passes when" line) positioned near the cursor —
new, lightweight, no data fetch (uses data already in hand from the parent
query). Clicking opens the existing `CheckDetailModal` data-fetching path
unchanged, but with new chrome:
- A left sidebar listing sibling checks in the same level (click to jump
  between them without closing the modal).
- `←`/`→` keyboard nav between checks in the same level, `Esc` to close.
- An "OPEN IN" footer row linking out to the relevant Dynatrace app(s) for
  that check.

  **Self-review correction**: `checkDetailConfigs.ts` has no `links` field
  today — the existing per-row deep-links in `CheckDetailModal.tsx` (e.g.
  `serviceRowClick`, around line 791+) only build a URL for a *specific
  clicked row* (a host, a problem, an SLO), not a static per-check "open the
  app" link. The mockup's footer is check-level, not row-level, so this is
  new content, not reuse. Scoping it down for v1: add a new
  `openIn?: { label: string; path: string }[]` field to `CheckDetailConfig`
  (one-time editorial addition, same spirit as `owner`/`effort`), where
  `path` is the target app's landing route (e.g. `/ui/apps/dynatrace.classic.hosts`)
  opened via `getEnvironmentUrl()` — **not** pre-filtered to the AppCI in v1
  (filtered deep-links, like the row-click ones already do, are a reasonable
  fast-follow but add real per-app scope to author now). Only add this field
  for checks where an obvious 1:1 app mapping exists; omit the footer entirely
  for checks without one rather than guessing.

### 6. Recommendation band — new component (e.g. `NextMovesBand.tsx`)
Rendered below the card grid, only when at least one check is failing/warning
for the selected app.

**New static fields on `checkDetailConfigs.ts`'s `CheckDetailConfig`:**
`owner: "App team" | "Platform team"` and `effort: "Low" | "Medium" | "High"`.
One-time editorial content, added once per check (not per app), same spirit as
the existing `guidance` field. Full table (all 30 checks):

| Level | Check | Owner | Effort |
|---|---|---|---|
| L1 | 1. OneAgent Deployed | App team | Medium |
| L1 | 2. Tracing Validated | App team | Low |
| L1 | 3. Logs Correlated | App team | Low |
| L1 | 4. Smartscape Discovery | App team | Low |
| L1 | 5. Kubernetes | App team | Low |
| L1 | 6. Cloud | App team | Low |
| L1 | 7. RUM / Synthetics | App team | Medium |
| L2 | 1. Golden Signal SLIs | App team | Low |
| L2 | 2. SLOs Created | App team | Medium |
| L2 | 3. Site Reliability Guardians Created | App team | Medium |
| L2 | 4. SLO Dashboards Published | App team | Low |
| L2 | 5. SRE Assessment in ARD | App team | Low |
| L2 | 6. Critical Services Tagged | App team | Medium |
| L3 | 1. Causal AI Detection + Event Correlation | App team | Low |
| L3 | 2. CI/CD Integration | App team | Medium |
| L3 | 3. ITSM Integration | App team | Medium |
| L3 | 4. Runbooks Linked | App team | Low |
| L3 | 5. Alert Noise Review | App team | Medium |
| L3 | 6. Problems with Root Cause | App team | Medium |
| L3 | 7. DORA Metrics | App team | Low |
| L4 | 1. SLO Burn Rate Alerting | App team | Medium |
| L4 | 2. Dynamic Scaling / K8s Autoscaling | App team | High |
| L4 | 3. Predictive Forecasting | Platform team | High |
| L4 | 4. Release Impact Tracking | App team | Medium |
| L4 | 5. Error Budget Gating | Platform team | High |
| L5 | 1. Repetitive Tasks Identified | App team | Low |
| L5 | 2. Workflow Automation | App team | Low |
| L5 | 3. E2E Remediation Automated | Platform team | High |
| L5 | 4. Incident Auto-Enrichment | App team | Medium |
| L5 | 5. AI Postmortem / PTASK in ARD | Platform team | High |

**Correction from the first draft of this spec**: `Critical Services Tagged`
was listed as owner=Platform, following `checkExplanations.ts`'s prose, which
still describes it as an unwired stub. That text is stale — the live L2 query
in `ScorecardsPage.tsx` already computes this check for real from
`/lookups/critical_services` (`resolved`/`criticalCount`, contributing to a
`/6` denominator, not the `/5` the comment claims). It's owner=App team like
any other live check; `checkExplanations.ts` should get a follow-up fix
outside this redesign's scope, but the table above already reflects the
correct (live) classification.

### 6a. Labeling hardcoded/not-yet-live checks (user requirement)

Per user instruction: every check is expected to eventually be a real,
per-app measurement — nothing in this tenant is permanently unmeasurable.
Until a check is wired to live data, the UI must say so plainly rather than
presenting a hardcoded placeholder as if it were a real result for this app.

Cross-checked directly against the live DQL in `ScorecardsPage.tsx` (not
against `checkExplanations.ts`'s prose, which is what produced the error
above) — exactly 4 of the 30 checks are unconditional hardcoded strings today,
identical for every AppCI in the tenant:
- `L4 "3. Predictive Forecasting"` — literally `"fail Davis forecasting not adopted"`
- `L4 "5. Error Budget Gating"` — literally `"fail Error budget not sent to change management"`
- `L5 "3. E2E Remediation Automated"` — literally `"fail Not detected"`
- `L5 "5. AI Postmortem / PTASK in ARD"` — literally `"fail Not detected"`

All other 26 checks (including `Critical Services Tagged` and
`Runbooks Linked`, which route through a live-override function) are
genuinely computed per-app today.

**New field**: `hardcoded?: boolean` on `CheckDetailConfig`, `true` only for
the 4 checks above.

**UI treatment, everywhere a check's status renders** (hero banner heatmap
cell, Engineer-mode card row, Executive-mode donut/heatmap/open-items list,
hover popover, modal header): when `hardcoded` is true, keep the normal
fail-red coloring (it is a real gap) but overlay a visible marker — a small
"NOT YET LIVE" chip plus a diagonal-hatch pattern on the cell/row background
— and add one explanatory line wherever there's room for it ("Same result for
every application in this tenant until this capability is built — not a
per-app measurement yet"). The hover popover and modal must always show this
line for these 4 checks; the compact heatmap cell/row treatments just need the
visual marker (hatch + chip), not the full sentence.

This also applies inside the recommendation band (§6): a "next move" card for
one of these 4 checks gets the same "NOT YET LIVE" chip next to its title, so
it reads as a platform-capability call-out rather than a per-app action item.

**Ranking algorithm** (pure function of the 5 levels' current check results —
no new queries):

```
candidates = []
for level in [L1, L2, L3, L4, L5]:        // fixed order, foundational first
  failing = level.checks.filter(status in {fail, warn})   // in check-index order
  candidates.push(...failing)

topMoves = candidates.slice(0, 4)

for move in topMoves:
  title   = move.checkName
  levelTag = `L{level}·{checkIndex}`
  body    = checkExplanations[move.checkKey]  // existing guidance text, reused as-is
  owner   = checkDetailConfigs[move.checkKey].owner
  effort  = checkDetailConfigs[move.checkKey].effort
  impact  = (failing.length == 1 for this level) ? `Completes L{level}` : "+1 check"
```

If `candidates` is empty (nothing failing), the band doesn't render — an
all-green app has no "next moves" to show, which is itself a fine outcome
banner (can reuse the existing empty/success pattern elsewhere in the app if
one exists, otherwise a simple "All checks passing" strip).

`ownedOpen` / `platformOpen` counts (shown in the Executive hero banner and
Executive card view's "Quick wins"/"Platform gaps" split) are simply
`candidates.filter(owner === "App team").length` and the Platform-team
equivalent — computed over the *full* candidate list, not just the top 4.

### 7. Styling / theming
Introduce the mockup's CSS custom properties (`--page`, `--card`, `--line`,
`--line-soft`, `--ink`, `--ink-2`, `--panel`, `--panel-2`, `--chip`,
`--chip-hover`, `--pass-ink`/`--fail-ink`/`--warn-ink`/`--na-ink`,
`--nav-active`/`--nav-active-bg`, `--lv1`..`--lv5`, `--shadow`) into
`theme.css`, scoped under both `:root/[data-theme="light"]` and
`[data-theme="dark"]` blocks (values taken directly from the mockup's
`<style>` block, lines 19-38 of the `.dc.html`). **Additive only** — the
existing `--sre-*` variables stay, since `Home.tsx`, `MaturityLeaderboard.tsx`,
and `PortfolioPage.tsx` still read them and are out of scope for this redesign.

Level accent colors stay as the hex literals already used throughout
`ScorecardsPage.tsx` (`#3BACF0`, `#1966FF`, `#5E28E5`, `#8D1CDC`, `#49C2B3`) —
the mockup's `--lv1..5` vars use slightly different hexes for its own dark-mode
palette; reconcile by using the existing app hexes for light mode and the
mockup's dark-mode-tuned hexes for `[data-theme="dark"]`, matching how
`theme.css` already varies other colors per theme.

### 8. Files touched (implementation-time list, not exhaustive)
- `ui/app/components/Header.tsx` — remove nav item
- new `ui/app/components/AppIdentityBar.tsx` (`AppContextBanner.tsx` untouched — still used by `Home.tsx`)
- `ui/app/components/OverallScore.tsx` → new `MaturitySpine.tsx` (or restyle in place)
- `ui/app/components/ScorecardCard.tsx` — restyle, add Engineer/Executive branches
- `ui/app/components/CheckDetailModal.tsx` — add sidebar/keyboard nav chrome
- `ui/app/components/checkDetailConfigs.ts` — add `owner`/`effort`/`hardcoded`/
  optional `openIn` to `CheckDetailConfig`, add `outcome` to `LEVEL_META`
- new `ui/app/components/NextMovesBand.tsx`
- new small hover-popover component (e.g. `ui/app/components/CheckHoverPreview.tsx`)
- `ui/app/pages/ScorecardsPage.tsx` — wire `mode` state, render new tree
- `ui/app/theme.css` — additive new CSS vars

## Verification plan

No test framework in this repo (per `AGENTS.md` — verification is
`npm run build` / `dt-app dev` + manual check, matching existing project
practice). Plan:
1. `npm run build` clean.
2. `dt-app dev` (or deploy to `ual` per existing practice) and manually walk
   both Engineer and Executive modes, hover + click-through on at least one
   check per level, modal sidebar nav, recommendation band on an app with
   known gaps, and an all-green-ish app if one exists (to confirm the "no
   moves" empty state).
3. Confirm Golden Signals nav item is gone but `/golden-signals` still loads
   directly.
4. Confirm `Home.tsx` / `MaturityLeaderboard.tsx` / `PortfolioPage.tsx` are
   visually unaffected (additive CSS vars only).
5. Confirm all 4 `hardcoded: true` checks (L4 #3, L4 #5, L5 #3, L5 #5) show
   the "NOT YET LIVE" marker everywhere they render (heatmap cell, card row,
   hover popover, modal, recommendation band), and that no other check shows
   it.
