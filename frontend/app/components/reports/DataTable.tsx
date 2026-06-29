import React from "react";

export type Column<T> = {
  key: keyof T | string;
  header: string;
  className?: string;
  cellClassName?: string;
  render?: (row: T, index: number) => React.ReactNode;
  disableRowClick?: boolean;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
  className?: string;
  onRowClick?: (row: T) => void;
};

export function DataTable<T>({
  columns,
  data,
  emptyMessage = "No data found",
  className,
  onRowClick,
}: DataTableProps<T>) {
  return (
    <div className="overflow-auto rounded-lg border">
      <table className={className}>
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            {columns.map((column) => (
              <th
                key={String(column.key)}
                className={`px-4 py-3 text-sm ${column.className ?? ""}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y">
          {data.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-4 text-xs text-slate-500"
              >
                {emptyMessage}
              </td>
            </tr>
          )}

          {data.map((row, index) => (
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
                    ? column.render(row, index)
                    : (row[column.key as keyof T] as React.ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
