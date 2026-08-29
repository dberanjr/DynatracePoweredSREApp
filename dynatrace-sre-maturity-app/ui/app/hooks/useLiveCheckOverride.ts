import { useAppFunction } from "@dynatrace-sdk/react-hooks";

export interface LiveCheckOverride {
  checkKey: string; // e.g. "4. Runbooks Linked" — must match a field the DQL query emits
  scoreKey: string; // e.g. "L3 Score" — the "X / Y" field on the same record
  appFunctionName: string; // e.g. "getRunbookDetail"
  toStatus: (result: unknown) => string; // "pass ..." | "fail ..." | "n/a ..."
}

function parseScore(scoreStr: string): { current: number; total: number } {
  const match = String(scoreStr).match(/(\d+)\s*\/\s*(\d+)/);
  if (match) return { current: parseInt(match[1], 10), total: parseInt(match[2], 10) };
  return { current: 0, total: 0 };
}

// Some checks (Runbooks Linked) can't be computed in DQL — the Documents API
// they read has no Grail equivalent. This applies their live app-function
// result on top of an already-fetched scorecard record, overriding the check's
// display string and adjusting the level's "X / Y" score.
//
// The DQL-side baseline (ScorecardsPage.tsx's lNQuery) must NOT count the
// overridden check in its own passCount — this only ever adds, never
// subtracts, so a baseline that already counted it would double-count.
//
// Called from both ScorecardCard (the per-level card) and OverallScore (the
// aggregate ring) so the two never disagree about a live-overridden check.
export function useLiveCheckOverride(appCI: string, override?: LiveCheckOverride) {
  const fnResult = useAppFunction<unknown>(
    { name: override?.appFunctionName ?? "__unused__", data: { appCI } },
    { autoFetch: !!override, autoFetchOnUpdate: true }
  );

  const apply = (record: Record<string, unknown>): Record<string, unknown> => {
    if (!override || fnResult.data === undefined) return record;
    const newStatus = override.toStatus(fnResult.data);
    const newPass = newStatus.toLowerCase().startsWith("pass");
    const { current, total } = parseScore(String(record[override.scoreKey] ?? ""));
    return {
      ...record,
      [override.checkKey]: newStatus,
      [override.scoreKey]: `${current + (newPass ? 1 : 0)} / ${total}`,
    };
  };

  return { apply };
}
