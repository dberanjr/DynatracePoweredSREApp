import { useMemo } from "react";
import { useDql as useSdkDql, useAppFunction as useSdkAppFunction } from "@dynatrace-sdk/react-hooks";
import { useDemoMode } from "../demo/demoMode";
import { resolveDemoDql, resolveDemoFunction } from "../demo/resolver";

import type { ResultRecord } from "@dynatrace-sdk/client-query";
import type { DqlQueryParams, UseDqlOptions, UseDqlResult } from "@dynatrace-sdk/react-hooks";

/**
 * Drop-in replacement for the SDK's useDql. In demo mode the real query is
 * disabled (no network call) and results come from the demo fixtures instead.
 */
export function useDql<T = ResultRecord>(
  params: string | DqlQueryParams,
  options?: UseDqlOptions<T>
): UseDqlResult<T> {
  const demo = useDemoMode();
  const real = useSdkDql<T>(params, demo ? { ...options, enabled: false } : options);
  const query = typeof params === "string" ? params : params.query;

  const demoResult = useMemo(() => {
    if (!demo) return undefined;
    const r = resolveDemoDql(query);
    const noop = async () => undefined;
    return {
      state: "SUCCEEDED",
      progress: 100,
      data: { records: r.records, types: r.types ?? [], metadata: {} },
      error: null,
      isError: false,
      isSuccess: true,
      isLoading: false,
      isPending: false,
      cancel: noop,
      refetch: noop,
    } as unknown as UseDqlResult<T>;
  }, [demo, query]);

  return demoResult ?? real;
}

type SdkFnParams = Parameters<typeof useSdkAppFunction>[0];
type SdkFnOptions = Parameters<typeof useSdkAppFunction>[1];

/**
 * Drop-in replacement for the SDK's useAppFunction. In demo mode the backend
 * function is never invoked; fixtures answer instead.
 */
export function useAppFunction<T = unknown>(params: SdkFnParams, options?: SdkFnOptions) {
  const demo = useDemoMode();
  const real = useSdkAppFunction<T>(
    params,
    demo ? ({ ...(options ?? { autoFetch: true, autoFetchOnUpdate: true }), autoFetch: false, autoFetchOnUpdate: false } as SdkFnOptions) : options
  );
  const name = params.name;
  const dataKey = JSON.stringify(params.data ?? null);
  const autoFetch = options?.autoFetch ?? true;

  const demoResult = useMemo(() => {
    if (!demo) return undefined;
    const data = name === "__unused__" || !autoFetch
      ? undefined
      : (resolveDemoFunction(name, params.data as Record<string, unknown> | undefined) as T | undefined);
    const noop = async () => data as T;
    return {
      data,
      error: undefined,
      isError: false,
      isLoading: false,
      isSuccess: data !== undefined,
      status: data !== undefined ? "success" : "idle",
      refetch: noop,
      cancel: () => undefined,
    } as unknown as typeof real;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, name, dataKey, autoFetch]);

  return demoResult ?? real;
}
