import { Card } from "@/app/components/common/ui";

export function AnalysisCard({ title, subtitle, rows, empty }: any) {
  const max = Math.max(...rows.map((row: any) => row.count), 1);
  return (
    <Card>
      <h3 className="card-title font-bold">{title}</h3>
      <p className="table-data text-slate-500">{subtitle}</p>
      <div className="mt-4 grid gap-3">
        {rows.length === 0 && (
          <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
            {empty}
          </div>
        )}
        {rows.slice(0, 8).map((row: any) => (
          <div key={row.key} className="grid gap-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-bold">{row.label}</span>
              <span className="text-slate-500">{row.count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-slate-900"
                style={{ width: `${Math.max(8, (row.count / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
