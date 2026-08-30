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
