import { FilterSection } from "@/app/components/common/FilterSection";
import { Pagination } from "@/app/components/common/Pagination";
import { Card, RefreshButton } from "@/app/components/common/ui";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TableSkeleton } from "@/app/components/common/loader/TableSkeleton";

export function ListCard({
  title,
  rows,
  searchKeys,
  createLabel,
  onCreate,
  canCreate = true,
  filters = [],
  filterValues = {},
  onFilterChange,
  onRefresh,
  columns,
  render,
  loading = false,
}: any) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const filtered = useMemo(() => {
    return rows.filter((row: any) =>
      searchKeys.some((key: string) =>
        String(row[key] ?? "")
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    );
  }, [rows, query, searchKeys]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageRows = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  useEffect(() => {
    setPage(1);
  }, [query, rows.length]);

  return (
    <Card>
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h3 className="card-title font-bold">{title}</h3>
          <p className="card-desc text-slate-500">
            Latest created or updated records appear first. Click a row to open
            it.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && <RefreshButton onRefresh={onRefresh} />}

          {canCreate && onCreate && (
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-xs bg-slate-900 font-bold text-white"
            >
              <Plus size={16} />
              {createLabel}
            </button>
          )}
        </div>
      </div>

      {/* SEARCH & FILTERS */}
      <FilterSection
        title={title}
        query={query}
        setQuery={setQuery}
        filters={filters}
        filterValues={filterValues}
        onFilterChange={onFilterChange}
      />

      {/* TABLE */}
      <div className="mt-4 overflow-x-auto w-lg rounded-2xl border border-slate-200 ">
        <table className="w-max min-w-full">
          <thead className="font-bold uppercase text-slate-500 ">
            <tr className="bg-slate-50">
              {columns.map((column: any) => (
                <th
                  key={column.label}
                  className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase text-slate-500"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          {/* ROWS */}
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  <TableSkeleton rows={5} />
                </td>
              </tr>
            ) : (
              <>
                {pageRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-4 py-4 text-xs text-slate-500 lg:text-sm"
                    >
                      <div className="rounded-lg bg-slate-50 p-4">
                        No records match your search.
                      </div>
                    </td>
                  </tr>
                )}

                {pageRows.map((row: any, index: number) => render(row, index))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      <Pagination
        page={safePage}
        totalPages={totalPages}
        total={filtered.length}
        pageSize={pageSize}
        onPage={setPage}
      />
    </Card>
  );
}
