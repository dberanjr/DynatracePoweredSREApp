# N/A-as-Success Scoring + L1-5 Kubernetes Health Redesign

## Motivation

Scorecard tier scores (e.g. "L1 — Full Observability: 6/7, 86%") currently
treat any check that resolves to `n/a` (technology not detected — e.g. no
Kubernetes clusters for an app) identically to a `fail`: it contributes 0 to
the numerator against a fixed denominator. This unfairly penalizes apps that
simply don't use a given technology. The fix: a genuine, data-driven `n/a`
should count as full credit toward the score, since the check is not
applicable rather than failing.

One check — L1-5 Kubernetes — needs richer treatment than a blanket "n/a =
credit" rule, because its `n/a` case (no k8s detected) should indeed count as
a pass, but its non-n/a case currently only ever has a `pass` outcome (no real
`fail` branch exists today). The intent is for Kubernetes to become a genuine
three-state check: pass when not applicable, pass when properly instrumented
and healthy, fail when k8s is present but something is wrong.

## Scope

**In scope — simple N/A-as-credit fix** (6 checks with a genuine, data-driven
n/a state today):
- L1-6 Cloud
- L2-6 Critical Services Tagged
- L3-5 Alert Noise Review
- L3-6 Problems with Root Cause
- L4-2 Dynamic Scaling / K8s Autoscaling
- L1-5 Kubernetes gets the richer redesign below instead of the simple fix.

**In scope — L1-5 Kubernetes richer redesign**: replace the current
pass/n-a-only check with a genuine pass/fail/n-a check as described below.

**Out of scope** (explicitly confirmed, left untouched):
- L3-4 Runbooks Linked — its only `n/a` state is a transient loading
  placeholder that always resolves to pass/fail once `getRunbookDetail`
  returns; not a real terminal n/a.
- L4-3 Predictive Forecasting, L4-5 Error Budget Gating, L5-3 E2E Remediation
  Automated, L5-5 AI Postmortem/PTASK in ARD — hardcoded to `fail` today by
  design (org-wide capability gaps, not per-app "tech not detected" cases);
  they stay red.
- Denominators (L1=7, L2=6, L3=7, L4=5, L5=5) do not change anywhere — N/A
  adds to the numerator, never shrinks the denominator.
- No visual/badge changes — an n/a check still renders its existing grey
  "N/A" pill per-row; only the aggregate score math changes. This finally
  makes the already-drafted (uncommitted) `MaturitySpine.tsx` caption
  ("N failing · N warning · N not applicable, counted as met") factually
  true — today it's aspirational text with no matching math.
- Not fixing the pre-existing inconsistency where `MaturityLeaderboard.tsx`
  and `sre-maturity-daily-snapshot.yaml` derive "does this app have k8s"
  (`k8sCount`) from `dt.entity.cloud_application` tags, while
  `ScorecardsPage.tsx` uses the more accurate cluster-name-prefix method (see
  code comment at `ScorecardsPage.tsx:97-100`). The new Kubernetes-health
  sub-queries are built independently of `k8sCount` in all three files, so
  this pre-existing mismatch doesn't affect correctness of the new logic —
  it's flagged here for awareness, not addressed.

## Architecture: no shared scoring engine (pre-existing constraint)

This app has no centralized scoring engine. Every check's pass/fail/n-a
condition and every numerator/denominator is computed inline in hand-written
DQL query strings, embedded as JS template literals, and — critically —
**duplicated in three independent places** that must be kept in sync by hand:

1. `ui/app/pages/ScorecardsPage.tsx` — live per-app scorecard (`l1Query` .. `l5Query`)
2. `ui/app/components/MaturityLeaderboard.tsx` — portfolio leaderboard (`BULK_L1_QUERY` .. `BULK_L5_QUERY`)
3. `workflows/sre-maturity-daily-snapshot.yaml` — daily trend snapshot (`QUERIES.l1` .. `QUERIES.l5`)

Every edit in this spec must be applied in all three places. This is a
pre-existing architectural weakness (not something this change introduces or
is fixing) — see the "Consequences" section for the practical impact.

## Part 1: Simple N/A-as-credit formula changes

For each of these 6 checks, the `passCount` term changes from "credit only on
an explicit pass" to "credit on pass OR on the genuine n/a condition." No new
queries — just widening an existing `if` condition. Applied identically in
all three files (field names match across files; verify field names in each
file since some copies use naming like `resolved`/`criticalCount` vs.
possibly-renamed local equivalents before editing).

| Check | Current passCount term | New passCount term |
|---|---|---|
| L1-6 Cloud | `if(cloudResources > 0, 1, else: 0)` | `1` (always credit — this check has no fail branch; it's pass-or-n/a only) |
| L2-6 Critical Services Tagged | `if(resolved > 0, 1, else: 0)` | `if(resolved > 0 or criticalCount == 0, 1, else: 0)` |
| L3-5 Alert Noise Review | `if(total7d > 0 and noisePct <= 50, 1, else: 0)` | `if(total7d == 0 or noisePct <= 50, 1, else: 0)` |
| L3-6 Problems with Root Cause | `if(causalTotal > 0 and rootCausePct >= 40, 1, else: 0)` | `if(causalTotal == 0 or rootCausePct >= 40, 1, else: 0)` |
| L4-2 Dynamic Scaling / K8s Autoscaling | `if(scaleTargets > 0, 1, else: 0)` | `if(scaleTargets > 0 or cloudTotal == 0, 1, else: 0)` |

Note L1-6 Cloud is the same "no fail branch" shape as Kubernetes today
(`ScorecardsPage.tsx:205-207`) — since it can only ever be pass or n/a, and
both now count, its passCount term collapses to an unconditional `1`.

Also update the stale comment at `ScorecardsPage.tsx:605-606` ("Only a
genuine pass scores. warn / n/a / fail all score 0...") since it's no longer
accurate for check #2 (Dynamic Scaling) after this change — reword to reflect
that #2's n/a case (no cloud footprint) now also credits, while #3 and #5
(the hardcoded-fail capability gaps) remain untouched and still score 0.

## Part 2: L1-5 Kubernetes — three-state health check

### New status logic

Replaces the current binary pass/n-a-only logic
(`ScorecardsPage.tsx:202-204` and its two mirrors):

```
if k8sClusters == 0:
    PASS — "N/A — no Kubernetes detected" (full credit; unchanged detection,
           same k8sClusters field each file already computes)
else if cloudNativeOperatorHealthy AND k8sScopedTracing > 0 AND k8sScopedLogs > 0:
    PASS — "<k8sClusters> cluster(s), cloud-native full-stack healthy"
else:
    FAIL — "<k8sClusters> cluster(s) detected, operator or signal issue"
```

`passCount` term:
```
if(k8sClusters == 0 or (cloudNativeOperatorHealthy > 0 and k8sScopedTracing > 0 and k8sScopedLogs > 0), 1, else: 0)
```

### New DQL sub-queries (3 new `lookup` blocks per file, alongside the existing "Signal 4: Kubernetes clusters" block)

**1. Cloud Native Full Stack operator health** — verified against the live
tenant (real workloads found: `<cluster>-oneagent` DaemonSets in the
`dynatrace` namespace, `app.kubernetes.io/component` label is either
`cloudnativefullstack` or `classicfullstack`; per your explicit choice, only
`cloudnativefullstack` counts as "properly instrumented"):

```dql
| lookup [
    smartscapeNodes K8S_DAEMONSET
    | filter matchesPhrase(k8s.workload.name, "oneagent") and not matchesPhrase(k8s.workload.name, "csi-driver")
    | fieldsAdd applicationci = lower(splitString(k8s.cluster.name, "-")[0])
    | parse k8s.object, "JSON:config"
    | fieldsAdd
        component = tags:k8s.labels[`app.kubernetes.io/component`],
        desired = toLong(config[status][desiredNumberScheduled]),
        ready = toLong(config[status][numberReady])
    | summarize
        cloudNativeOperatorHealthy = countIf(component == "cloudnativefullstack" and desired > 0 and ready == desired),
        by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{cloudNativeOperatorHealthy}
```

**2. K8s-scoped tracing** — verified live: `dt.service.request.count` carries
`k8s.cluster.name` as a groupable dimension with real non-zero data:

```dql
| lookup [
    timeseries reqs = sum(dt.service.request.count), by:{k8s.cluster.name}
    | fieldsAdd applicationci = lower(splitString(k8s.cluster.name, "-")[0]),
        total = arraySum(reqs)
    | summarize k8sScopedTracing = sum(total), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{k8sScopedTracing}
```

**3. K8s-scoped logs**:

```dql
| lookup [
    fetch logs, samplingRatio:1000
    | filter isNotNull(k8s.cluster.name)
    | fieldsAdd applicationci = lower(splitString(k8s.cluster.name, "-")[0])
    | summarize k8sScopedLogs = count(), by:{applicationci}
  ], sourceField:applicationci, lookupField:applicationci, fields:{k8sScopedLogs}
```

All three follow the exact existing lookup/join pattern already used by every
other signal in these queries (aggregate across the whole tenant by
`applicationci`, then join) — no new architectural pattern.

### Null-safety

Add to each file's existing "Null-safe defaults" `fieldsAdd` block:
```
cloudNativeOperatorHealthy = if(isNull(cloudNativeOperatorHealthy), 0, else: cloudNativeOperatorHealthy),
k8sScopedTracing = if(isNull(k8sScopedTracing), 0, else: k8sScopedTracing),
k8sScopedLogs = if(isNull(k8sScopedLogs), 0, else: k8sScopedLogs)
```

### Files to change for Part 2

Same three files as Part 1, mirroring the 3 new lookups + null-safe defaults
+ status/passCount formula changes in each:
1. `ui/app/pages/ScorecardsPage.tsx` (`l1Query`)
2. `ui/app/components/MaturityLeaderboard.tsx` (`BULK_L1_QUERY`)
3. `workflows/sre-maturity-daily-snapshot.yaml` (`QUERIES.l1`)

`MaturityLeaderboard.tsx` and the workflow only carry a numeric `l1Score`
(no per-check status string), so those two only need the 3 new lookups +
null-safe defaults + the `passCount`/`l1Score` term change — no status-string
change needed there (there is no status string to update).

Also update `checkExplanations.ts` / `checkDetailConfigs.ts` (the L1-5
"Kubernetes" entry's docs/snippet) to describe the new three-state pass
condition, so the in-app "how is this calculated" explanation stays accurate.

## Testing / Verification

No automated test suite exists in this codebase for DQL query logic. Verify by:
1. Running the new DQL directly via `execute-dql` against 3 known AppCIs before wiring into the app:
   - An app with zero Kubernetes clusters → expect pass/N/A.
   - An app whose cluster runs `cloudnativefullstack` with a fully-ready DaemonSet and live traces/logs → expect pass.
   - An app whose cluster runs `classicfullstack` (or has a degraded DaemonSet) → expect fail.
2. Load the running app (Scorecards page) for those same 3 AppCIs and visually confirm the L1-5 row and L1 tier score/percentage match expectations.
3. Confirm `MaturityLeaderboard.tsx` shows updated per-app L1 totals for the same AppCIs.
4. Confirm the `checkExplanations.ts`/`checkDetailConfigs.ts` doc text for L1-5 matches the new logic.

## Consequences

- **Daily snapshot workflow needs redeployment.** `workflows/sre-maturity-daily-snapshot.yaml` must be redeployed (not just the app) for the historical trend chart to reflect the new math going forward. Already-recorded historical days keep their old (lower) scores — the trend chart will show a step-jump on the day this ships. This is unavoidable given snapshots are stored per-day bizevents; no backfill is planned.
- **L1-6 Cloud and (previously) L1-5 Kubernetes become guaranteed points whenever inapplicable.** This is intentional per the approved design, but worth knowing: any app with zero cloud footprint now automatically gets full credit for L1-6, same as Kubernetes for apps without k8s.
