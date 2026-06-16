import { useState, useEffect } from "react";

interface SloItem {
  name: string;
  status: string;
  evaluationWindow?: string;
  target?: number;
}

interface UseSloApiResult {
  sloCount: number;
  slos: SloItem[];
  isLoading: boolean;
  error: Error | null;
}

export const useSloApi = (appCI: string): UseSloApiResult => {
  const [sloCount, setSloCount] = useState(0);
  const [slos, setSlos] = useState<SloItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!appCI) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();

    const fetchSlos = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          name: appCI,
          pageSize: "500",
          enabledSlos: "all",
          fields: "name,status,evaluationWindow,target",
        });
        const response = await fetch(`/api/v2/slo?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`SLO API responded with ${response.status}`);
        }
        const data = await response.json();
        const items: SloItem[] = data.slo ?? [];
        setSlos(items);
        setSloCount(items.length);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(err as Error);
          setSloCount(0);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchSlos();
    return () => controller.abort();
  }, [appCI]);

  return { sloCount, slos, isLoading, error };
};
