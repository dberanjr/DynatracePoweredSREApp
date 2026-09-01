import { useDql } from "@dynatrace-sdk/react-hooks";

export type ChainDirection = "forward" | "backward";

export interface DependencyNode {
  id: string;
  name: string;
  parentId: string;
  level: number;
  appCIs: string[];
  severity: string | null;
  businessImpact: string | null;
  problemRole: string | null; // "Root cause" | "Impacted" | null
  problemId: string | null;
  problemName: string | null;
  requestCount: number | null; // 1h request count — used as an edge-throughput proxy in Perf mode
  p95Us: number | null; // 1h p95 response time, microseconds — used for node sizing in Perf mode
}

export interface DependencyChainResult {
  levels: Record<number, DependencyNode[]>;
  perLevelCounts: Record<number, number>;
  totalLevels: number;
  capped: boolean;
  uniqueAppCIsAllLevels: string[];
  appCICounts: Record<string, number>;
  isLoading: boolean;
  hasError: boolean;
}

export const MAX_LEVELS = 8;
const SKIP_QUERY = "data record(skip = true) | limit 0";

// Active-problem join, reused from ServiceGoldenSignalsTable's pattern.
// Only appended for levels currently rendered (see includeProblems) — joining
// this into all 8 levels x 2 directions on every selection would add a full
// dt.davis.problems scan to queries the user hasn't asked to see yet.
const PROBLEM_JOIN = `
| lookup [
    fetch dt.davis.problems, from:now()-30d
    | filter event.status == "ACTIVE"
    | expand affected_entity_ids
    | fieldsAdd role = if(affected_entity_ids == root_cause_entity_id, "Root cause", else: "Impacted")
    | fieldsAdd roleRank = if(role == "Root cause", 0, else: 1)
    | sort roleRank asc
    | dedup affected_entity_ids
    | fields affected_entity_ids, role, problemName = event.name, problemId = event.id
  ], sourceField: depId, lookupField: affected_entity_ids, fields: {problemRole = role, problemName, problemId}`;

// Golden-signal join for Perf-mode sizing — same timeseries shape as
// ServiceGoldenSignalsTable. Note: this is per-NODE traffic (the target
// service's own total request volume), used as a proxy for "how heavily
// used is the path into this dependency" — not a true caller->callee
// edge-level metric, which isn't available as a simple dimensional lookup.
const METRICS_JOIN = `
| lookup [
    timeseries {
      req = sum(dt.service.request.count, rollup: sum, scalar:true),
      p95 = percentile(dt.service.request.response_time, 95, rollup: avg, scalar:true)
    }, by:{dt.entity.service}, from:now()-1h
  ], sourceField: depId, lookupField: dt.entity.service, fields: {reqCount = req, p95Us = p95}`;

// AppCI tags live on the classic dt.entity.service model, not on the
// smartscapeNodes "SERVICE" representation of the same entity (verified live —
// smartscapeNodes' tags field is empty for every service tested). Hence the
// hybrid: traverse topology via smartscapeNodes, then join each result back
// to dt.entity.service for its applicationci tag(s). A service can carry more
// than one applicationci tag (shared/platform services) — all are collected.
function buildLevelQuery(originId: string, direction: ChainDirection, hops: number, includeProblems: boolean): string {
  const traverseLine = `| traverse edgeTypes: {calls}, targetTypes: {SERVICE}, direction: ${direction}`;
  const traverses = Array(hops).fill(traverseLine).join("\n");
  // dt.traverse.history[hops-1] is the previous hop's target node — i.e. the
  // parent of this node in this specific traversal path. For the first hop
  // there is no history entry; the parent is simply the origin.
  const parentExpr = hops === 1 ? `"${originId}"` : `toString(dt.traverse.history[${hops - 1}][\`id\`])`;
  const extraFields = includeProblems ? ", problemRole, problemName, problemId" : "";

  return `smartscapeNodes "SERVICE"
| filter id == toSmartscapeId("${originId}")
${traverses}
| dedup id
| fieldsAdd depId = toString(id), depName = name, parentId = ${parentExpr}
| lookup [fetch dt.entity.service | fields id, tags],
    sourceField: depId, lookupField: id, fields: {lookupTags = tags}
| fieldsAdd appciList = arrayDistinct(arrayRemoveNulls(iCollectArray(
    if(matchesPhrase(lookupTags[], "applicationci:*"), splitString(lookupTags[], ":")[1])
  )))
| lookup [
    load "/lookups/critical_services"
    | filter entity_ids != "-"
    | fieldsAdd idList = splitString(entity_ids, " ")
    | expand idList
    | fields idList, severity, business_impact
  ], sourceField: depId, lookupField: idList, fields: {critSeverity = severity, critImpact = business_impact}${METRICS_JOIN}${includeProblems ? PROBLEM_JOIN : ""}
| fields depId, depName, parentId, appciList, critSeverity, critImpact, reqCount, p95Us${extraFields}
| limit 300`;
}

// Hooks must be called an unconditional, fixed number of times — the 8 level
// queries are unrolled explicitly (not looped) to satisfy react-hooks/rules-of-hooks.
// `levelsShown` scopes the (expensive) active-problem join to only the levels
// currently rendered — deeper, not-yet-revealed levels skip it until the user
// expands the slider that far.
export function useDependencyChain(originId: string | null, direction: ChainDirection, levelsShown: number): DependencyChainResult {
  const q = (hops: number) => (originId ? buildLevelQuery(originId, direction, hops, hops <= levelsShown) : SKIP_QUERY);

  const r1 = useDql({ query: q(1) });
  const r2 = useDql({ query: q(2) });
  const r3 = useDql({ query: q(3) });
  const r4 = useDql({ query: q(4) });
  const r5 = useDql({ query: q(5) });
  const r6 = useDql({ query: q(6) });
  const r7 = useDql({ query: q(7) });
  const r8 = useDql({ query: q(8) });
  const rawLevels = [r1, r2, r3, r4, r5, r6, r7, r8];

  const isLoading = originId != null && rawLevels.some((r) => r.isLoading);
  const hasError = rawLevels.some((r) => !!r.error);

  const levels: Record<number, DependencyNode[]> = {};
  const perLevelCounts: Record<number, number> = {};
  const seen = new Set<string>();
  const uniqueAppCIs = new Set<string>();
  const appCICounts: Record<string, number> = {};
  let totalLevels = 0;
  let capped = false;

  if (originId) {
    for (let i = 0; i < MAX_LEVELS; i++) {
      const levelNum = i + 1;
      const records = (rawLevels[i].data?.records || []) as Record<string, unknown>[];
      const newNodes: DependencyNode[] = [];
      for (const r of records) {
        const id = String(r.depId || "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const appCIs = (Array.isArray(r.appciList) ? (r.appciList as unknown[]) : []).map((a) => String(a).toLowerCase());
        appCIs.forEach((a) => {
          uniqueAppCIs.add(a);
          appCICounts[a] = (appCICounts[a] || 0) + 1;
        });
        newNodes.push({
          id,
          name: String(r.depName || id),
          parentId: String(r.parentId || originId),
          level: levelNum,
          appCIs,
          severity: r.critSeverity != null ? String(r.critSeverity) : null,
          businessImpact: r.critImpact != null ? String(r.critImpact) : null,
          problemRole: r.problemRole != null ? String(r.problemRole) : null,
          problemId: r.problemId != null ? String(r.problemId) : null,
          problemName: r.problemName != null ? String(r.problemName) : null,
          requestCount: r.reqCount != null ? Number(r.reqCount) : null,
          p95Us: r.p95Us != null ? Number(r.p95Us) : null,
        });
      }
      if (newNodes.length > 0) {
        levels[levelNum] = newNodes;
        perLevelCounts[levelNum] = newNodes.length;
        totalLevels = levelNum;
        if (levelNum === MAX_LEVELS) capped = true;
      }
    }
  }

  return {
    levels,
    perLevelCounts,
    totalLevels,
    capped,
    uniqueAppCIsAllLevels: Array.from(uniqueAppCIs).sort(),
    appCICounts,
    isLoading,
    hasError,
  };
}
