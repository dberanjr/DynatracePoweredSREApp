// Shared demo SERVICE model: every demo app owns a handful of services with
// stable ids, a call graph (intra-app + cross-app via DemoApp.calls), critical
// severity and a few active Davis problems. Used by the dependency fixtures and
// available to any other fixture that needs service rows (e.g. the golden-signals
// table) so ids/names/problems line up across pages.
import { DEMO_APPS, DEMO_APP_BY_CODE, seeded } from "./portfolio";

export interface DemoProblem {
  role: "Root cause" | "Impacted";
  problemId: string; // event.id (UUID)
  problemDisplayId: string; // P-XXXX
  problemName: string;
}

export interface DemoService {
  id: string; // SERVICE-XXXXXXXXXXXXXXXX
  name: string;
  appCI: string;
  index: number;
  severity: "High" | "Medium" | "Low" | null;
  businessImpact: string | null;
  callsIds: string[]; // downstream
  reqCount: number; // 1h request count
  failCount: number;
  p95Us: number;
  problem: DemoProblem | null;
}

const SUFFIXES = ["Frontend", "API", "Processor", "Data Access"];

function hex16(seed: string): string {
  const r = seeded("svc:" + seed);
  let out = "";
  for (let i = 0; i < 16; i++) out += Math.floor(r() * 16).toString(16).toUpperCase();
  return out;
}

const sid = (code: string, i: number) => "SERVICE-" + hex16(code + i);

function mkProblem(n: number, role: DemoProblem["role"], name: string): DemoProblem {
  const r = seeded("prob:" + n);
  const h = () => Math.floor(r() * 0xffff).toString(16).padStart(4, "0");
  return {
    role,
    problemName: name,
    problemDisplayId: `P-26${String(1100 + n * 7)}`,
    problemId: `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`,
  };
}

// code -> service index -> problem
const PROBLEMS: Record<string, Record<number, DemoProblem>> = {
  PAY: {
    2: mkProblem(1, "Root cause", "Response time degradation on Payments Gateway Processor"),
    1: mkProblem(1, "Impacted", "Response time degradation on Payments Gateway Processor"),
  },
  ADH: { 1: mkProblem(1, "Impacted", "Response time degradation on Payments Gateway Processor") },
  LED: { 1: mkProblem(2, "Root cause", "Failure rate increase on General Ledger API") },
};

const SEV_BY_TIER: Record<number, ("High" | "Medium" | "Low" | null)[]> = {
  1: ["High", "High", "Medium", "Low"],
  2: ["Medium", "Medium", "Low", null],
  3: ["Low", "Low", null, null],
  4: ["Low", null, null, null],
};

const IMPACT: Record<string, string> = { High: "Revenue impacting", Medium: "Customer facing", Low: "Internal" };

export const DEMO_SERVICES: DemoService[] = DEMO_APPS.flatMap((app) => {
  const ids = SUFFIXES.map((_, i) => sid(app.code, i));
  return SUFFIXES.map((suf, i) => {
    const r = seeded(`m:${app.code}:${i}`);
    const calls: string[] = [];
    if (i === 0) calls.push(ids[1]);
    if (i === 1) {
      calls.push(ids[2], ids[3]);
      for (const callee of app.calls) calls.push(sid(callee, 0));
    }
    if (i === 2) calls.push(ids[3]);
    const sev = SEV_BY_TIER[app.tier][i];
    const problem = PROBLEMS[app.code]?.[i] ?? null;
    const req = Math.round((i === 0 ? 120000 : 60000 / (i + 0.5)) * (0.4 + r()));
    return {
      id: ids[i],
      name: `${app.name} ${suf}`,
      appCI: app.code,
      index: i,
      severity: sev,
      businessImpact: sev ? IMPACT[sev] : null,
      callsIds: calls,
      reqCount: req,
      failCount: Math.round(req * (problem ? 0.04 + r() * 0.03 : r() * 0.004)),
      p95Us: Math.round((problem ? 650000 : 60000) + r() * (i + 1) * 120000),
      problem,
    };
  });
});

export const DEMO_SERVICE_BY_ID: Record<string, DemoService> = Object.fromEntries(DEMO_SERVICES.map((s) => [s.id, s]));

export function servicesForApp(code: string): DemoService[] {
  return DEMO_SERVICES.filter((s) => s.appCI.toLowerCase() === code.toLowerCase());
}

export function upstreamIds(id: string): string[] {
  return DEMO_SERVICES.filter((s) => s.callsIds.includes(id)).map((s) => s.id);
}

export { DEMO_APP_BY_CODE };
