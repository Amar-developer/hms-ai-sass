import type { SortState } from "./types";

// Sorts a page's worth of rows already in memory. Used for the client-side
// half of the sort control in AdaptiveFilterBar — server-paginated tables
// only sort the current page unless the API also grows a sort param.
export function sortRows<T extends Record<string, any>>(
  rows: T[],
  sort: SortState | null | undefined,
  valueOf: (row: T, key: string) => any = (row, key) => row[key],
): T[] {
  if (!sort) return rows;
  const { key, dir } = sort;
  const sorted = [...rows].sort((a, b) => {
    const av = valueOf(a, key);
    const bv = valueOf(b, key);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return av - bv;
    return String(av).localeCompare(String(bv), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
  return dir === "desc" ? sorted.reverse() : sorted;
}
