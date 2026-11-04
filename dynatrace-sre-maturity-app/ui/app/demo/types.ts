export type DemoRecord = Record<string, unknown>;

/** Mirrors the subset of a Grail QueryResult the UI consumes. */
export interface DemoResult {
  records: DemoRecord[];
  /** Column types — required only where the UI calls convertToTimeseries(). */
  types?: unknown[];
}

export interface DemoFixture {
  /** Human-readable id, for debugging unmatched/mismatched queries. */
  id: string;
  /** Regex tested against the full DQL string, or a predicate. */
  match: RegExp | ((query: string) => boolean);
  respond: (query: string) => DemoResult;
}

export interface DemoFunctionFixture {
  /** App function name, e.g. "getRunbookDetail". */
  name: string;
  respond: (data: Record<string, unknown> | undefined) => unknown;
}
