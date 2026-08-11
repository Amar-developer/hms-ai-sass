import { useCallback, useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import { fetchRecentSubcategories } from "./expenses.api";

export function useRecentSubcategories(apiSession: ApiSession | null | undefined) {
  const [subcategories, setSubcategories] = useState<string[]>([]);

  const reload = useCallback(async () => {
    if (!apiSession) return;
    try {
      const result = await fetchRecentSubcategories(apiSession);
      setSubcategories(Array.isArray(result) ? result : []);
    } catch {
      // Suggestions are a convenience, not critical — fail silently.
    }
  }, [apiSession]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { subcategories, reload };
}
