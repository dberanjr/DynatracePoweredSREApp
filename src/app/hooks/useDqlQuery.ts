import { queryExecutionClient } from "@dynatrace-sdk/client-query";
import { useState, useEffect } from "react";

export interface DqlResult {
  records: Record<string, unknown>[] | null;
  loading: boolean;
  error: string | null;
}

export function useDqlQuery(query: string, enabled = true): DqlResult {
  const [records, setRecords] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !query) {
      setRecords(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    queryExecutionClient
      .queryExecute({
        body: {
          query,
          requestTimeoutMilliseconds: 60000,
          maxResultRecords: 1000,
        },
      })
      .then((response) => {
        if (!cancelled) {
          setRecords((response.result?.records as Record<string, unknown>[]) ?? []);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? "Query failed");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query, enabled]);

  return { records, loading, error };
}
