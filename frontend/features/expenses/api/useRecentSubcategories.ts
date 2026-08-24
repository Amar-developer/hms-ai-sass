import { useCallback, useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import type { RecentSubcategory } from "../types";
import { fetchRecentSubcategories } from "./expenses.api";

export function useRecentSubcategories(apiSession: ApiSession | null | undefined) {
  const [recentSubcategories, setRecentSubcategories] = useState<
    RecentSubcategory[]
  >([]);

  const reload = useCallback(async () => {
    if (!apiSession) return;
    try {
      const result = await fetchRecentSubcategories(apiSession);
      setRecentSubcategories(Array.isArray(result) ? result : []);
    } catch {
      // Suggestions are a convenience, not critical — fail silently.
    }
  }, [apiSession]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { recentSubcategories, reload };
}
