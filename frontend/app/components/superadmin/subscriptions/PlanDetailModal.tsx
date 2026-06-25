"use client";

import { Badge, Button, Card } from "@/app/components/common/ui";
import { formatDate, limitLabel } from "@/utils/superAdmin/superAdmin";
import { Info } from "../shared/Info";

export function PlanDetailModal({ plan, onClose, onEdit }: any) {
  const modules = (plan.enabled_modules || []).filter(Boolean);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-3xl">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h3 className="text-xs lg:text-lg font-bold">Plan Details</h3>
            <p className="text-xs lg:text-sm text-slate-500">{plan.key}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
          >
            Close
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Info label="Plan" value={plan.name} />
          <Info
            label="Monthly Price"
            value={`₹${plan.price_inr_monthly}`}
          />
          <Info
            label="Status"
            value={plan.is_active ? "Active" : "Inactive"}
          />
          <Info
            label="Patients"
            value={limitLabel(plan.monthly_patient_limit)}
          />
          <Info
            label="Branches"
            value={limitLabel(plan.included_branches)}
          />
          <Info
            label="Doctors"
            value={limitLabel(plan.included_doctors)}
          />
        </div>
        <div className="mt-4 rounded-2xl bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <b className="text-sm">Enabled Modules</b>
            <Badge tone="blue">{modules.length}</Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {modules.length === 0 && (
              <span className="text-sm text-slate-500">
                No modules enabled.
              </span>
            )}
            {modules.map((module: string) => (
              <span
                key={module}
                className="rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-700"
              >
                {module}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Info label="Plan ID" value={plan.id} />
          <Info label="Created" value={formatDate(plan.created_at)} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" onClick={onEdit}>
            Edit Plan
          </Button>
        </div>
      </Card>
    </div>
  );
}
