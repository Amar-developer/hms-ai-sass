import { money } from "@/utils/helper";
import { Card,Badge } from "@/app/components/common/ui";

export function BenefitList({ title, ids, rows, priceKey, quantities }: any) {
  const selected = (ids || []).map(
    (id: string) =>
      rows.find((row: any) => row.id === id) || { id, name: "Selected item" },
  );
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h4 className="card-title font-bold">{title}</h4>
        <Badge tone="blue" className="normal-badge">
          {selected.length}
        </Badge>
      </div>
      <div className="mt-4 max-h-[420px] overflow-auto rounded-lg border border-slate-200">
        {selected.length === 0 && (
          <p className="p-4 text-sm text-slate-500">No items selected.</p>
        )}
        {selected.map((row: any) => {
          const qty = quantities ? Number(quantities[row.id]) || 1 : null;
          return (
            <div
              key={row.id}
              className="grid gap-2 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div>
                <b>{row.name}</b>
                <p className="break-all text-xs text-slate-500">
                  {row.code ||
                    row.generic_name ||
                    row.department ||
                    row.form ||
                    "-"}
                </p>
              </div>
              <span className="flex items-center justify-end gap-2 font-bold">
                {qty !== null && (
                  <Badge tone="green" className="normal-badge">
                    Free × {qty}
                  </Badge>
                )}
                {row[priceKey] !== undefined ? money(row[priceKey]) : "-"}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
