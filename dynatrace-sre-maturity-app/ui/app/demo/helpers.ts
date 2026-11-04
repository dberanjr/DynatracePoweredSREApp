import type { DemoRecord, DemoResult } from "./types";
import { seeded } from "./portfolio";

/** Rows only — for tables, KPIs, lists. */
export function rows(records: DemoRecord[]): DemoResult {
  return { records };
}

/**
 * Build a Grail-style timeseries record set (what `timeseries`/`makeTimeseries`
 * return) including the `types` array convertToTimeseries() needs.
 *
 * @param series  metric field name, e.g. "avg(dt.service.request.response_time)"
 * @param opts.points  number of buckets (default 48)
 * @param opts.stepMs  bucket width in ms (default 30 min)
 * @param opts.base / opts.variance  value = base ± variance (seeded, deterministic)
 * @param opts.dims   optional dimension values; one record per entry, e.g. [{service:"checkout"}]
 */
export function timeseries(
  series: string,
  opts: { seed: string; base: number; variance: number; points?: number; stepMs?: number; dims?: DemoRecord[]; spikeAt?: number }
): DemoResult {
  const points = opts.points ?? 48;
  const stepMs = opts.stepMs ?? 30 * 60 * 1000;
  const end = Math.floor(Date.now() / stepMs) * stepMs;
  const start = end - points * stepMs;
  const dimsList = opts.dims && opts.dims.length ? opts.dims : [{}];
  const records = dimsList.map((dim, di) => {
    const rnd = seeded(`${opts.seed}:${di}`);
    const values = Array.from({ length: points }, (_, i) => {
      let v = opts.base + (rnd() - 0.5) * 2 * opts.variance;
      if (opts.spikeAt !== undefined && Math.abs(i - opts.spikeAt) <= 1) v += opts.variance * 3;
      return Math.max(0, Number(v.toFixed(3)));
    });
    return {
      ...dim,
      timeframe: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
      interval: String(stepMs * 1_000_000),
      [series]: values,
    } as DemoRecord;
  });
  const mappings: Record<string, unknown> = {};
  for (const k of Object.keys(dimsList[0])) mappings[k] = { type: "string" };
  mappings.timeframe = { type: "timeframe" };
  mappings.interval = { type: "duration" };
  mappings[series] = { type: "array", types: [{ mappings: { element: { type: "double" } } }] };
  return { records, types: [{ mappings, indexRange: [0, records.length - 1] }] };
}
