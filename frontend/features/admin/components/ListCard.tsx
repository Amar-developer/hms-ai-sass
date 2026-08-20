import { Pagination } from "@/app/components/common/Pagination";
import { Card } from "@/app/components/common/ui";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { TableSkeleton } from "@/app/components/common/loader/TableSkeleton";

// Search, sort, reset, and the "+ Add a Filter" custom builder now live in
// the breadcrumb row (AdaptiveFilterTrigger/AdaptiveSortTrigger/
// AdaptiveResultCount, rendered by TenantAdmin per section) — this stays a
// dumb paginated table over whatever pre-filtered/sorted `rows` it's given.
export function ListCard({
  title,
  rows,
  createLabel,
  onCreate,
  canCreate = true,
  columns,
  render,
  loading = false,
}: any) {
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageRows = rows.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  return (
    <Card className="p-0">
      {/* HEADER */}
      <div className="pb-3  flex flex-col rounded-lg justify-between gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-col justify-center">
          <h3 className="card-title font-bold">{title}</h3>
          <p className="card-desc text-slate-500">
            Latest created or updated records appear first. Click a row to open
            it.
          </p>
        </div>

        {canCreate && onCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="primary-action gap-2 px-4 py-3 text-xs"
          >
            <Plus size={16} />
            {createLabel}
          </button>
        )}
      </div>

      {/* TABLE */}
      <div className="mt-4 overflow-x-auto  w-lg rounded-lg border border-slate-200 ">
        <table className="w-max min-w-full">
          <thead className="font-bold uppercase text-slate-500 ">
            <tr className="bg-slate-50">
              {columns.map((column: any) => (
                <th
                  key={column.label}
                  className={`whitespace-nowrap px-4 py-2 ${column.label =='Status' || column.label=='S.No' ?'text-center':'text-left'} text-sm font-bold uppercase text-slate-500`}
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
                      className="p-4 text-xs text-slate-500 lg:text-sm"
                    >
                      <div className="rounded-lg bg-slate-50 px-4 py-2">
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
        total={rows.length}
        pageSize={pageSize}
        onPage={setPage}
      />
    </Card>
  );
}
