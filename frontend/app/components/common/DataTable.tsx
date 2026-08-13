import React, { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Pagination } from "@/app/components/common/Pagination";
import { pageSize as defaultPageSize } from "@/utils/constants";
import { TableSkeleton } from "@/app/components/common/loader/TableSkeleton";
import { DataTableProps } from "@/utils/types";

export function DataTable<T>({
  columns,
  data,
  emptyMessage = "No data found",
  className,
  onRowClick,
  footer,
  paginate = false,
  pageSize = defaultPageSize,
  loading = false,
  sort,
  onSortChange,
}: DataTableProps<T>) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rowOffset = paginate ? (safePage - 1) * pageSize : 0;
  const visibleData = paginate
    ? data.slice(rowOffset, rowOffset + pageSize)
    : data;

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function handleSort(key: string) {
    if (!onSortChange) return;
    onSortChange(
      sort?.key === key
        ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }


  return (
    <div className={className}>
      <div className="overflow-auto  rounded-lg border">
        <table
          className={`w-full min-w-[920px] table-fixed text-left text-sm ${className ?? ""}`}
        >
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            {columns.map((column) => (
              <th
                key={String(column.key)}
                style={column.width ? { width: column.width } : undefined}
                className={`px-4 py-3 text-sm ${column.className ?? ""}`}
              >
                {column.sortable && onSortChange ? (
                  <button
                    type="button"
                    onClick={() => handleSort(String(column.key))}
                    className="inline-flex items-center gap-1 font-bold uppercase text-slate-500 hover:text-slate-900"
                  >
                    {column.header}
                    {sort?.key === column.key ? (
                      sort.dir === "asc" ? (
                        <ArrowUp size={12} />
                      ) : (
                        <ArrowDown size={12} />
                      )
                    ) : null}
                  </button>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y">
          {loading && (
            <tr>
              <td colSpan={columns.length} className="p-0">
                <TableSkeleton />
              </td>
            </tr>
          )}

          {!loading && data.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-4 text-xs text-slate-500"
              >
                {emptyMessage}
              </td>
            </tr>
          )}

          {!loading && visibleData.map((row, index) => (
            <tr
              key={index}
              onClick={() => onRowClick?.(row)}
              className={onRowClick ? "cursor-pointer hover:bg-slate-50" : ""}
            >
              {columns.map((column) => (
                <td
                  key={String(column.key)}
                  className={`px-4 py-4 ${column.cellClassName ?? ""}`}
                  onClick={
                    column.disableRowClick
                      ? (e) => e.stopPropagation()
                      : undefined
                  }
                >
                  {column.render
                    ? column.render(row, rowOffset + index)
                    : (row[column.key as keyof T] as React.ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot className="border-t-2 border-slate-200 bg-slate-50">
            {footer}
          </tfoot>
        )}
        </table>
      </div>
      {paginate && (
        <Pagination
          page={safePage}
          totalPages={totalPages}
          total={data.length}
          onPage={setPage}
          pageSize={pageSize}
        />
      )}
    </div>
  );
}
