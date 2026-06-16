import { useRef, useMemo } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";

/**
 * Wraps useDql to keep previous data visible while new data loads.
 * Returns `isRefreshing` (true when loading but has cached data)
 * and `isFirstLoad` (true only on the very first load with no cache).
 */
export function useDqlWithCache({ query }: { query: string }) {
  const result = useDql({ query });
  const cacheRef = useRef<{ records: unknown[] | null; types: unknown | null }>({
    records: null,
    types: null,
  });

  // Update cache when we get new data
  if (result.data?.records && result.data.records.length > 0) {
    cacheRef.current = {
      records: result.data.records,
      types: result.data.types ?? null,
    };
  }

  const hasCache = cacheRef.current.records !== null && cacheRef.current.records.length > 0;
  const isRefreshing = result.isLoading && hasCache;
  const isFirstLoad = result.isLoading && !hasCache;

  // Return cached data when loading, real data when available
  const data = useMemo(() => {
    if (result.data?.records && result.data.records.length > 0) {
      return result.data;
    }
    if (hasCache && result.isLoading) {
      return {
        records: cacheRef.current.records,
        types: cacheRef.current.types,
      } as typeof result.data;
    }
    return result.data;
  }, [result.data, result.isLoading, hasCache]);

  return {
    data,
    isLoading: isFirstLoad,
    isRefreshing,
    error: result.error,
  };
}
