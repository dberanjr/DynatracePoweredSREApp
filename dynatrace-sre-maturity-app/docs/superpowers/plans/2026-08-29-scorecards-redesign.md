# Scorecards Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the `/scorecards` page to match the Claude Design mockup ("SRE Scorecards - Redesign") — same checks, same DQL, same scores — while adding Engineer/Executive view modes, richer check hover/modal navigation, and a new "next best moves" recommendation band.

**Architecture:** No new routes. All work is in `ui/app/pages/ScorecardsPage.tsx` and its component tree. New static per-check metadata (`owner`/`effort`/`hardcoded`/`openIn`) is added to the existing `checkDetailConfigs.ts`; a new pure-function module centralizes "which checks are failing" logic so three different new UI pieces (hero banner, card grid, recommendation band) don't each reimplement it. `OverallScore.tsx` and `ScorecardCard.tsx` are replaced; `CheckDetailModal.tsx` gets additive chrome; `Header.tsx` loses one nav item; `AppContextBanner.tsx` is left untouched (shared with `Home.tsx`) in favor of a new dedicated component.

**Tech Stack:** React 18 + TypeScript, `@dynatrace/strato-components`/`-preview`, `@dynatrace-sdk/react-hooks` (`useDql`), inline style objects (existing codebase convention — no CSS-in-JS library, no Tailwind).

**Spec:** `docs/superpowers/specs/2026-08-29-scorecards-redesign-design.md`

**No test framework in this repo** (confirmed: no test script in `package.json`, `AGENTS.md` documents `npm run build`/`dt-app dev` as the verification loop). Every task below substitutes for the usual "write failing test → pass" cycle with: (1) `npm run build` as the closest automated check (TypeScript will fail the build on a type error or missing field), (2) where a task's output can be checked without running the whole app, a precise `grep`/count command, and (3) a precise manual dev-server check once a task's output is actually visible in the running page (some early tasks are pure data/logic and only become visually verifiable once a later task wires them in — this is called out per task).

## Global Constraints

- Same checks, same DQL queries, same scores — this is a reskin, not a logic change (spec Goal).
- No ⌘K command palette, no starred apps, no prev/next app cycling — keep today's AppCI `Select` dropdown in `App.tsx` (spec Non-goals).
- Do not delete `GoldenSignalsPage.tsx` or its route — nav link removal only (spec Non-goals).
- No historical trend storage — any "trend" UI element must render an honest empty state, never fabricated data (spec Non-goals).
- No persistence of the Engineer/Executive toggle — local component state only (spec Non-goals).
- Do not import the Claude Design handoff's `_ds_bundle.css/js` — use the app's real `@dynatrace/strato-components`/`-preview` packages plus inline styles matching existing convention (spec Non-goals).
- `theme.css`'s existing `--sre-*` variables must not be removed or changed — `Home.tsx`, `MaturityLeaderboard.tsx`, `PortfolioPage.tsx` depend on them and are out of scope (spec §7).
- `AppContextBanner.tsx` must not be modified — it's shared with `Home.tsx` (spec §2 self-review correction).
- Every check is expected to eventually be a real per-app measurement; the 4 checks that are currently hardcoded (same result for every AppCI) must be visibly labeled as not-yet-live everywhere they render, never presented as if they were a real per-app result (spec §6a, user requirement).
- `owner`/`effort` values in `checkDetailConfigs.ts` reflect the **live-vs-hardcoded** reality of each check's current DQL — verified directly against the query text in `ScorecardsPage.tsx`, not against `checkExplanations.ts`'s prose, which is known to be stale in at least one place (spec §6, self-review correction re: Critical Services Tagged).

---

## Task 1: Remove "Golden Signals" from top nav

**Files:**
- Modify: `ui/app/components/Header.tsx:4-10`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new (no other task depends on this one).

- [ ] **Step 1: Remove the nav item**

In `ui/app/components/Header.tsx`, the `navItems` array currently reads:

```ts
const navItems = [
  { to: "/", label: "Home" },
  { to: "/golden-signals", label: "Golden Signals" },
  { to: "/scorecards", label: "Scorecards" },
  { to: "/definitions", label: "Definitions" },
  { to: "/about", label: "About" },
];
```

Change it to:

```ts
const navItems = [
  { to: "/", label: "Home" },
  { to: "/scorecards", label: "Scorecards" },
  { to: "/definitions", label: "Definitions" },
  { to: "/about", label: "About" },
];
```

Do not touch `ui/app/App.tsx` — the `/golden-signals` route and `GoldenSignalsPage` import stay exactly as they are (per Global Constraints).

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 3: Manual check**

Run: `npm run start` (opens the dev server). Confirm the top nav shows Home, Scorecards, Definitions, About (no Golden Signals), and that navigating directly to `/golden-signals` in the URL bar still loads the page.

- [ ] **Step 4: Commit**

```bash
git add ui/app/components/Header.tsx
git commit -m "Remove Golden Signals from top nav (route stays live)"
```

---

## Task 2: Add redesign CSS variables to `theme.css`

**Files:**
- Modify: `ui/app/theme.css:1-36`

**Interfaces:**
- Consumes: nothing.
- Produces: CSS custom properties `--page`, `--card`, `--line`, `--line-soft`, `--ink`, `--ink-2`, `--panel`, `--panel-2`, `--chip`, `--chip-hover`, `--row-end`, `--band`, `--spine`, `--pass-ink`, `--fail-ink`, `--warn-ink`, `--na-ink`, `--nav-active`, `--nav-active-bg`, `--lv1`..`--lv5`, `--rail-icon`, `--shadow` — consumed by every task from Task 7 onward.

- [ ] **Step 1: Add the light-mode variables**

In `ui/app/theme.css`, the light block currently ends at line 18-19:

```css
  --sre-table-header-bg: #ffffff;
  --sre-table-border: #f0f0f0;
  --sre-surface: #ffffff;
}
```

Change it to (new lines added before the closing brace; level colors `--lv1..5` deliberately use the same hexes as the existing L1-L5 accent colors used throughout `ScorecardsPage.tsx`/`OverallScore.tsx`/`ScorecardCard.tsx` today, `#3BACF0`/`#1966FF`/`#5E28E5`/`#8D1CDC`/`#49C2B3`, so the level identity color doesn't diverge between the old and new design):

```css
  --sre-table-header-bg: #ffffff;
  --sre-table-border: #f0f0f0;
  --sre-surface: #ffffff;

  /* Scorecards redesign (2026-08-29) — additive, do not remove --sre-* above */
  --page: #EDEFF3;
  --card: #ffffff;
  --line: #E3E6EB;
  --line-soft: #F2F4F7;
  --ink: #1A2440;
  --ink-2: #6F747F;
  --panel: #F7F8FA;
  --panel-2: #FBFCFD;
  --chip: #F4F6F9;
  --chip-hover: #EEF1F5;
  --row-end: #ffffff;
  --band: #141C31;
  --spine: #1A2440;
  --pass-ink: #17663C;
  --fail-ink: #B3261E;
  --warn-ink: #8A6100;
  --na-ink: #4C5B73;
  --nav-active: #1414D3;
  --nav-active-bg: rgba(20, 20, 211, .04);
  --lv1: #3BACF0;
  --lv2: #1966FF;
  --lv3: #5E28E5;
  --lv4: #8D1CDC;
  --lv5: #49C2B3;
  --rail-icon: rgba(0, 0, 0, .09);
  --shadow: 0 1px 2px rgba(26, 36, 64, .05);
}
```

- [ ] **Step 2: Add the dark-mode variables**

The dark block currently ends at line 34-36:

```css
  --sre-table-header-bg: #1A2440;
  --sre-table-border: rgba(255, 255, 255, 0.06);
  --sre-surface: #141d2e;
}
```

Change it to (dark-mode `--lv1..5` use the mockup's own dark-tuned hexes — there's no pre-existing dark-mode variant of the level colors to stay consistent with, unlike light mode):

```css
  --sre-table-header-bg: #1A2440;
  --sre-table-border: rgba(255, 255, 255, 0.06);
  --sre-surface: #141d2e;

  /* Scorecards redesign (2026-08-29) — additive, do not remove --sre-* above */
  --page: #0F1520;
  --card: #141D2E;
  --line: rgba(255, 255, 255, .10);
  --line-soft: rgba(255, 255, 255, .055);
  --ink: #E6EBF3;
  --ink-2: #96A1B5;
  --panel: #111927;
  --panel-2: #121B2A;
  --chip: #1B2537;
  --chip-hover: #222E44;
  --row-end: #141D2E;
  --band: #111A2E;
  --spine: #16203A;
  --pass-ink: #6FD59B;
  --fail-ink: #FF8E86;
  --warn-ink: #F0C070;
  --na-ink: #A8B8D0;
  --nav-active: #7FB6FF;
  --nav-active-bg: rgba(127, 182, 255, .10);
  --lv1: #7FCFF7;
  --lv2: #8F9BFF;
  --lv3: #A98CF5;
  --lv4: #D49BF2;
  --lv5: #EF8FFF;
  --rail-icon: rgba(255, 255, 255, .13);
  --shadow: 0 1px 2px rgba(0, 0, 0, .45);
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: succeeds (CSS isn't type-checked, but confirms nothing else broke).

- [ ] **Step 4: Manual check**

Run: `npm run start`. Open the browser devtools on any page, inspect `:root`, confirm `--page`/`--ink`/`--lv1` etc. are present in computed styles for both light and dark (`ThemeToggle.tsx`'s toggle) modes. Confirm `Home.tsx` and `MaturityLeaderboard.tsx` (via Portfolio or wherever it's rendered) look visually unchanged — these additive variables aren't referenced anywhere yet.

- [ ] **Step 5: Commit**

```bash
git add ui/app/theme.css
git commit -m "Add redesign CSS variables to theme.css (additive, light+dark)"
```

---

## Task 3: Add `owner`/`effort`/`hardcoded`/`openIn` metadata to `checkDetailConfigs.ts`

**Files:**
- Modify: `ui/app/components/checkDetailConfigs.ts:7-83` (interface + `LEVEL_META`), append after line 1654 (new `CHECK_REDESIGN_META` + merge)

**Interfaces:**
- Consumes: nothing new.
- Produces: `CheckDetailConfig.owner: "App team" | "Platform team"`, `.effort: "Low" | "Medium" | "High"`, `.hardcoded?: boolean`, `.openIn?: { label: string; path: string }[]` — all optional on the type, but populated for all 30 real check keys at runtime after this task. `LEVEL_META[level].outcome: string`. Consumed by Task 4 (`checkStatus.ts`), Task 8 (`MaturitySpine`), Tasks 9-10 (`ScorecardCard`), Task 11 (`CheckDetailModal`), Task 12 (`NextMovesBand`).

- [ ] **Step 1: Extend the `CheckDetailConfig` interface**

In `ui/app/components/checkDetailConfigs.ts`, the interface currently ends (line 47-50):

```ts
  showTypeWordCloud?: boolean;
  samplingNote?: string;
  scorecardSnippet: string;
}
```

Change it to:

```ts
  showTypeWordCloud?: boolean;
  samplingNote?: string;
  scorecardSnippet: string;

  // ── Redesign metadata (2026-08-29) — one-time editorial content, not
  // per-app data. See docs/superpowers/specs/2026-08-29-scorecards-redesign-design.md §6/§6a.
  /** Who can act on this check if it's failing. */
  owner?: "App team" | "Platform team";
  /** Rough one-time estimate of how much work fixing this check is. */
  effort?: "Low" | "Medium" | "High";
  /**
   * True only when this check's DQL assigns an unconditional literal string —
   * the same result for every AppCI in the tenant — rather than computing a
   * real per-app result. The UI must visibly label these as not-yet-live.
   */
  hardcoded?: boolean;
  /** Static "open in" footer links — app landing pages, not filtered to the AppCI. */
  openIn?: { label: string; path: string }[];
}
```

- [ ] **Step 2: Add `outcome` to `LEVEL_META`**

The current `LEVEL_META` type and values (lines 52-83) don't have an `outcome` field. Change the type declaration line:

```ts
export const LEVEL_META: Record<string, { title: string; color: string; summary: string }> = {
```

to:

```ts
export const LEVEL_META: Record<string, { title: string; color: string; summary: string; outcome: string }> = {
```

Then add one `outcome:` line to each of the 5 level entries (values taken verbatim from the Claude Design mockup's own level copy). For example, `L1` currently reads:

```ts
  L1: {
    title: "Full Observability",
    color: "#3BACF0",
    summary:
      "Confirms the application is fully instrumented with OneAgent, distributed traces, logs, and — where applicable — RUM, synthetics, and Kubernetes/cloud workloads. This is the prerequisite for all higher maturity levels.",
  },
```

becomes:

```ts
  L1: {
    title: "Full Observability",
    color: "#3BACF0",
    summary:
      "Confirms the application is fully instrumented with OneAgent, distributed traces, logs, and — where applicable — RUM, synthetics, and Kubernetes/cloud workloads. This is the prerequisite for all higher maturity levels.",
    outcome: "Everything this application does is visible — hosts, traces, logs, cloud, users.",
  },
```

Apply the same pattern (add one `outcome:` line, don't touch `title`/`color`/`summary`) to the other 4 levels:

```ts
  L2: { ..., outcome: "Reliability is formally defined and measured: SLIs, SLOs, guardians, dashboards." },
  L3: { ..., outcome: "Davis correlates problems; deploys, alert routing and DORA are integrated." },
  L4: { ..., outcome: "Outages are predicted and prevented before customers notice." },
  L5: { ..., outcome: "Reliability is maintained without human intervention." },
```

(Write these as full multi-line object literals matching the existing formatting — the `...` above stands for the existing `title`/`color`/`summary` lines already in the file, do not delete them.)

- [ ] **Step 3: Append the `CHECK_REDESIGN_META` table and merge**

At the very end of `ui/app/components/checkDetailConfigs.ts` (after the closing `};` of `CHECK_DETAIL_CONFIGS`, currently the last line), append:

```ts

// ── Redesign metadata (2026-08-29) ──────────────────────────────────────────
// One-time editorial content per check (owner/effort/hardcoded/openIn), kept
// in one table instead of scattered across the 30 verbose entries above.
// Merged onto CHECK_DETAIL_CONFIGS below so callers keep reading
// CHECK_DETAIL_CONFIGS[key].owner etc. as if it were defined inline.
//
// `hardcoded: true` is set ONLY for the 4 checks whose DQL in
// ScorecardsPage.tsx assigns an unconditional literal string today (verified
// directly against that file, 2026-08-29): L4 "3. Predictive Forecasting",
// L4 "5. Error Budget Gating", L5 "3. E2E Remediation Automated", L5
// "5. AI Postmortem / PTASK in ARD". Every other check — including
// "6. Critical Services Tagged", which checkExplanations.ts's prose still
// describes as an unwired stub — is genuinely computed per-app today.
//
// `openIn` is populated only where a real, already-used-elsewhere-in-this-
// codebase Dynatrace app path exists (grepped from CheckDetailModal.tsx's
// existing row-click URLs); checks with no verified 1:1 app mapping are left
// without an `openIn` entry rather than guessing one.
type RedesignMeta = Pick<CheckDetailConfig, "owner" | "effort" | "hardcoded" | "openIn">;

const CHECK_REDESIGN_META: Record<string, RedesignMeta> = {
  // L1 — Full Observability
  "1. OneAgent Deployed": { owner: "App team", effort: "Medium",
    openIn: [{ label: "Infrastructure & Operations", path: "/ui/apps/dynatrace.infraops/smartscape/Compute/Hosts" }] },
  "2. Tracing Validated": { owner: "App team", effort: "Low",
    openIn: [{ label: "Services", path: "/ui/apps/dynatrace.services/explorer-new/services" }] },
  "3. Logs Correlated": { owner: "App team", effort: "Low",
    openIn: [{ label: "Logs", path: "/ui/apps/dynatrace.logs/" }] },
  "4. Smartscape Discovery": { owner: "App team", effort: "Low",
    openIn: [{ label: "Services", path: "/ui/apps/dynatrace.services/explorer-new/services" }] },
  "5. Kubernetes": { owner: "App team", effort: "Low" },
  "6. Cloud": { owner: "App team", effort: "Low",
    openIn: [{ label: "Clouds", path: "/ui/apps/dynatrace.clouds/smartscape/services" }] },
  "7. RUM / Synthetics": { owner: "App team", effort: "Medium" },

  // L2 — Measured Reliability
  "1. Golden Signal SLIs": { owner: "App team", effort: "Low",
    openIn: [{ label: "Services", path: "/ui/apps/dynatrace.services/explorer-new/services" }] },
  "2. SLOs Created": { owner: "App team", effort: "Medium" },
  "3. Site Reliability Guardians Created": { owner: "App team", effort: "Medium" },
  "4. SLO Dashboards Published": { owner: "App team", effort: "Low",
    openIn: [{ label: "Dashboards", path: "/ui/apps/dynatrace.dashboards/" }] },
  "5. SRE Assessment in ARD": { owner: "App team", effort: "Low" },
  "6. Critical Services Tagged": { owner: "App team", effort: "Medium" },

  // L3 — AI-Assisted Operations
  "1. Causal AI Detection + Event Correlation": { owner: "App team", effort: "Low",
    openIn: [{ label: "Problems", path: "/ui/apps/dynatrace.davis.problems/" }] },
  "2. CI/CD Integration": { owner: "App team", effort: "Medium" },
  "3. ITSM Integration": { owner: "App team", effort: "Medium",
    openIn: [{ label: "Workflows", path: "/ui/apps/dynatrace.automations/workflows" }] },
  "4. Runbooks Linked": { owner: "App team", effort: "Low",
    openIn: [{ label: "Notebooks", path: "/ui/apps/dynatrace.notebooks/" }] },
  "5. Alert Noise Review": { owner: "App team", effort: "Medium",
    openIn: [{ label: "Problems", path: "/ui/apps/dynatrace.davis.problems/" }] },
  "6. Problems with Root Cause": { owner: "App team", effort: "Medium",
    openIn: [{ label: "Problems", path: "/ui/apps/dynatrace.davis.problems/" }] },
  "7. DORA Metrics": { owner: "App team", effort: "Low" },

  // L4 — Proactive Reliability
  "1. SLO Burn Rate Alerting": { owner: "App team", effort: "Medium",
    openIn: [{ label: "Problems", path: "/ui/apps/dynatrace.davis.problems/" }] },
  "2. Dynamic Scaling / K8s Autoscaling": { owner: "App team", effort: "High",
    openIn: [{ label: "Clouds", path: "/ui/apps/dynatrace.clouds/smartscape/services" }] },
  "3. Predictive Forecasting": { owner: "Platform team", effort: "High", hardcoded: true },
  "4. Release Impact Tracking": { owner: "App team", effort: "Medium",
    openIn: [{ label: "Workflows", path: "/ui/apps/dynatrace.automations/workflows" }] },
  "5. Error Budget Gating": { owner: "Platform team", effort: "High", hardcoded: true },

  // L5 — Autonomous Reliability
  "1. Repetitive Tasks Identified": { owner: "App team", effort: "Low",
    openIn: [{ label: "Workflows", path: "/ui/apps/dynatrace.automations/workflows" }] },
  "2. Workflow Automation": { owner: "App team", effort: "Low",
    openIn: [{ label: "Workflows", path: "/ui/apps/dynatrace.automations/workflows" }] },
  "3. E2E Remediation Automated": { owner: "Platform team", effort: "High", hardcoded: true },
  "4. Incident Auto-Enrichment": { owner: "App team", effort: "Medium",
    openIn: [{ label: "Problems", path: "/ui/apps/dynatrace.davis.problems/" }] },
  "5. AI Postmortem / PTASK in ARD": { owner: "Platform team", effort: "High", hardcoded: true },
};

for (const [key, meta] of Object.entries(CHECK_REDESIGN_META)) {
  if (CHECK_DETAIL_CONFIGS[key]) {
    Object.assign(CHECK_DETAIL_CONFIGS[key], meta);
  }
}
```

- [ ] **Step 4: Verify every check got metadata**

Run: `node -e "
const keys = require('fs').readFileSync('ui/app/components/checkDetailConfigs.ts', 'utf8').match(/^  \"\d+\..+?\": \{/gm) || [];
console.log('CHECK_DETAIL_CONFIGS entries:', keys.length);
const metaKeys = require('fs').readFileSync('ui/app/components/checkDetailConfigs.ts', 'utf8').match(/^  \"\d+\..+?\": \{ owner:/gm) || [];
console.log('CHECK_REDESIGN_META entries:', metaKeys.length);
"`
Expected: both print `30`. If they don't match, a key was typo'd (the merge loop silently no-ops on a key that doesn't match — `if (CHECK_DETAIL_CONFIGS[key])` — so a typo'd key in `CHECK_REDESIGN_META` fails silently rather than erroring; this count check is the only thing that catches it).

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: succeeds. (This confirms the interface change and the object literal are syntactically/type valid; it does NOT confirm the 30-key match from Step 4 — both checks are needed.)

- [ ] **Step 6: Commit**

```bash
git add ui/app/components/checkDetailConfigs.ts
git commit -m "Add owner/effort/hardcoded/openIn check metadata and level outcome text"
```

---

## Task 4: Shared check-ranking utility (`checkStatus.ts`)

Centralizes "which checks are failing, in what order, with what metadata" so the hero banner (Task 8), the card grid's Executive mode (Task 10), and the recommendation band (Task 12) don't each reimplement this logic differently. Pure functions, no React, no DQL — it operates on already-fetched records.

**Files:**
- Create: `ui/app/components/checkStatus.ts`

**Interfaces:**
- Consumes: `CHECK_DETAIL_CONFIGS` from `./checkDetailConfigs` (Task 3's `owner`/`effort`/`hardcoded` fields).
- Produces: `Status`, `LevelRecord`, `CheckResult`, `MoveCard`, `OwnershipSplit` types; `getStatus()`, `flattenChecks()`, `getFailingChecks()`, `getTopMoves()`, `splitByOwnership()` functions — consumed by Task 8 (`MaturitySpine`), Task 10 (`ScorecardCard` Executive mode), Task 12 (`NextMovesBand`).

- [ ] **Step 1: Write the file**

```ts
// ui/app/components/checkStatus.ts
//
// Pure helpers for turning a level's raw DQL record (score key + N check
// keys, each a "pass ..." / "fail ..." / "warn ..." / "n/a ..." string) into
// structured, rankable check results. No data fetching here — callers pass
// in records they've already resolved via useDqlWithCache/useLiveCheckOverride.

import { CHECK_DETAIL_CONFIGS } from "./checkDetailConfigs";

export type Status = "pass" | "fail" | "warn" | "na";
export type LevelId = "L1" | "L2" | "L3" | "L4" | "L5";

export function getStatus(value: string): Status {
  const v = value.toLowerCase();
  if (v.startsWith("pass")) return "pass";
  if (v.startsWith("fail")) return "fail";
  if (v.startsWith("warn")) return "warn";
  return "na";
}

function checkIndexOf(key: string): number {
  const m = key.match(/^(\d+)\./);
  return m ? parseInt(m[1], 10) : 0;
}

const LEVEL_NUMBER: Record<LevelId, number> = { L1: 1, L2: 2, L3: 3, L4: 4, L5: 5 };

/** One level's resolved DQL record, ready to rank. */
export interface LevelRecord {
  level: LevelId;
  /** The resolved record — score key + N check keys — after any liveOverride has been applied. */
  record: Record<string, unknown>;
}

export interface CheckResult {
  key: string; // e.g. "3. ITSM Integration" — exact CHECK_DETAIL_CONFIGS key
  value: string; // e.g. "pass 1 alert workflow"
  status: Status;
  level: LevelId;
  checkIndex: number; // 1-based, parsed from the leading "N." in `key`
}

/** Every check across the given levels, sorted by level then check index. */
export function flattenChecks(levelRecords: LevelRecord[]): CheckResult[] {
  const out: CheckResult[] = [];
  const sorted = [...levelRecords].sort((a, b) => LEVEL_NUMBER[a.level] - LEVEL_NUMBER[b.level]);
  for (const lr of sorted) {
    const keys = Object.keys(lr.record)
      .filter((k) => !k.toLowerCase().includes("score"))
      .sort((a, b) => checkIndexOf(a) - checkIndexOf(b));
    for (const key of keys) {
      const value = String(lr.record[key]);
      out.push({ key, value, status: getStatus(value), level: lr.level, checkIndex: checkIndexOf(key) });
    }
  }
  return out;
}

/** Failing (fail/warn) checks only, same level-then-index order as flattenChecks. */
export function getFailingChecks(levelRecords: LevelRecord[]): CheckResult[] {
  return flattenChecks(levelRecords).filter((c) => c.status === "fail" || c.status === "warn");
}

export interface MoveCard {
  check: CheckResult;
  title: string; // check name with the leading "N. " stripped
  levelTag: string; // "L3·4"
  body: string; // existing guidance text, reused as-is
  owner: "App team" | "Platform team";
  effort: "Low" | "Medium" | "High";
  hardcoded: boolean;
  impact: string; // "Completes L3" | "+1 check"
}

/**
 * Top `limit` failing checks, ranked by level (foundational first) then
 * check index, enriched with the Task 3 metadata for the recommendation band.
 */
export function getTopMoves(levelRecords: LevelRecord[], limit = 4): MoveCard[] {
  const failing = getFailingChecks(levelRecords);
  const failingCountByLevel = new Map<LevelId, number>();
  for (const c of failing) failingCountByLevel.set(c.level, (failingCountByLevel.get(c.level) ?? 0) + 1);

  return failing.slice(0, limit).map((check) => {
    const config = CHECK_DETAIL_CONFIGS[check.key];
    const impact = (failingCountByLevel.get(check.level) ?? 0) === 1 ? `Completes ${check.level}` : "+1 check";
    return {
      check,
      title: check.key.replace(/^\d+\.\s*/, ""),
      levelTag: `${check.level}·${check.checkIndex}`,
      body: config?.guidance ?? "",
      owner: config?.owner ?? "App team",
      effort: config?.effort ?? "Medium",
      hardcoded: config?.hardcoded ?? false,
      impact,
    };
  });
}

export interface OwnershipSplit {
  quickWins: CheckResult[]; // failing, owner = App team
  platformGaps: CheckResult[]; // failing, owner = Platform team
}

/** Split a set of failing checks by who can act on them (Task 3's `owner` field). */
export function splitByOwnership(failing: CheckResult[]): OwnershipSplit {
  const quickWins: CheckResult[] = [];
  const platformGaps: CheckResult[] = [];
  for (const c of failing) {
    const owner = CHECK_DETAIL_CONFIGS[c.key]?.owner ?? "App team";
    (owner === "Platform team" ? platformGaps : quickWins).push(c);
  }
  return { quickWins, platformGaps };
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual sanity check (no test framework — trace by hand)**

This module has no visible output until Task 8/10/12 wire it into the page, so verify by tracing one example against the actual data shape `ScorecardCard.tsx` already produces (see its `record`/`checkKeys` handling around line 273-278): given a level record like
`{ "L4 Score": "2 / 5", "1. SLO Burn Rate Alerting": "pass 3 burn-rate alert(s), 5 fired (30d)", "2. Dynamic Scaling / K8s Autoscaling": "fail 12 cloud resources, none autoscaling", "3. Predictive Forecasting": "fail Davis forecasting not adopted", "4. Release Impact Tracking": "pass 2 deploy-triggered guardian run(s) (30d)", "5. Error Budget Gating": "fail Error budget not sent to change management" }`,
confirm by reading the code that `getFailingChecks([{level:"L4", record}])` would return checks #2, #3, #5 in that order (index order, score key excluded), and that `getTopMoves` would mark check #3 and #5 with `hardcoded: true, owner: "Platform team"` and check #2 with `hardcoded: false, owner: "App team"`.

- [ ] **Step 4: Commit**

```bash
git add ui/app/components/checkStatus.ts
git commit -m "Add checkStatus.ts: shared failing-check ranking and ownership split"
```

---

## Task 5: Shared "not yet live" badge component

**Files:**
- Create: `ui/app/components/HardcodedBadge.tsx`

**Interfaces:**
- Consumes: nothing (pure presentational, `size` prop controls compact vs full rendering).
- Produces: `<HardcodedBadge size="chip" | "full" />` — consumed by Task 8 (hero banner cells), Task 9/10 (card rows), Task 6 (hover popover), Task 11 (modal), Task 12 (recommendation band).

- [ ] **Step 1: Write the component**

```tsx
// ui/app/components/HardcodedBadge.tsx
//
// Visible marker for the 4 checks whose DQL is an unconditional literal
// string today (see checkDetailConfigs.ts's CHECK_REDESIGN_META comment) —
// used wherever such a check's status renders, so it's never mistaken for a
// real per-app measurement. `size="chip"` is a compact inline label for
// tight spaces (heatmap cells, card rows); `size="full"` adds the explanatory
// sentence, for the hover popover and modal.
import React from "react";

export const HardcodedBadge = ({ size = "chip" }: { size?: "chip" | "full" }) => {
  const chip = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: 0.5,
        color: "#fff",
        background:
          "repeating-linear-gradient(135deg, #6b7280, #6b7280 4px, #545a63 4px, #545a63 8px)",
        borderRadius: 4,
        padding: "2px 6px",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
      title="Not yet live: same result for every application until this capability is built"
    >
      Not yet live
    </span>
  );

  if (size === "chip") return chip;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      {chip}
      <span style={{ fontSize: 11, lineHeight: 1.4, color: "var(--ink-2, #6F747F)" }}>
        Same result for every application in this tenant until this capability is built — not a per-app measurement yet.
      </span>
    </div>
  );
};
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual check**

This component has no page to render on yet — it's exercised end-to-end once Task 11 (modal) wires it in. Skip manual verification here; Task 11's manual check covers it.

- [ ] **Step 4: Commit**

```bash
git add ui/app/components/HardcodedBadge.tsx
git commit -m "Add HardcodedBadge: visible marker for not-yet-live checks"
```

---

## Task 6: Shared check hover-preview popover

Models the existing `InfoTooltip` pattern already in `ScorecardCard.tsx` (ref + mouseenter/mouseleave + `ReactDOM.createPortal`), generalized to show a full mini status card instead of a single sentence, per the mockup's hover behavior.

**Files:**
- Create: `ui/app/components/CheckHoverPreview.tsx`

**Interfaces:**
- Consumes: `CHECK_DETAIL_CONFIGS`, `LEVEL_META` from `./checkDetailConfigs`; `getStatus` from `./checkStatus` (Task 4); `HardcodedBadge` (Task 5).
- Produces: `<CheckHoverPreview checkKey value accentColor>{children}</CheckHoverPreview>` — wraps any clickable check cell/row; on hover shows the popover, doesn't intercept clicks (children keep their own `onClick`). Consumed by Task 8 (hero banner cells) and Task 9/10 (card grid rows/cells).

- [ ] **Step 1: Write the component**

```tsx
// ui/app/components/CheckHoverPreview.tsx
import React from "react";
import ReactDOM from "react-dom";
import { CHECK_DETAIL_CONFIGS, LEVEL_META } from "./checkDetailConfigs";
import { getStatus } from "./checkStatus";
import { HardcodedBadge } from "./HardcodedBadge";

interface Props {
  checkKey: string;
  value: string;
  accentColor: string;
  children: React.ReactNode;
}

const STATUS_LABEL: Record<string, string> = { pass: "PASS", fail: "FAIL", warn: "WARN", na: "N/A" };
const STATUS_COLOR: Record<string, string> = {
  pass: "var(--pass-ink, #17663C)",
  fail: "var(--fail-ink, #B3261E)",
  warn: "var(--warn-ink, #8A6100)",
  na: "var(--na-ink, #4C5B73)",
};

export const CheckHoverPreview = ({ checkKey, value, accentColor, children }: Props) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [coords, setCoords] = React.useState<{ x: number; y: number } | null>(null);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const width = 340;
    const x = Math.max(12, Math.min(window.innerWidth - width - 12, r.left));
    setCoords({ x, y: r.bottom + 8 });
  };
  const hide = () => setCoords(null);

  const config = CHECK_DETAIL_CONFIGS[checkKey];
  const status = getStatus(value);
  const display = value.replace(/^(pass|fail|warn|n\/a)\s*/i, "");
  const levelInfo = config ? LEVEL_META[config.level] : null;

  return (
    <div ref={ref} onMouseEnter={show} onMouseLeave={hide} style={{ display: "contents" }}>
      {children}
      {coords &&
        config &&
        ReactDOM.createPortal(
          <div
            style={{
              position: "fixed",
              left: coords.x,
              top: coords.y,
              width: 340,
              zIndex: 9999,
              background: "var(--card, #fff)",
              border: "1px solid var(--line, rgba(0,0,0,0.08))",
              borderRadius: 12,
              boxShadow: "0 20px 60px rgba(20,28,49,.28)",
              overflow: "hidden",
              pointerEvents: "none",
            }}
          >
            <div style={{ height: 3, background: accentColor }} />
            <div style={{ padding: "13px 15px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    color: STATUS_COLOR[status],
                    background: "var(--panel, #F7F8FA)",
                    borderRadius: 4,
                    padding: "2px 7px",
                  }}
                >
                  {config.level}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 0 }}>
                  {checkKey.replace(/^\d+\.\s*/, "")}
                </span>
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, color: STATUS_COLOR[status] }}>
                  {STATUS_LABEL[status]}
                </span>
              </div>
              {config.hardcoded && <HardcodedBadge size="chip" />}
              <div style={{ fontSize: 12.5, color: "var(--ink, #1A2440)", lineHeight: 1.5 }}>
                {display || "—"}
              </div>
              <div>
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: 0.7,
                    color: "var(--ink-2, #6F747F)",
                    textTransform: "uppercase",
                  }}
                >
                  How it's calculated
                </span>
                <p style={{ margin: "4px 0 0", fontSize: 11.5, lineHeight: 1.5, color: "var(--ink, #1A2440)" }}>
                  {config.description}
                </p>
              </div>
              <div
                style={{
                  background: levelInfo ? `${levelInfo.color}14` : "var(--panel, #F7F8FA)",
                  border: `1px solid ${levelInfo ? levelInfo.color + "40" : "var(--line, #E3E6EB)"}`,
                  borderRadius: 7,
                  padding: "7px 10px",
                }}
              >
                <span style={{ fontSize: 11.5, lineHeight: 1.45 }}>
                  <strong style={{ color: levelInfo?.color }}>Passes when: </strong>
                  {config.passLogic}
                </span>
              </div>
              <span style={{ fontSize: 10.5, color: "var(--ink-2, #6F747F)" }}>Click for full detail →</span>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual check**

No render target yet — exercised end-to-end once Task 9 wires it into a check row. Skip standalone verification.

- [ ] **Step 4: Commit**

```bash
git add ui/app/components/CheckHoverPreview.tsx
git commit -m "Add CheckHoverPreview: hover popover for check cells/rows"
```

---

## Task 7: New `AppIdentityBar.tsx` (single-row app identity bar)

**Files:**
- Create: `ui/app/components/AppIdentityBar.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (uses `useDql` directly, same as `AppContextBanner.tsx`).
- Produces: `<AppIdentityBar appCI={string} />` — consumed by Task 13 (`ScorecardsPage.tsx`), replacing the `AppContextBanner` import there only.

**Do not modify `ui/app/components/AppContextBanner.tsx`** — it's also used by `ui/app/pages/Home.tsx` (confirmed via grep), which is out of scope.

- [ ] **Step 1: Write the component**

```tsx
// ui/app/components/AppIdentityBar.tsx
//
// Single-row app identity bar for the redesigned Scorecards page. Same data
// source as AppContextBanner.tsx (PROFILE_LOOKUP/PROFILE_FALLBACK) — that
// component is left untouched because Home.tsx also renders it and this
// redesign doesn't touch Home.
import React, { useRef } from "react";
import { Paragraph } from "@dynatrace/strato-components/typography";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { RefreshOverlay } from "./RefreshOverlay";

interface Props {
  appCI: string;
}

function getCriticalityColor(criticality: string): string {
  const c = criticality.toLowerCase();
  if (c.includes("1") || c.includes("most critical")) return "var(--fail-ink, #B3261E)";
  if (c.includes("2") || c.includes("high")) return "#c2410c";
  if (c.includes("3") || c.includes("moderate")) return "var(--warn-ink, #8A6100)";
  if (c.includes("4") || c.includes("low")) return "var(--pass-ink, #17663C)";
  return "var(--ink-2, #6F747F)";
}

function getStatusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("production")) return "var(--pass-ink, #17663C)";
  if (s.includes("implementation")) return "var(--nav-active, #1414D3)";
  if (s.includes("retired")) return "var(--fail-ink, #B3261E)";
  return "var(--ink-2, #6F747F)";
}

function Chip({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 5, flexShrink: 0 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.5,
          color: "var(--ink-2, #6F747F)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: valueColor ?? "var(--ink, #1A2440)" }}>
        {value || "—"}
      </span>
    </div>
  );
}

const PROFILE_LOOKUP = (appCI: string) =>
  `load "/lookups/dynatrace/cmdb_appci_owner_mapping"
| filter lower(applicationci) == lower("${appCI}")
| fields
    name,
    applicationci,
    business_criticality,
    operational_status,
    \`managed_by.u_managing_director\`,
    owned_by,
    support_group`;

const PROFILE_FALLBACK = (appCI: string) =>
  `fetch bizevents, from:now()-48h
| filter event.type == "workflow.import.servicenow.appci"
| filter lower(applicationci) == lower("${appCI}")
| sort timestamp desc
| limit 1`;

export const AppIdentityBar = ({ appCI }: Props) => {
  const { data: lookupData, isLoading: lookupLoading, error: lookupError } = useDql({
    query: PROFILE_LOOKUP(appCI),
  });
  const { data: fallbackData, isLoading: fallbackLoading } = useDql({
    query: lookupError ? PROFILE_FALLBACK(appCI) : "data record(skip = true) | limit 0",
  });

  const data = lookupError ? fallbackData : lookupData;
  const isLoading = lookupError ? fallbackLoading : lookupLoading;

  const cacheRef = useRef<Record<string, unknown>>({});
  const currentRecord = (data?.records?.[0] || null) as Record<string, unknown> | null;
  if (currentRecord) cacheRef.current = currentRecord;

  const hasCache = Object.keys(cacheRef.current).length > 0;
  const isRefreshing = isLoading && hasCache;
  const isFirstLoad = isLoading && !hasCache;

  if (isFirstLoad) {
    return (
      <div
        style={{
          background: "var(--card, #fff)",
          borderRadius: 10,
          padding: "10px 14px",
          border: "1px solid var(--line, #E3E6EB)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <ProgressCircle size="small" />
        <Paragraph style={{ fontSize: 12 }}>Loading application profile...</Paragraph>
      </div>
    );
  }

  const r = (currentRecord || cacheRef.current) as Record<string, unknown>;
  const name = String(r.name || "");
  const appci = String(r.applicationci || appCI);
  const criticality = String(r.business_criticality || "—");
  const status = String(r.operational_status || "In Production");
  const director = String(r["managed_by.u_managing_director"] || "—");
  const owner = String(r.owned_by || "—");
  const supportGroup = String(r.support_group || "—");

  return (
    <RefreshOverlay isRefreshing={isRefreshing}>
      <div
        style={{
          background: "var(--card, #fff)",
          border: "1px solid var(--line, #E3E6EB)",
          borderRadius: 10,
          padding: "10px 16px",
          boxShadow: "var(--shadow, 0 1px 2px rgba(26,36,64,.05))",
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0 }}>
          <span style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, color: "var(--ink, #1A2440)" }}>
            {appci.toUpperCase()}
          </span>
          <span style={{ fontSize: 13, color: "var(--ink, #1A2440)" }}>{name}</span>
        </div>
        <div style={{ width: 1, height: 26, background: "var(--line, #E3E6EB)", flexShrink: 0 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <Chip label="Tier" value={criticality} valueColor={getCriticalityColor(criticality)} />
          <Chip label="Status" value={status} valueColor={getStatusColor(status)} />
          <Chip label="MD" value={director} />
          <Chip label="Owner" value={owner} />
          <Chip label="Support" value={supportGroup} />
        </div>
        {lookupError && !fallbackData?.records?.length && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink-2, #6F747F)" }}>
            CMDB lookup unavailable — showing data from ServiceNow import
          </span>
        )}
      </div>
    </RefreshOverlay>
  );
};
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual check**

`AppIdentityBar` isn't rendered anywhere yet — it's wired into `ScorecardsPage.tsx` in Task 13. Skip standalone verification.

- [ ] **Step 4: Commit**

```bash
git add ui/app/components/AppIdentityBar.tsx
git commit -m "Add AppIdentityBar: single-row app identity bar for Scorecards redesign"
```

---

## Architecture note before Tasks 8-13: lifting data-fetching and modal state to `ScorecardsPage.tsx`

The mockup's own markup confirms hero-banner cells and card-grid rows both call the same `onOpen` handler (`SRE Scorecards - Redesign.dc.html` lines 163 and 262 both carry `onClick="{{ onOpen }}"` on a check cell). Today, `OverallScore.tsx` has no click behavior at all, and each `ScorecardCard` independently fetches its own query and owns its own `selectedCheck` state + renders its own `<CheckDetailModal>` (5 separate modal instances, one dormant in each card). For the hero banner and the card grid to open the *same* modal (needed for Task 11's sibling-check sidebar to work regardless of whether you clicked from the banner or the grid), the data-fetching and "which check is open" state need to live one level up, in `ScorecardsPage.tsx`:

- `ScorecardsPage.tsx` (Task 13) fetches all 5 level queries itself (`useDqlWithCache` × 5, same query strings as today, plus `useLiveCheckOverride` for L3), producing `levelRecords: LevelRecord[]` (Task 4's type).
- `ScorecardsPage.tsx` owns `mode` state and `openCheck: { level: LevelId; key: string; value: string } | null` state, and renders exactly one `<CheckDetailModal>`.
- `MaturitySpine` (Task 8) and `ScorecardCard` (Tasks 9-10) become presentational: they receive already-resolved records and loading flags as props, and call an `onCheckOpen` callback instead of fetching or holding modal state themselves.
- `NextMovesBand` (Task 12) receives `levelRecords` as a prop — no independent fetch, avoiding a 6th round of the same 5 queries.

This also means `ScorecardCard.tsx` and `OverallScore.tsx`'s current `useDqlWithCache`/`useLiveCheckOverride` calls move to `ScorecardsPage.tsx`, and `OverallScore.tsx` is deleted once `MaturitySpine` replaces it (Task 13).

---

## Task 8: `MaturitySpine.tsx` — hero banner (replaces `OverallScore.tsx`)

**Files:**
- Create: `ui/app/components/MaturitySpine.tsx`

**Interfaces:**
- Consumes: `LevelRecord`, `getStatus`, `getFailingChecks`, `splitByOwnership` from `./checkStatus` (Task 4); `LEVEL_META`, `CHECK_DETAIL_CONFIGS` from `./checkDetailConfigs` (Task 3); `CheckHoverPreview` (Task 6); `HardcodedBadge` (Task 5).
- Produces: `<MaturitySpine levelRecords={LevelRecord[]} isLoading={boolean} isRefreshing={boolean} mode={"engineer"|"executive"} onModeChange={(m) => void} onCheckOpen={(level, key, value) => void} />`. Consumed by Task 13 (`ScorecardsPage.tsx`).

- [ ] **Step 1: Write the component**

```tsx
// ui/app/components/MaturitySpine.tsx
//
// Replaces OverallScore.tsx. Two render modes (Engineer default, Executive)
// toggled by the `mode` prop, which ScorecardsPage.tsx owns so the card grid
// (Task 9/10) switches in lockstep. Does not fetch data itself — receives
// already-resolved level records from ScorecardsPage.tsx (see the
// architecture note above this task).
import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { Paragraph } from "@dynatrace/strato-components/typography";
import { LEVEL_META, CHECK_DETAIL_CONFIGS } from "./checkDetailConfigs";
import { LevelRecord, LevelId, getStatus, flattenChecks, splitByOwnership } from "./checkStatus";
import { CheckHoverPreview } from "./CheckHoverPreview";
import { HardcodedBadge } from "./HardcodedBadge";

interface Props {
  levelRecords: LevelRecord[];
  isLoading: boolean;
  isRefreshing: boolean;
  mode: "engineer" | "executive";
  onModeChange: (mode: "engineer" | "executive") => void;
  onCheckOpen: (level: LevelId, key: string, value: string) => void;
}

function parseScore(record: Record<string, unknown>): { current: number; total: number } {
  const scoreKey = Object.keys(record).find((k) => k.toLowerCase().includes("score"));
  if (!scoreKey) return { current: 0, total: 0 };
  const match = String(record[scoreKey]).match(/(\d+)\s*\/\s*(\d+)/);
  return match ? { current: parseInt(match[1], 10), total: parseInt(match[2], 10) } : { current: 0, total: 0 };
}

function getCurrentLevel(levelRecords: LevelRecord[]): { grade: LevelId; title: string; color: string } {
  const order: LevelId[] = ["L1", "L2", "L3", "L4", "L5"];
  const THRESHOLD = 0.8;
  let currentIdx = 0;
  for (let i = 0; i < order.length; i++) {
    const lr = levelRecords.find((l) => l.level === order[i]);
    const { current, total } = lr ? parseScore(lr.record) : { current: 0, total: 0 };
    const pct = total > 0 ? current / total : 0;
    if (pct >= THRESHOLD) currentIdx = Math.min(i + 1, order.length - 1);
    else { currentIdx = i; break; }
  }
  const grade = order[currentIdx];
  return { grade, title: LEVEL_META[grade].title, color: LEVEL_META[grade].color };
}

const STATUS_CELL_COLOR: Record<string, string> = {
  pass: "var(--pass-ink, #17663C)",
  fail: "var(--fail-ink, #B3261E)",
  warn: "var(--warn-ink, #8A6100)",
  na: "var(--na-ink, #4C5B73)",
};

function CheckCell({
  levelId,
  checkKey,
  value,
  onCheckOpen,
  height,
}: {
  levelId: LevelId;
  checkKey: string;
  value: string;
  onCheckOpen: Props["onCheckOpen"];
  height: number;
}) {
  const status = getStatus(value);
  const hardcoded = CHECK_DETAIL_CONFIGS[checkKey]?.hardcoded ?? false;
  return (
    <CheckHoverPreview checkKey={checkKey} value={value} accentColor={LEVEL_META[levelId].color}>
      <div
        onClick={() => onCheckOpen(levelId, checkKey, value)}
        title={checkKey}
        style={{
          flex: 1,
          height,
          borderRadius: 3,
          cursor: "pointer",
          background: STATUS_CELL_COLOR[status],
          opacity: status === "na" ? 0.35 : status === "pass" ? 0.55 : 1,
          backgroundImage: hardcoded
            ? "repeating-linear-gradient(135deg, rgba(255,255,255,0.35) 0, rgba(255,255,255,0.35) 3px, transparent 3px, transparent 6px)"
            : undefined,
        }}
      />
    </CheckHoverPreview>
  );
}

export const MaturitySpine = ({ levelRecords, isLoading, isRefreshing, mode, onModeChange, onCheckOpen }: Props) => {
  if (isLoading) {
    return (
      <div
        style={{
          background: "var(--spine, #1A2440)",
          borderRadius: 16,
          padding: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
        }}
      >
        <ProgressCircle size="small" />
        <Paragraph style={{ color: "rgba(255,255,255,0.7)" }}>Calculating overall maturity...</Paragraph>
      </div>
    );
  }

  const order: LevelId[] = ["L1", "L2", "L3", "L4", "L5"];
  const totals = order.map((level) => {
    const lr = levelRecords.find((l) => l.level === level);
    return lr ? parseScore(lr.record) : { current: 0, total: 0 };
  });
  const totalCurrent = totals.reduce((s, t) => s + t.current, 0);
  const totalPossible = totals.reduce((s, t) => s + t.total, 0);
  const { grade, title, color } = getCurrentLevel(levelRecords);
  const allChecks = flattenChecks(levelRecords);
  const { platformGaps, quickWins } = splitByOwnership(allChecks.filter((c) => c.status === "fail" || c.status === "warn"));

  return (
    <div
      style={{
        background: "var(--spine, #1A2440)",
        borderRadius: 16,
        padding: "20px 24px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
        opacity: isRefreshing ? 0.7 : 1,
        transition: "opacity 0.3s ease",
      }}
    >
      <Flex justifyContent="space-between" alignItems="flex-start" style={{ marginBottom: 16 }}>
        <Flex flexDirection="column" gap={2}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: "rgba(255,255,255,.42)" }}>
            CURRENT MATURITY
          </span>
          <Flex alignItems="baseline" gap={10}>
            <span style={{ fontSize: 40, fontWeight: 600, color: "#fff", letterSpacing: -1 }}>{grade}</span>
            <span style={{ fontSize: 15, fontWeight: 500, color, letterSpacing: 0.3 }}>{title}</span>
          </Flex>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>
            {totalCurrent}/{totalPossible} checks passing · {quickWins.length} quick wins · {platformGaps.length} platform gaps
          </span>
        </Flex>

        <div
          style={{
            display: "flex",
            border: "1px solid rgba(255,255,255,.18)",
            borderRadius: 8,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {(["engineer", "executive"] as const).map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              style={{
                border: "none",
                padding: "6px 12px",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.3,
                textTransform: "capitalize",
                cursor: "pointer",
                background: mode === m ? "rgba(255,255,255,.16)" : "transparent",
                color: mode === m ? "#fff" : "rgba(255,255,255,.5)",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </Flex>

      <div style={{ display: "flex", gap: mode === "executive" ? 24 : 18, alignItems: "flex-end" }}>
        {order.map((level) => {
          const lr = levelRecords.find((l) => l.level === level);
          const { current, total } = lr ? parseScore(lr.record) : { current: 0, total: 0 };
          const checkKeys = lr ? Object.keys(lr.record).filter((k) => !k.toLowerCase().includes("score")) : [];
          return (
            <div key={level} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <Flex alignItems="baseline" gap={7}>
                <span style={{ fontSize: 11.5, fontWeight: 900, color: LEVEL_META[level].color }}>{level}</span>
                {mode === "engineer" && (
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {LEVEL_META[level].title}
                  </span>
                )}
                <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.8)" }}>
                  {current}/{total}
                </span>
              </Flex>
              <div style={{ display: "flex", gap: 3 }}>
                {checkKeys.map((key) => (
                  <CheckCell
                    key={key}
                    levelId={level}
                    checkKey={key}
                    value={String(lr!.record[key])}
                    onCheckOpen={onCheckOpen}
                    height={mode === "executive" ? 44 : 22}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {platformGaps.some((c) => CHECK_DETAIL_CONFIGS[c.key]?.hardcoded) && (
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <HardcodedBadge size="chip" />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>
            Some platform gaps above are not yet wired to live data — see badge on hover.
          </span>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual check**

Not wired into a page yet — exercised end-to-end in Task 13. Skip standalone verification.

- [ ] **Step 4: Commit**

```bash
git add ui/app/components/MaturitySpine.tsx
git commit -m "Add MaturitySpine: Engineer/Executive hero banner replacing OverallScore"
```

---

## Task 9: Rewrite `ScorecardCard.tsx` — Engineer + Executive modes

Note on "def ↗" (spec §4): `DefinitionsPage.tsx` has no level-specific anchor or query-param routing today (checked — no `useSearchParams`/`useLocation`/hash handling in that file), so the link goes to the whole `/definitions` page, not a level-scoped deep link.

**Files:**
- Modify: `ui/app/components/ScorecardCard.tsx` (full rewrite — props interface changes; no longer fetches data or owns modal state, per the architecture note before Task 8)

**Interfaces:**
- Consumes: `LevelId`, `getStatus` from `./checkStatus` (Task 4); `LEVEL_META`, `CHECK_DETAIL_CONFIGS` from `./checkDetailConfigs` (Task 3); `CheckHoverPreview` (Task 6); `HardcodedBadge` (Task 5); `RefreshOverlay` (existing).
- Produces: `<ScorecardCard level title accentColor record isLoading isRefreshing error mode onCheckOpen />` — consumed by Task 12 (`ScorecardsPage.tsx`). Note this REPLACES the current `{title, query, accentColor, appCI, liveOverride}` props entirely.

- [ ] **Step 1: Write the new component**

Replace the entire contents of `ui/app/components/ScorecardCard.tsx` with:

```tsx
// ui/app/components/ScorecardCard.tsx
//
// Per-level card in the Scorecards redesign. No longer fetches its own data
// or owns modal state (see the architecture note before Task 8 in
// docs/superpowers/plans/2026-08-29-scorecards-redesign.md) — ScorecardsPage
// fetches once and passes the resolved record down, and a single shared
// CheckDetailModal (Task 10) lives at the ScorecardsPage level so hero-banner
// cells and card-grid rows open the same modal.
import React from "react";
import { Link } from "react-router-dom";
import { Paragraph } from "@dynatrace/strato-components/typography";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { RefreshOverlay } from "./RefreshOverlay";
import { LEVEL_META, CHECK_DETAIL_CONFIGS } from "./checkDetailConfigs";
import { LevelId, getStatus, getFailingChecks, splitByOwnership, CheckResult } from "./checkStatus";
import { CheckHoverPreview } from "./CheckHoverPreview";
import { HardcodedBadge } from "./HardcodedBadge";

interface Props {
  level: LevelId;
  title: string;
  accentColor: string;
  record: Record<string, unknown> | undefined;
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null | undefined;
  mode: "engineer" | "executive";
  onCheckOpen: (level: LevelId, key: string, value: string) => void;
}

const STATUS_STYLES = {
  pass: { bg: "rgba(30,158,90,.10)", border: "rgba(30,158,90,.34)", text: "var(--pass-ink, #17663C)" },
  fail: { bg: "rgba(220,53,69,.11)", border: "rgba(220,53,69,.34)", text: "var(--fail-ink, #B3261E)" },
  warn: { bg: "rgba(232,163,61,.14)", border: "rgba(232,163,61,.38)", text: "var(--warn-ink, #8A6100)" },
  na: { bg: "rgba(143,160,188,.10)", border: "rgba(143,160,188,.32)", text: "var(--na-ink, #4C5B73)" },
};

function parseScore(record: Record<string, unknown>): { current: number; total: number } {
  const scoreKey = Object.keys(record).find((k) => k.toLowerCase().includes("score"));
  if (!scoreKey) return { current: 0, total: 0 };
  const match = String(record[scoreKey]).match(/(\d+)\s*\/\s*(\d+)/);
  return match ? { current: parseInt(match[1], 10), total: parseInt(match[2], 10) } : { current: 0, total: 0 };
}

function CardShell({ accentColor, children }: { accentColor: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--card, #fff)",
        border: "1px solid var(--line, #E3E6EB)",
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "var(--shadow, 0 1px 2px rgba(26,36,64,.05))",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ height: 3, background: accentColor, flexShrink: 0 }} />
      {children}
    </div>
  );
}

function CardHeader({ level, title, accentColor, current, total }: { level: LevelId; title: string; accentColor: string; current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div style={{ padding: "11px 13px 10px", borderBottom: "1px solid var(--line, #E3E6EB)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 17, fontWeight: 900, color: accentColor, fontVariantNumeric: "tabular-nums" }}>{level}</span>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</span>
        <Link to="/definitions" style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink-2, #6F747F)" }}>
          def ↗
        </Link>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 8 }}>
        <div style={{ flex: 1, height: 5, borderRadius: 3, background: "var(--panel, #F7F8FA)", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: accentColor }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{current}/{total}</span>
        <span style={{ fontSize: 11, color: "var(--ink-2, #6F747F)" }}>{pct}%</span>
      </div>
    </div>
  );
}

function EngineerRow({ level, checkKey, value, onCheckOpen }: { level: LevelId; checkKey: string; value: string; onCheckOpen: Props["onCheckOpen"] }) {
  const status = getStatus(value);
  const s = STATUS_STYLES[status];
  const display = value.replace(/^(pass|fail|warn|n\/a)\s*/i, "");
  const hardcoded = CHECK_DETAIL_CONFIGS[checkKey]?.hardcoded ?? false;
  const [hovered, setHovered] = React.useState(false);

  return (
    <CheckHoverPreview checkKey={checkKey} value={value} accentColor={LEVEL_META[level].color}>
      <div
        onClick={() => onCheckOpen(level, checkKey, value)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onCheckOpen(level, checkKey, value); }}
        style={{
          padding: "8px 10px",
          display: "flex",
          gap: 8,
          cursor: "pointer",
          borderBottom: "1px solid var(--line-soft, #F2F4F7)",
          background: hovered ? s.bg : "transparent",
        }}
      >
        <div style={{ width: 4, flexShrink: 0, borderRadius: 2, background: s.border }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: s.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {checkKey.replace(/^\d+\.\s*/, "")}
            </span>
            {hardcoded && <HardcodedBadge size="chip" />}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink, #1A2440)", lineHeight: 1.35, marginTop: 1 }}>
            {display || (status === "na" ? "N/A" : status === "fail" ? "Not detected" : "Active")}
          </div>
        </div>
      </div>
    </CheckHoverPreview>
  );
}

function ExecutiveOpenItem({ level, check, onCheckOpen }: { level: LevelId; check: CheckResult; onCheckOpen: Props["onCheckOpen"] }) {
  const hardcoded = CHECK_DETAIL_CONFIGS[check.key]?.hardcoded ?? false;
  return (
    <div
      onClick={() => onCheckOpen(level, check.key, check.value)}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, cursor: "pointer" }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: check.status === "fail" ? "var(--fail-ink, #B3261E)" : "var(--warn-ink, #8A6100)" }} />
      <span style={{ fontSize: 11, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
        {check.key.replace(/^\d+\.\s*/, "")}
      </span>
      {hardcoded && <HardcodedBadge size="chip" />}
    </div>
  );
}

export const ScorecardCard = ({ level, title, accentColor, record, isLoading, isRefreshing, error, mode, onCheckOpen }: Props) => {
  if (isLoading) {
    return (
      <CardShell accentColor={accentColor}>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, minHeight: 300, justifyContent: "center" }}>
          <ProgressCircle size="small" />
          <Paragraph style={{ fontSize: 12 }}>Loading...</Paragraph>
        </div>
      </CardShell>
    );
  }

  if (error || !record) {
    return (
      <CardShell accentColor={accentColor}>
        <div style={{ padding: 16 }}>
          <Paragraph style={{ color: "var(--fail-ink, #B3261E)", fontSize: 11 }}>
            {error?.message ?? "No data available"}
          </Paragraph>
        </div>
      </CardShell>
    );
  }

  const { current, total } = parseScore(record);
  const checkKeys = Object.keys(record).filter((k) => !k.toLowerCase().includes("score"));

  if (mode === "engineer") {
    return (
      <RefreshOverlay isRefreshing={isRefreshing}>
        <CardShell accentColor={accentColor}>
          <CardHeader level={level} title={title} accentColor={accentColor} current={current} total={total} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            {checkKeys.map((key) => (
              <EngineerRow key={key} level={level} checkKey={key} value={String(record[key])} onCheckOpen={onCheckOpen} />
            ))}
          </div>
        </CardShell>
      </RefreshOverlay>
    );
  }

  // Executive mode
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  // Reuse checkStatus.ts's flattening/filtering instead of re-deriving
  // CheckResult by hand here — flattenChecks/getFailingChecks already parse
  // the leading "N." index and status the same way (Task 4).
  const failing = getFailingChecks([{ level, record }]);
  const { quickWins, platformGaps } = splitByOwnership(failing);

  return (
    <RefreshOverlay isRefreshing={isRefreshing}>
      <CardShell accentColor={accentColor}>
        <div style={{ padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
              <svg width={64} height={64} viewBox="0 0 64 64">
                <circle cx={32} cy={32} r={radius} fill="none" stroke="var(--line, #E3E6EB)" strokeWidth={7} />
                <circle
                  cx={32} cy={32} r={radius} fill="none" stroke={accentColor} strokeWidth={7}
                  strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
                  transform="rotate(-90 32 32)"
                />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: accentColor }}>{pct}%</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: accentColor }}>{level}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
              <span style={{ fontSize: 11, color: "var(--ink-2, #6F747F)" }}>{current}/{total} checks met</span>
            </div>
          </div>
          <span style={{ fontSize: 11, lineHeight: 1.5, color: "var(--ink-2, #6F747F)" }}>{LEVEL_META[level].outcome}</span>
          {failing.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 11, borderTop: "1px solid var(--line-soft, #F2F4F7)" }}>
              {quickWins.length > 0 && (
                <>
                  <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.7, color: "var(--ink-2, #6F747F)" }}>
                    QUICK WINS ({quickWins.length})
                  </span>
                  {quickWins.map((c) => (
                    <ExecutiveOpenItem key={c.key} level={level} check={c} onCheckOpen={onCheckOpen} />
                  ))}
                </>
              )}
              {platformGaps.length > 0 && (
                <>
                  <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.7, color: "var(--ink-2, #6F747F)", marginTop: quickWins.length > 0 ? 6 : 0 }}>
                    PLATFORM GAPS ({platformGaps.length})
                  </span>
                  {platformGaps.map((c) => (
                    <ExecutiveOpenItem key={c.key} level={level} check={c} onCheckOpen={onCheckOpen} />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </CardShell>
    </RefreshOverlay>
  );
};
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: **fails** at this point — `ui/app/pages/ScorecardsPage.tsx` still imports and renders the old `ScorecardCard` API (`title`/`query`/`accentColor`/`appCI`/`liveOverride`). This is expected; Task 12 fixes the call site. Confirm the failure is specifically about `ScorecardsPage.tsx`'s usage (wrong/missing props), not a syntax error inside `ScorecardCard.tsx` itself — read the error carefully.

- [ ] **Step 3: Commit**

```bash
git add ui/app/components/ScorecardCard.tsx
git commit -m "Rewrite ScorecardCard: Engineer/Executive modes, presentational (no own fetch/modal)"
```

---

## Task 10: `CheckDetailModal.tsx` — sibling sidebar, keyboard nav, OPEN IN footer, hardcoded notice

This is a surgical, additive change to a large existing file (1945 lines) — every edit below is anchored to exact existing text. Do not touch anything else in the file (the chart renderers, `DataPanel`, etc. are unaffected).

**Files:**
- Modify: `ui/app/components/CheckDetailModal.tsx` (Props interface ~line 9-15, function signature ~line 1449, keyboard effect ~line 1464-1468, outer container + new sidebar ~line 1484-1497, status banner ~line 1614-1651, footer + closing tags ~line 1922-1943)

**Interfaces:**
- Consumes: `HardcodedBadge` (Task 5); `openIn`/`hardcoded` fields already on `CHECK_DETAIL_CONFIGS` entries (Task 3).
- Produces: `CheckDetailModal` now requires two new props: `siblings: { key: string; value: string }[]` (all checks in the same level, in display order, including the currently-open one) and `onNavigate: (key: string, value: string) => void`. Consumed by Task 12 (`ScorecardsPage.tsx`), which is the modal's only remaining call site after Task 9 removed it from `ScorecardCard.tsx`.

- [ ] **Step 1: Add the import**

Find (near the top of the file, alongside the other imports):

```ts
import { CHECK_DETAIL_CONFIGS, LEVEL_META, CheckDetailConfig } from "./checkDetailConfigs";
```

Add a line after it:

```ts
import { CHECK_DETAIL_CONFIGS, LEVEL_META, CheckDetailConfig } from "./checkDetailConfigs";
import { HardcodedBadge } from "./HardcodedBadge";
```

- [ ] **Step 2: Extend the `Props` interface**

Find:

```ts
interface Props {
  checkKey: string;
  currentValue: string;
  appCI: string;
  accentColor: string;
  onClose: () => void;
}
```

Replace with:

```ts
interface Props {
  checkKey: string;
  currentValue: string;
  appCI: string;
  accentColor: string;
  onClose: () => void;
  /** All checks in the same level, in display order, including the currently-open one. */
  siblings: { key: string; value: string }[];
  onNavigate: (key: string, value: string) => void;
}
```

- [ ] **Step 3: Destructure the new props and compute the sibling index**

Find:

```ts
export function CheckDetailModal({ checkKey, currentValue, appCI, accentColor, onClose }: Props) {
```

Replace with:

```ts
export function CheckDetailModal({ checkKey, currentValue, appCI, accentColor, onClose, siblings, onNavigate }: Props) {
```

Find (a few lines later, the existing Escape-only keyboard effect):

```ts
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
```

Replace with:

```ts
  const siblingIndex = siblings.findIndex((s) => s.key === checkKey);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (siblings.length < 2) return;
      if (e.key === "ArrowLeft") {
        const prev = siblings[(siblingIndex - 1 + siblings.length) % siblings.length];
        onNavigate(prev.key, prev.value);
      } else if (e.key === "ArrowRight") {
        const next = siblings[(siblingIndex + 1) % siblings.length];
        onNavigate(next.key, next.value);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onNavigate, siblings, siblingIndex]);
```

- [ ] **Step 4: Turn the modal box into a row, add the sibling sidebar**

Find:

```tsx
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--sre-surface, #fff)",
          borderRadius: 14,
          width: "100%",
          maxWidth: 1440,
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 80px rgba(0,0,0,0.38)",
          overflow: "hidden",
        }}
      >
        {/* ── Header ── */}
```

Replace with:

```tsx
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--sre-surface, #fff)",
          borderRadius: 14,
          width: "100%",
          maxWidth: 1440,
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "row",
          boxShadow: "0 24px 80px rgba(0,0,0,0.38)",
          overflow: "hidden",
        }}
      >
        {/* ── Sibling sidebar (redesign) ── */}
        {siblings.length > 1 && (
          <div
            style={{
              width: 206,
              flexShrink: 0,
              background: "var(--panel, #F7F8FA)",
              borderRight: "1px solid var(--sre-border, rgba(0,0,0,0.08))",
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
              padding: 8,
            }}
          >
            {siblings.map((s) => {
              const isActive = s.key === checkKey;
              const sStatus = s.value.toLowerCase().startsWith("pass") ? "pass"
                : s.value.toLowerCase().startsWith("fail") ? "fail"
                : s.value.toLowerCase().startsWith("warn") ? "warn" : "na";
              const dotColor = { pass: "#1E9E5A", fail: "#DC3545", warn: "#E8A33D", na: "#8FA0BC" }[sStatus];
              return (
                <div
                  key={s.key}
                  onClick={() => onNavigate(s.key, s.value)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "9px 10px",
                    borderRadius: 7,
                    cursor: "pointer",
                    background: isActive ? "var(--sre-surface, #fff)" : "transparent",
                    fontWeight: isActive ? 700 : 500,
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: dotColor }} />
                  <span style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.key.replace(/^\d+\.\s*/, "")}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        {/* ── Header ── */}
```

- [ ] **Step 5: Add the hardcoded notice to the status banner**

Find:

```tsx
          <span style={{ fontSize: 13, color: ss.text, fontWeight: 500, lineHeight: 1.3 }}>
            {displayValue ||
              (status === "pass" ? "Active" : status === "na" ? "Not applicable" : "Not detected")}
          </span>
        </div>

        {/* ── Body (two columns) ── */}
```

Replace with:

```tsx
          <span style={{ fontSize: 13, color: ss.text, fontWeight: 500, lineHeight: 1.3 }}>
            {displayValue ||
              (status === "pass" ? "Active" : status === "na" ? "Not applicable" : "Not detected")}
          </span>
          {config?.hardcoded && (
            <span style={{ marginLeft: "auto" }}>
              <HardcodedBadge size="full" />
            </span>
          )}
        </div>

        {/* ── Body (two columns) ── */}
```

- [ ] **Step 6: Add the OPEN IN footer links and close the new wrapper div**

Find (the existing footer plus the two closing divs right after it):

```tsx
        {/* ── Footer ── */}
        <div
          style={{
            padding: "7px 20px",
            borderTop: "1px solid var(--sre-border, rgba(0,0,0,0.08))",
            fontSize: 11,
            color: "var(--sre-text-secondary, #6F747F)",
            flexShrink: 0,
            background: "var(--sre-surface-secondary, rgba(0,0,0,0.02))",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          <span>Click backdrop or press Esc to close</span>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
```

Replace with:

```tsx
        {/* ── Footer ── */}
        <div
          style={{
            padding: "7px 20px",
            borderTop: "1px solid var(--sre-border, rgba(0,0,0,0.08))",
            fontSize: 11,
            color: "var(--sre-text-secondary, #6F747F)",
            flexShrink: 0,
            background: "var(--sre-surface-secondary, rgba(0,0,0,0.02))",
            display: "flex",
            alignItems: "center",
            gap: 8,
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {config?.openIn?.length ? (
              <>
                <span style={{ fontWeight: 700, letterSpacing: 0.6, flexShrink: 0 }}>OPEN IN</span>
                {config.openIn.map((l) => (
                  <a
                    key={l.path}
                    href={`${getEnvironmentUrl().replace(/\/$/, "")}${l.path}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 9px",
                      border: "1px solid var(--sre-border, rgba(0,0,0,0.08))",
                      borderRadius: 6,
                      color: "var(--sre-text-primary, #1f2328)",
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {l.label} ↗
                  </a>
                ))}
              </>
            ) : null}
          </div>
          <span style={{ flexShrink: 0 }}>
            {siblings.length > 1 ? "← → checks · " : ""}Click backdrop or press Esc to close
          </span>
        </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
```

(Note the extra closing `</div>` immediately after the footer's closing `</div>` — that's the wrapper opened in Step 4.)

- [ ] **Step 7: Verify the build**

Run: `npm run build`
Expected: **fails** — `ScorecardCard.tsx` no longer renders `CheckDetailModal` at all (Task 9 removed it), so there's currently no call site passing `siblings`/`onNavigate`. This is expected; Task 12 adds the one remaining call site. Confirm no *other* errors (mismatched JSX tags, etc.) — count that the sidebar's `<div>` opened in Step 4 and closed in Step 6 balances (search the diff for exactly one added opening `<div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>` and exactly one added bare `</div>` immediately after the footer).

- [ ] **Step 8: Commit**

```bash
git add ui/app/components/CheckDetailModal.tsx
git commit -m "Add sibling sidebar, arrow-key nav, OPEN IN footer, hardcoded notice to modal"
```

---

## Task 11: `NextMovesBand.tsx` — recommendation band

**Files:**
- Create: `ui/app/components/NextMovesBand.tsx`

**Interfaces:**
- Consumes: `LevelRecord`, `LevelId`, `getTopMoves` from `./checkStatus` (Task 4); `HardcodedBadge` (Task 5).
- Produces: `<NextMovesBand levelRecords={LevelRecord[]} onCheckOpen={(level, key, value) => void} />` — consumed by Task 12 (`ScorecardsPage.tsx`). Renders nothing (`null`) when there are no failing/warning checks (spec §6).

- [ ] **Step 1: Write the component**

```tsx
// ui/app/components/NextMovesBand.tsx
import React from "react";
import { getTopMoves } from "./checkStatus";
import type { LevelRecord } from "./checkStatus";
import { HardcodedBadge } from "./HardcodedBadge";

interface Props {
  levelRecords: LevelRecord[];
  onCheckOpen: (level: LevelRecord["level"], key: string, value: string) => void;
}

const EFFORT_COLOR: Record<string, string> = { Low: "#49C2B3", Medium: "#E8A33D", High: "#DC3545" };

export const NextMovesBand = ({ levelRecords, onCheckOpen }: Props) => {
  const moves = getTopMoves(levelRecords, 4);
  if (moves.length === 0) return null;

  return (
    <div
      style={{
        background: "var(--band, #141C31)",
        borderRadius: 12,
        display: "flex",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: 212,
          flexShrink: 0,
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          background: "linear-gradient(180deg, rgba(94,40,229,.22), rgba(20,28,49,0))",
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.1, color: "rgba(255,255,255,.45)" }}>
          PATH TO L5
        </span>
        <span style={{ fontSize: 19, fontWeight: 600, color: "#fff", lineHeight: 1.15 }}>
          Next {moves.length} move{moves.length === 1 ? "" : "s"}
        </span>
        <span style={{ fontSize: 11.5, lineHeight: 1.5, color: "rgba(255,255,255,.5)" }}>
          Ranked by level, foundational checks first.
        </span>
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "grid",
          gridTemplateColumns: `repeat(${moves.length}, 1fr)`,
          gap: 10,
          padding: "14px 12px",
        }}
      >
        {moves.map((m) => (
          <div
            key={m.check.key}
            onClick={() => onCheckOpen(m.check.level, m.check.key, m.check.value)}
            style={{
              background: "rgba(255,255,255,.055)",
              border: "1px solid rgba(255,255,255,.10)",
              borderRadius: 10,
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 7,
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span
                style={{
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: "#fff",
                  lineHeight: 1.25,
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {m.title}
              </span>
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  color: "rgba(255,255,255,.6)",
                  border: "1px solid rgba(255,255,255,.25)",
                  borderRadius: 4,
                  padding: "2px 6px",
                  flexShrink: 0,
                }}
              >
                {m.levelTag}
              </span>
            </div>
            {m.hardcoded && <HardcodedBadge size="chip" />}
            <span
              style={{
                fontSize: 11.5,
                lineHeight: 1.5,
                color: "rgba(255,255,255,.62)",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
              }}
            >
              {m.body}
            </span>
            <div
              style={{
                marginTop: "auto",
                display: "flex",
                alignItems: "center",
                gap: 14,
                paddingTop: 7,
                borderTop: "1px solid rgba(255,255,255,.09)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5, color: "rgba(255,255,255,.35)" }}>
                  IMPACT
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#49C2B3" }}>{m.impact}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5, color: "rgba(255,255,255,.35)" }}>
                  EFFORT
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: EFFORT_COLOR[m.effort] }}>{m.effort}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5, color: "rgba(255,255,255,.35)" }}>
                  OWNER
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,.8)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {m.owner}
                </span>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,.45)", flexShrink: 0 }}>
                open ↗
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: succeeds (this component isn't rendered anywhere yet, but it doesn't break anything either since nothing imports it).

- [ ] **Step 3: Manual check**

Not wired into a page yet — exercised end-to-end in Task 12. Skip standalone verification.

- [ ] **Step 4: Commit**

```bash
git add ui/app/components/NextMovesBand.tsx
git commit -m "Add NextMovesBand: ranked recommendation band"
```

---

## Task 12: Wire it all together in `ScorecardsPage.tsx`, delete `OverallScore.tsx`

This is the integration task where everything becomes visible and testable end-to-end. `ScorecardsPage.tsx` moves from "each child fetches its own data" to fetching all 5 level queries itself once (see the architecture note before Task 8) and owns the shared `mode` and `openCheck` state.

**Files:**
- Modify: `ui/app/pages/ScorecardsPage.tsx` (imports at lines 1-7; new hooks/state inserted right before the `return` statement, currently line 686; the `return` statement itself, lines 686-709 — the `l1Query`..`l5Query` consts and `runbooksLiveOverride`, lines 17-685, are **not touched**, they're unchanged DQL)
- Delete: `ui/app/components/OverallScore.tsx` (no longer imported anywhere once this task lands — confirmed via `grep -rln "OverallScore"` that `ScorecardsPage.tsx` was its only consumer besides itself)

**Interfaces:**
- Consumes: everything from Tasks 3-11 (`checkStatus.ts`, `AppIdentityBar`, `MaturitySpine`, `ScorecardCard`, `CheckDetailModal`, `NextMovesBand`).
- Produces: the finished `/scorecards` page. Nothing downstream depends on this task.

- [ ] **Step 1: Replace the imports**

Find (lines 1-7):

```tsx
import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading } from "@dynatrace/strato-components/typography";
import { ScorecardCard } from "../components/ScorecardCard";
import { OverallScore } from "../components/OverallScore";
import { AppContextBanner } from "../components/AppContextBanner";
import { LiveCheckOverride } from "../hooks/useLiveCheckOverride";
```

Replace with:

```tsx
import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading } from "@dynatrace/strato-components/typography";
import { ScorecardCard } from "../components/ScorecardCard";
import { MaturitySpine } from "../components/MaturitySpine";
import { AppIdentityBar } from "../components/AppIdentityBar";
import { NextMovesBand } from "../components/NextMovesBand";
import { CheckDetailModal } from "../components/CheckDetailModal";
import { useDqlWithCache } from "../hooks/useDqlWithCache";
import { useLiveCheckOverride, LiveCheckOverride } from "../hooks/useLiveCheckOverride";
import { LevelId, LevelRecord } from "../components/checkStatus";
```

- [ ] **Step 2: Replace everything from the end of `l5Query` through the end of the file**

Find (the end of the `l5Query` template literal through the file's final `};`):

```tsx
    \`5. AI Postmortem / PTASK in ARD\``;

  return (
    <Flex flexDirection="column" gap={20} padding={16}>
      <Heading level={3}>SRE Maturity Level Scorecards</Heading>

      <AppContextBanner appCI={appCI} />

      <OverallScore appCI={appCI} queries={[
        { label: "L1 Observability", query: l1Query, color: "#3BACF0" },
        { label: "L2 Reliability", query: l2Query, color: "#1966FF" },
        { label: "L3 AI Ops", query: l3Query, color: "#5E28E5", liveOverride: runbooksLiveOverride },
        { label: "L4 Proactive", query: l4Query, color: "#8D1CDC" },
        { label: "L5 Autonomous", query: l5Query, color: "#49C2B3" },
      ]} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, alignItems: "stretch" }}>
        <ScorecardCard title="L1 — Full Observability" query={l1Query} accentColor="#3BACF0" appCI={appCI} />
        <ScorecardCard title="L2 — Measured Reliability" query={l2Query} accentColor="#1966FF" appCI={appCI} />
        <ScorecardCard title="L3 — AI-Assisted Operations" query={l3Query} accentColor="#5E28E5" appCI={appCI} liveOverride={runbooksLiveOverride} />
        <ScorecardCard title="L4 — Proactive Reliability" query={l4Query} accentColor="#8D1CDC" appCI={appCI} />
        <ScorecardCard title="L5 — Autonomous Reliability" query={l5Query} accentColor="#49C2B3" appCI={appCI} />
      </div>
    </Flex>
  );
};
```

Replace with:

```tsx
    \`5. AI Postmortem / PTASK in ARD\``;

  const levelConfigs: { level: LevelId; label: string; query: string; color: string; liveOverride?: LiveCheckOverride }[] = [
    { level: "L1", label: "L1 — Full Observability", query: l1Query, color: "#3BACF0" },
    { level: "L2", label: "L2 — Measured Reliability", query: l2Query, color: "#1966FF" },
    { level: "L3", label: "L3 — AI-Assisted Operations", query: l3Query, color: "#5E28E5", liveOverride: runbooksLiveOverride },
    { level: "L4", label: "L4 — Proactive Reliability", query: l4Query, color: "#8D1CDC" },
    { level: "L5", label: "L5 — Autonomous Reliability", query: l5Query, color: "#49C2B3" },
  ];

  // levelConfigs is a fixed-length, fixed-order array (never conditional on
  // props), so calling hooks inside this .map() keeps the same number of
  // hook calls in the same order on every render — the same pattern the
  // OverallScore.tsx component this replaces already used.
  const results = levelConfigs.map((lc) => {
    const { data, isLoading, isRefreshing, error } = useDqlWithCache({ query: lc.query });
    const { apply } = useLiveCheckOverride(appCI, lc.liveOverride);
    return { ...lc, data, isLoading, isRefreshing, error, apply };
  });

  const levelRecords: LevelRecord[] = results.map((r) => {
    const rawRecord = (r.data?.records as Record<string, unknown>[] | undefined)?.[0];
    const record = rawRecord ? r.apply(rawRecord) : {};
    return { level: r.level, record };
  });

  const anyFirstLoad = results.some((r) => r.isLoading);
  const anyRefreshing = results.some((r) => r.isRefreshing);

  const [mode, setMode] = React.useState<"engineer" | "executive">("engineer");
  const [openCheck, setOpenCheck] = React.useState<{ level: LevelId; key: string; value: string } | null>(null);

  const handleCheckOpen = (level: LevelId, key: string, value: string) => setOpenCheck({ level, key, value });

  const openLevelRecord = openCheck ? levelRecords.find((lr) => lr.level === openCheck.level) : undefined;
  const siblings = openLevelRecord
    ? Object.keys(openLevelRecord.record)
        .filter((k) => !k.toLowerCase().includes("score"))
        .map((k) => ({ key: k, value: String(openLevelRecord.record[k]) }))
    : [];

  return (
    <Flex flexDirection="column" gap={20} padding={16}>
      <Heading level={3}>SRE Maturity Level Scorecards</Heading>

      <AppIdentityBar appCI={appCI} />

      <MaturitySpine
        levelRecords={levelRecords}
        isLoading={anyFirstLoad}
        isRefreshing={anyRefreshing}
        mode={mode}
        onModeChange={setMode}
        onCheckOpen={handleCheckOpen}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, alignItems: "stretch" }}>
        {results.map((r) => {
          const lr = levelRecords.find((l) => l.level === r.level)!;
          return (
            <ScorecardCard
              key={r.level}
              level={r.level}
              title={r.label}
              accentColor={r.color}
              record={r.isLoading ? undefined : lr.record}
              isLoading={r.isLoading}
              isRefreshing={r.isRefreshing}
              error={r.error}
              mode={mode}
              onCheckOpen={handleCheckOpen}
            />
          );
        })}
      </div>

      <NextMovesBand levelRecords={levelRecords} onCheckOpen={handleCheckOpen} />

      {openCheck && (
        <CheckDetailModal
          checkKey={openCheck.key}
          currentValue={openCheck.value}
          appCI={appCI}
          accentColor={results.find((r) => r.level === openCheck.level)!.color}
          onClose={() => setOpenCheck(null)}
          siblings={siblings}
          onNavigate={(key, value) => setOpenCheck({ level: openCheck.level, key, value })}
        />
      )}
    </Flex>
  );
};
```

- [ ] **Step 3: Delete `OverallScore.tsx`**

```bash
rm ui/app/components/OverallScore.tsx
```

- [ ] **Step 4: Confirm nothing else references it**

Run: `grep -rln "OverallScore" ui/app`
Expected: no output (the file is gone and nothing imports it).

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: succeeds with no errors. If it doesn't, the error will point at exactly one of: a prop mismatch on `ScorecardCard`/`MaturitySpine`/`CheckDetailModal` (check Tasks 8-10's exact prop names against what's passed here), or a missing/renamed export from `checkStatus.ts` (Task 4).

- [ ] **Step 6: Manual check — this is where the whole redesign becomes visible for the first time**

Run: `npm run start` (or deploy to `ual` per existing project practice — see `[[always-deploy-at-end-of-turn]]` convention). Navigate to `/scorecards` and walk through:
1. Top nav has no "Golden Signals" tab; `/golden-signals` still loads directly (Task 1).
2. App identity bar shows a single row (Task 7); `Home.tsx` still shows the old 2-row `AppContextBanner` unchanged.
3. Hero banner defaults to Engineer mode; clicking the mode toggle switches to Executive (donut + heatmap) and back (Task 8).
4. Hovering any check cell in the hero banner or any row in the card grid shows the popover (Task 6); clicking either opens the same modal.
5. In the modal: the left sidebar lists sibling checks in that level, clicking one navigates without closing the modal, `←`/`→` do the same, `Esc` closes it, and any check with an `openIn` entry (Task 3) shows working links in the footer (Task 10).
6. The 4 hardcoded checks (L4 "Predictive Forecasting", L4 "Error Budget Gating", L5 "E2E Remediation Automated", L5 "AI Postmortem / PTASK in ARD") show the "Not yet live" badge everywhere they appear — heatmap cell, card row, hover popover, modal status banner, and (if ranked into it) the recommendation band. No other check shows this badge.
7. The recommendation band appears below the card grid (for an app with failing checks) with up to 4 ranked moves, each showing impact/effort/owner; pick an AppCI with zero failing checks (if one exists in this tenant) to confirm the band renders nothing rather than an empty shell.
8. Switch to Executive mode in the card grid and confirm the "Quick wins"/"Platform gaps" split appears per level.
9. Toggle dark mode (`ThemeToggle.tsx`) and confirm the new `--page`/`--card`/`--ink`/`--lv1..5` etc. variables (Task 2) render sensibly in both themes.
10. Visit `Home.tsx` and `MaturityLeaderboard.tsx`/`PortfolioPage.tsx` and confirm they look exactly as they did before this whole plan started (they use `AppContextBanner.tsx` and the `--sre-*` variables, both untouched).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Wire Scorecards redesign together: fetch once in ScorecardsPage, shared modal/mode state, remove OverallScore.tsx"
```
