import { Info } from "@/app/components/common/Info";
import { Badge, Card } from "@/app/components/common/ui";
import { invoiceLimitLabel, limitLabel } from "@/features/superAdmin/helpers";

export function PlanModulePreview({ plan, modules }: any) {
  if (!plan)
    return (
      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
        Select a subscription plan first.
      </div>
    );
  const moduleNames = (plan.enabled_modules || []).map((key: string) => {
    const module = (modules || []).find(
      (item: any) => (item.entitlement_key || item.key) === key,
    );
    return module?.name || key;
  });
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-5">
        <Info label="Plan" value={plan.name} />
        <Info label="Price" value={`₹${plan.price_inr_monthly}`} />
        <Info label="Patients" value={limitLabel(plan.monthly_patient_limit)} />
        <Info label="Invoices" value={invoiceLimitLabel(plan)} />
        <Info label="Branches" value={limitLabel(plan.included_branches)} />
      </div>
      <Card>
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h4 className="font-bold text-base lg:text-lg">Included Modules</h4>
            <p className="text-xs lg:text-sm text-slate-500">
              Tenant access follows these modules from the selected plan.
            </p>
          </div>
          <Badge tone="blue" className="normal-badge">{moduleNames.length} modules</Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {moduleNames.length ? (
            moduleNames.map((name: string) => (
              <span
                key={name}
                className="rounded-lg bg-slate-100 px-2 py-2 lg:px-4 lg:py-3 text-[10px] lg:text-sm font-bold text-slate-700"
              >
                {name}
              </span>
            ))
          ) : (
            <span className="text-sm text-slate-400">
              No modules configured.
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
