# Data Readiness: the "get well plan" backbone

Status: proposed (not built). Author: drafted with Claude Code, 2026-10-22. Builds on
`2026-10-21-appci-resolver-design.md`.

## Motivation

The app scores 30 checks across five levels. Each check reads some input (a tag, a lookup, an event stream, a
naming convention) and fails when the input is missing. That makes a low score ambiguous: it can mean the
practice is weak, or only that this tenant does not provide the input the check was written against.

Pointing the app at the customer proved this. Before the AppCI resolver, L1–L4 returned nothing. After it, the
remaining failures were almost all missing inputs, not weak SRE. We found that by hand, check by check, running
about a dozen read-only queries across two tenants. This spec turns that audit into a feature, so that:

1. **Discover**: at any customer, show in minutes what exists and what does not, with evidence.
2. **Ingest**: take in what the customer supplies later (a critical-services list, a CMDB export, naming
   conventions) and show what it unlocks.
3. **Guide**: for each gap, say what to do, who does it, how hard it is, and how to confirm it worked.

The intended use is a customer "get well plan": a ranked, evidence-backed list of fixes that moves their scores
for the right reasons.

### What the hand audit found (prod unless noted; 2026-10-21/22)

| Input the check reads | Customer prod | Checks it blocks |
|---|---|---|
| Log attribute `applicationci` | 0 of 32,774 sampled logs | L1-3 |
| `ApplicationCI` tag on cloud resources | 0 of 130,546 Azure nodes | L1-6 (scores a constant pass today) |
| Kubernetes cluster named `<code>-…` | clusters named for sites (`site-a-prd-dmz`) | L1-5 |
| `CUSTOM_DEPLOYMENT` events with `application_ci` | 0 in 30 days | L3-2, L3-7, L4-4 |
| SDLC `validation` events (SRG) | 0 in 30 days | L4-4 |
| Workflow titled `<code> Production Dynatrace Alerts` | none (one shared ServiceNow workflow, 4,116 runs) | L3-3 |
| CMDB import events (`workflow.import.servicenow.appci`) | no `workflow.*` bizevents at all | L2-5 (now fillable from the CMDB table) |
| SLO / Guardian / dashboard / runbook naming | not measurable with the tools used (nonprod SLO names have no code prefix) | L2-2, L2-3, L2-4, L3-4, L4-1 |
| Critical-services seed | CMDB-style names, which never resolve | L2-6 |
| Problems on a non-default alerting profile | 2,561 of 2,699 (95%) | (L5-4 passes) |

## Goals and non-goals

Goals: measure each input live with read-only queries; map every check to the inputs it needs; say which
checks are blocked by which input; attach remediation steps; keep it reusable at the next customer; track
readiness over time.

Non-goals: changing tenant configuration (the app only reads, as the Coverage page already promises);
deciding what is "critical" for a customer; replacing the scorecards; scoring people or teams.

## Concepts

- **Input**: a prerequisite of one or more checks. Has an id, a name, a description in customer-neutral terms.
- **Probe**: a read-only measurement of an input, returning a count, a total, and example values. Aggregates only,
  so no log lines, entity names beyond examples, or personal data leave the tenant.
- **Dependency**: `check → inputs[]`. The registry is data, so a gap can be traced both ways: "what blocks this
  check" and "what does fixing this input unlock".
- **Status**: `Ready`, `Partial`, `Missing`, `Not applicable`, `Unknown` (probe failed or lacks permission).
  `Unknown` is distinct from `Missing`: never report absence from a probe that did not run.
- **Play**: remediation guidance for an input: ordered steps, owner role, effort, how to verify (re-run the
  probe), and links. Generic by default; tenant-specific values (application names, counts) are filled in from
  probe results.

## The inputs

Derived from the 30 checks (`checkDetailConfigs.ts`). Four checks (L4-3 Predictive Forecasting, L4-5 Error
Budget Gating, L5-3 E2E Remediation, L5-5 AI Postmortem) are marked "not yet live" in the app and have no input
yet; the page lists them as "not implemented" rather than as failures.

| Id | Input | Probe (read-only) | Checks |
|---|---|---|---|
| IN-01 | AppCI resolution (tags + AppCI map) | share of services, hosts, RUM apps and synthetic tests that resolve; unmapped names (the Coverage queries) | foundation of L1-1/2/4/7, L2-1, L3-1/5/6, L4-*, L5-4 |
| IN-02 | CMDB table with tier | rows; share with a non-blank `business_criticality` | L2-5 |
| IN-03 | AppCI map | exists; rows; rows pointing outside the CMDB | IN-01 |
| IN-04 | Log attribution | sampled logs carrying `applicationci`; or resolvable through host/service | L1-3 |
| IN-05 | Kubernetes attribution | clusters whose name starts with a known AppCI vs workload tags | L1-5 |
| IN-06 | Cloud attribution | cloud nodes with `ApplicationCI` | L1-6, L4-2 |
| IN-07 | RUM / synthetic tagging | active RUM apps and synthetic tests that resolve | L1-7 |
| IN-08 | SLO convention | SLOs whose name prefix or tags resolve to an AppCI (needs `slo:slos:read`) | L2-2, L4-1 |
| IN-09 | Guardians tagged | Guardians whose tags resolve (settings API, already used) | L2-3, L4-4 |
| IN-10 | SLO dashboards named | dashboards matching the convention (documents API, already used) | L2-4 |
| IN-11 | Runbook notebooks | notebooks matching the convention (documents API) | L3-4 |
| IN-12 | Critical-services seed | rows; share resolved to an entity | L2-6 |
| IN-13 | Deployment events | `CUSTOM_DEPLOYMENT` count; share with `application_ci` | L3-2, L3-7, L4-4 |
| IN-14 | SRG validation events | SDLC `validation` count | L4-4 |
| IN-15 | Alert routing | workflows matching `<code> Production Dynatrace Alerts`; alternatively any workflow with a ServiceNow action | L3-3 |
| IN-16 | Automation naming | Automation workflows that resolve to an AppCI (title or map) | L5-1, L5-2 |
| IN-17 | Alerting profiles | problems on a non-default profile | L5-4 |
| IN-18 | Davis problems present | problems in the window | L3-1/5/6 |

The first five rows of the audit table above reproduce from these probes with no manual work.

## What the page shows

A new **Readiness** tab.

1. **Summary strip**: inputs by status, and checks "blocked by a missing input" out of 30. Sorted by
   *checks unlocked*, because one fix often clears several checks (deployment events alone unblock L3-2, L3-7
   and part of L4-4). A per-check list hides that; this view is the point.
2. **Input table**: status, evidence (`0 of 32,774`), checks blocked, effort, owner. Click opens the drawer.
3. **Drawer**: the probe result with examples, the Play (steps, owner, effort, verify), and the checks it feeds,
   each linking to the scorecard.
4. **Per application** (optional second view): the same inputs for one AppCI, so a team sees their own gaps.
5. **Export**: Markdown and CSV of the table and plays, for a customer meeting. No tenant data beyond what is on
   the page.

From a failing check in the scorecard modal, a "Why is this failing?" link opens the matching input.

## Status model and scoring

A check whose required input is `Missing` currently scores as a failure, which is unfair to the customer and
hides the real cause. Options:

1. Leave scoring alone; only add the Readiness page (lowest risk).
2. Exclude blocked checks from the denominator ("measurable score").
3. Show both: the current score, and "X of Y measurable, Z blocked by missing inputs".

**Recommended: 3**, added after the page exists. Hiding a gap by removing it from the denominator is how a
scoreboard starts to lie; showing both keeps the unfavorable number visible and explains it. This is a
decision for the project owner, not an implementation detail, and it changes what the leaderboard means.

## Remediation content

A `Play` is data: `{ inputId, title, steps[], owner, effort, verify, links[] }`. Written neutral (no customer
names), with placeholders filled from the probe. Examples to write first, because they unblock the most:

- **Deployment events** (IN-13): emit a `CUSTOM_DEPLOYMENT` event from the pipeline with the AppCI as
  `application_ci`; owner: platform/CI team; verify: probe count rises.
- **Log attribution** (IN-04): derive `applicationci` at ingest (an OpenPipeline processor from host or
  Kubernetes metadata) rather than at every source; owner: platform team.
- **SLO convention** (IN-08): name SLOs with the AppCI prefix or tag them; the app reads the prefix today.
- **CMDB tier** (IN-02): fill `business_criticality` in the CMDB table; or load it from a ServiceNow export.
- **AppCI map** (IN-03): add the spellings Coverage lists; one row per spelling.

The existing per-check `guidance` strings (31 of them, written for the original tenant) are the starting
material; they should be rewritten against the inputs, not copied.

## Architecture

- A typed registry in `ui/app/readiness/` holding `inputs`, `plays` and `checkRequirements`. A repo script fails
  if any check in `checkDetailConfigs.ts` has no requirements entry, the same drift guard as `check:workflows`.
- DQL probes run in the browser through `useDql` with `useDqlWithCache`, each isolated so one failure shows
  `Unknown` for that input only. Sampling and short windows bound cost (the logs probe uses `samplingRatio`).
- Non-DQL inputs (SLOs, Guardians, dashboards, notebooks) reuse the existing app functions
  (`getSloDetail`, `getGuardianDetail`, `getDashboardDetail`, `getRunbookDetail`) and the scopes already
  declared; one new function aggregates them for the page.
- Probe results are aggregates; nothing is stored by the page.
- **History**: the daily snapshot already stores scores. A second generated workflow (or an extra task) writes one
  `workflow.summary.sre_readiness` bizevent per input per day (estate level, not per app), so the customer can
  show progress. It would use the existing generator and shared module.

## Phasing

| Phase | Delivers | Needs |
|---|---|---|
| P0 | Registry, DQL-only probes (IN-01–07, 12–14, 16–18), summary and table, drawer without plays | none |
| P1 | Non-DQL probes (IN-08–11, 15) through one function | none beyond existing scopes |
| P2 | Plays for the top inputs, export, links from failing checks | content review with the customer |
| P3 | Readiness snapshot workflow and trend | a workflow deploy per tenant |
| P4 | "Not measurable" display (option 3) | owner decision |

P0 reproduces the hand audit and is the minimum worth shipping.

## Risks and open questions

- **Probes can mislead.** A probe that checks the wrong place reports a false gap (the synthetic-test spelling
  was the example: the input existed but under another spelling). Each input shows its evidence and its
  "what we looked at", so a person can overrule it.
- **Cost at scale.** Several probes scan large tables (logs, events, problems). Use sampling and short windows,
  cache results, and show timing; test on a large tenant before P1.
- **Naming conventions are the customer's to set.** Several inputs (SLOs, dashboards, notebooks, workflows) are
  naming conventions of the original tenant. The app should say what it reads; changing the convention to fit
  a customer is a product decision.
- **Four checks are not implemented.** The page must not present them as customer gaps.
- **Which prod objects exist is unverified** for SLOs, Guardians, dashboards and runbooks; the hand audit could
  not query them. P1 settles that.
- **Does the customer want the score to change?** See the scoring options above.

## Success criteria

- At a new customer, the full audit reproduces in minutes without writing a query.
- Every failing check traces to a named input, or to a real gap in practice.
- Fixing an input, then re-running its probe, shows `Ready` and the unlocked checks turn from blocked to scored.
- The exported plan stands on its own in a meeting with the customer.

## Testing

Probes validated against two tenants with known answers (nonprod and prod here). The registry drift script runs
in CI. UI states (`Ready`, `Partial`, `Missing`, `Unknown`) get a render check each, and a probe forced to fail
must show `Unknown`, never `Missing`.
