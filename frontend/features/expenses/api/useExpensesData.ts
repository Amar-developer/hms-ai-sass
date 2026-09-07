import { useEffect, useRef, useState } from "react";
import type { ApiSession } from "@/lib/api";
import { fetchExpensePage } from "./expenses.api";
import type { QueryFilterRow } from "@/utils/queryFilter";
import type { SortState } from "@/utils/types";

const PAGE_LIMIT = 100;
const MAX_PAGES = 10;

export type ExpenseListFilters = {
  status?: string;
  category?: string;
  query?: string;
  branchId?: string;
  fromDate?: string;
  toDate?: string;
  refreshTick?: number;
  queryFilters?: QueryFilterRow[];
  sort?: SortState | null;
};

const FIELD_MAP: Record<string, string> = {
  branchId: "branch_id",
  submittedBy: "submitted_by",
  approvedBy: "approved_by",
  incurredOn: "incurred_on",
  createdAt: "created_at",
  updatedAt: "updated_at",
  createdByUserId: "created_by_user_id",
  updatedByUserId: "updated_by_user_id",
};

function toBackendField(field: string) {
  return FIELD_MAP[field] || field;
}

function backendFilters(filters: QueryFilterRow[] = []) {
  return filters.map((filter) => ({
    ...filter,
    field: toBackendField(filter.field),
  }));
}

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
        if (filters.fromDate) params.set("from_date", filters.fromDate);
        if (filters.toDate) params.set("to_date", filters.toDate);
        const dynamicFilters = backendFilters(filters.queryFilters);
        if (dynamicFilters.length) {
          params.set("filters", JSON.stringify(dynamicFilters));
        }
        if (filters.sort) {
          params.set(
            "sort",
            JSON.stringify({ ...filters.sort, key: toBackendField(filters.sort.key) }),
          );
        }

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
    filters.fromDate,
    filters.toDate,
    filters.refreshTick,
    JSON.stringify(filters.queryFilters || []),
    filters.sort?.key,
    filters.sort?.dir,
  ]);

  return { rawExpenses, total, loading, error, reload: load };
}
