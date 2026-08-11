import { useEffect, useRef, useState } from "react";
import type { ApiSession } from "@/lib/api";
import { fetchExpensePage } from "./expenses.api";

const PAGE_LIMIT = 100;
const MAX_PAGES = 10;

export type ExpenseListFilters = {
  status?: string;
  category?: string;
  query?: string;
  branchId?: string;
};

export function useExpensesData(
  apiSession: ApiSession | null | undefined,
  filters: ExpenseListFilters,
) {
  const [rawExpenses, setRawExpenses] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sequenceRef = useRef(0);

  async function load() {
    if (!apiSession) return;
    const sequence = ++sequenceRef.current;
    setLoading(true);
    setError("");
    try {
      const collected: any[] = [];
      let totalCount = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const params = new URLSearchParams({
          limit: String(PAGE_LIMIT),
          offset: String(page * PAGE_LIMIT),
        });
        if (filters.status && filters.status !== "all") {
          params.set("status", filters.status);
        }
        if (filters.category && filters.category !== "all") {
          params.set("category", filters.category);
        }
        if (filters.query) params.set("q", filters.query);
        if (filters.branchId) params.set("branch_id", filters.branchId);

        const result = await fetchExpensePage(apiSession, params);
        if (sequence !== sequenceRef.current) return;
        const items = Array.isArray(result?.items) ? result.items : [];
        collected.push(...items);
        totalCount = Number(result?.total || 0);
        if (items.length === 0 || collected.length >= totalCount) break;
      }
      if (sequence !== sequenceRef.current) return;
      setRawExpenses(collected);
      setTotal(totalCount);
    } catch (err: any) {
      if (sequence !== sequenceRef.current) return;
      setError(err.message || "Could not load expenses.");
    } finally {
      if (sequence === sequenceRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    apiSession?.tenantId,
    filters.status,
    filters.category,
    filters.query,
    filters.branchId,
  ]);

  return { rawExpenses, total, loading, error, reload: load };
}
