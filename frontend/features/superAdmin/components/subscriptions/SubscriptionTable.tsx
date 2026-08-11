"use client";

import { Badge, Card } from "@/app/components/common/ui";
import { displayDate } from "@/utils/helper";
import { Empty } from "@/app/components/common/Empty";

export function SubscriptionTable({ title, rows, columns }: any) {
  function cellValue(row: any, column: string) {
    if (/(^|_)(date|on|at)$/.test(column)) return displayDate(row[column]);
    return String(row[column] ?? "-");
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-bold">{title}</h4>
        <Badge tone="blue" className="normal-badge">{rows.length}</Badge>
      </div>
      <div className="mt-4 space-y-3">
        {rows.length === 0 && (
          <Empty text={`No ${title.toLowerCase()} yet.`} />
        )}
        {rows.slice(0, 6).map((row: any) => (
          <div
            key={row.id || row.invoice_number}
            className="rounded-2xl bg-slate-50 p-3 text-sm"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {columns.map((column: string) => (
                <div key={column}>
                  <p className="text-[11px] font-bold uppercase text-slate-500">
                    {column.replaceAll("_", " ")}
                  </p>
                  <p className="font-semibold">{cellValue(row, column)}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
