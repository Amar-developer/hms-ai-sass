import { useCallback, useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import { mapExpenseSubcategoryConfig } from "../helpers";
import type { ExpenseSubcategoryConfig } from "../types";
import { fetchExpenseSubcategoryConfigs } from "./expenses.api";

export function useExpenseSubcategoryConfigs(
  apiSession: ApiSession | null | undefined,
  params?: { activeOnly?: boolean },
) {
  const [subcategoryConfigs, setSubcategoryConfigs] = useState<
    ExpenseSubcategoryConfig[]
  >([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!apiSession) return;
    setLoading(true);
    try {
      const result = await fetchExpenseSubcategoryConfigs(apiSession, params);
      setSubcategoryConfigs(
        Array.isArray(result) ? result.map(mapExpenseSubcategoryConfig) : [],
      );
    } catch {
      setSubcategoryConfigs([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSession, params?.activeOnly]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { subcategoryConfigs, loading, reload };
}
