import { money } from "@/utils/helper";
import { PlanInlineDetail } from "./PlanInlineDetail";
import { Card,Badge } from "@/app/components/common/ui";

export function PharmacySlabList({ slabs }: any) {
  return (
    <Card className="bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="card-title font-bold">Pharmacy Discount Slabs</h4>
        <Badge tone="blue" className="normal-badge">
          {slabs.length}
        </Badge>
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        {slabs.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No slabs configured.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {slabs.map((slab: any, index: number) => (
              <div
                key={`${slab.min_amount}-${slab.max_amount}-${index}`}
                className="grid grid-cols-3 gap-3 px-4 py-3 text-sm"
              >
                <PlanInlineDetail label="From" value={money(slab.min_amount)} />
                <PlanInlineDetail
                  label="To"
                  value={
                    slab.max_amount === null || slab.max_amount === undefined
                      ? "Above"
                      : money(slab.max_amount)
                  }
                />
                <PlanInlineDetail
                  label="Discount"
                  value={`${slab.discount_percentage || 0}%`}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
