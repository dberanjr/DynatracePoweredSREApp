import type { DemoFixture } from "../types";
import { DEMO_APP_BY_CODE } from "../portfolio";
import { DEMO_SERVICE_BY_ID, DEMO_SERVICES, servicesForApp, upstreamIds } from "../services";
import type { DemoService } from "../services";

const quoted = (q: string, re: RegExp): string => re.exec(q)?.[1] ?? "";

interface ChainNode {
  svc: DemoService;
  parentId: string;
}

// BFS from origin; level = shortest hop distance (the UI de-dupes across levels
// anyway). Parent = BFS parent, mirroring dt.traverse.history semantics.
function chainLevels(originId: string, direction: "forward" | "backward"): Map<number, ChainNode[]> {
  const levels = new Map<number, ChainNode[]>();
  const seen = new Set<string>([originId]);
  let frontier = [originId];
  for (let hop = 1; hop <= 8 && frontier.length; hop++) {
    const next: string[] = [];
    for (const pid of frontier) {
      const nbrs = direction === "forward" ? DEMO_SERVICE_BY_ID[pid]?.callsIds ?? [] : upstreamIds(pid);
      for (const nid of nbrs) {
        if (seen.has(nid)) continue;
        seen.add(nid);
        next.push(nid);
        const arr = levels.get(hop) ?? [];
        arr.push({ svc: DEMO_SERVICE_BY_ID[nid], parentId: pid });
        levels.set(hop, arr);
      }
    }
    frontier = next;
  }
  return levels;
}

const directCounts = (id: string) => ({
  downstream: DEMO_SERVICE_BY_ID[id]?.callsIds.length ?? 0,
  upstream: upstreamIds(id).length,
});

export const dependenciesFixtures: DemoFixture[] = [
  // useDependencyChain: smartscapeNodes "SERVICE" traversal, level 1..8, forward/backward
  {
    id: "dependency-chain-level",
    match: /smartscapeNodes "SERVICE"[\s\S]*\| traverse edgeTypes/,
    respond: (q) => {
      const origin = quoted(q, /toSmartscapeId\("([^"]+)"\)/);
      const direction = /direction: backward/.test(q) ? "backward" : "forward";
      const hops = (q.match(/\| traverse edgeTypes/g) ?? []).length;
      const withProblems = /problemRole/.test(q.split("| fields depId")[1] ?? "");
      const nodes = chainLevels(origin, direction).get(hops) ?? [];
      return {
        records: nodes.map(({ svc, parentId }) => ({
          depId: svc.id,
          depName: svc.name,
          parentId,
          appciList: [svc.appCI],
          critSeverity: svc.severity,
          critImpact: svc.businessImpact,
          reqCount: svc.reqCount,
          p95Us: svc.p95Us,
          ...(withProblems && svc.problem
            ? {
                problemRole: svc.problem.role,
                problemName: svc.problem.problemName,
                problemId: svc.problem.problemId,
                problemDisplayId: svc.problem.problemDisplayId,
              }
            : {}),
        })),
      };
    },
  },

  // UpstreamDownstreamPage STATUS_QUERY
  {
    id: "dependency-appci-status",
    match: /lower\(applicationci\) == lower\("[^"]*"\)\s*\| fields operational_status/,
    respond: (q) => {
      const code = quoted(q, /lower\("([^"]*)"\)/).toUpperCase();
      const app = DEMO_APP_BY_CODE[code];
      return { records: [{ operational_status: app ? app.status : "In Production" }] };
    },
  },

  // UpstreamDownstreamPage SUMMARY_QUERY
  {
    id: "dependency-service-summary",
    match: /activeProblems = countIf\(hasProblem\)/,
    respond: (q) => {
      const code = quoted(q, /lower\("([^"]*)"\)/);
      const svcs = servicesForApp(code);
      const sev = (s: DemoService) => (s.severity ?? "").toLowerCase();
      return {
        records: [
          {
            total: svcs.length,
            high: svcs.filter((s) => sev(s) === "high").length,
            medium: svcs.filter((s) => sev(s).startsWith("med")).length,
            low: svcs.filter((s) => sev(s) === "low").length,
            activeProblems: svcs.filter((s) => s.problem).length,
          },
        ],
      };
    },
  },

  // ROOT_PROBLEM_QUERY (selected service's own active problem)
  {
    id: "dependency-root-problem",
    match: /filter affected_entity_ids == "[^"]+"[\s\S]*\| fields role, problemId = event\.id/,
    respond: (q) => {
      const p = DEMO_SERVICE_BY_ID[quoted(q, /affected_entity_ids == "([^"]+)"/)]?.problem;
      return { records: p ? [{ role: p.role, problemId: p.problemId, problemDisplayId: p.problemDisplayId }] : [] };
    },
  },

  // ROOT_METRICS_QUERY (selected service's request count / p95)
  {
    id: "dependency-root-metrics",
    match: /filter dt\.entity\.service == "[^"]+"\s*\| fields reqCount = req, p95Us = p95/,
    respond: (q) => {
      const s = DEMO_SERVICE_BY_ID[quoted(q, /dt\.entity\.service == "([^"]+)"/)];
      return { records: s ? [{ reqCount: s.reqCount, p95Us: s.p95Us }] : [] };
    },
  },

  // SmartscapeViewMenu DIRECT_DEP_COUNT_QUERY
  {
    id: "dependency-direct-counts",
    match: /fetch dt\.entity\.service\s*\| filter id == "[^"]+"[\s\S]*\| fields downstream, upstream/,
    respond: (q) => ({ records: [directCounts(quoted(q, /filter id == "([^"]+)"/))] }),
  },
];

// Re-exported for convenience if other fixtures want the full list.
export const ALL_DEMO_SERVICES = DEMO_SERVICES;
