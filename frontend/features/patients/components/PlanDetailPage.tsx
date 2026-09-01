import { Card, Badge, Button } from "@/app/components/common/ui";
import { money } from "@/utils/helper";
import { pharmacyBenefitLabel } from "../helpers";
import { BenefitList } from "./BenefitList";
import { PharmacySlabList } from "./PharmacySlabList";
import { PlanMetric } from "./PlanMetric";

export function PlanDetailPage({
  plan,
  labTests,
  medicines,
  departments,
  onBack,
  onEdit,
  onToggle,
  toggleBusy = false,
  canEditPlans = false,
  activeEnrollmentCount = 0,
}: any) {
  const consultDeptIds = plan.free_consultation_department_ids || [];
  const consultDeptLabel =
    consultDeptIds.length === 0
      ? "All departments"
      : consultDeptIds
          .map(
            (id: string) =>
              (departments || []).find((dept: any) => dept.id === id)?.name ||
              id,
          )
          .join(", ");
  const benefitItemCount =
    (plan.free_lab_test_ids?.length || 0) +
    (plan.discounted_lab_test_ids?.length || 0) +
    (plan.free_medicine_ids?.length || 0) +
    (plan.discounted_medicine_ids?.length || 0);

  return (
    <div className="space-y-5">
      <Card className="bg-white p-3">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <button
              type="button"
              onClick={onBack}
              className="mb-3 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Back to Plans
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-bold">{plan.name}</h3>
              <Badge
                tone={plan.is_active ? "green" : "red"}
                className="normal-badge p-2"
              >
                {plan.is_active ? "Active" : "Paused"}
              </Badge>
            </div>
            {plan.code && (
              <p className="mt-1 break-all text-sm text-slate-500">
                {plan.code}
              </p>
            )}
          </div>
          {canEditPlans && (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={onEdit}
                className="rounded-lg px-4 py-2 text-xs"
              >
                Edit
              </Button>
              <button
                type="button"
                disabled={toggleBusy}
                onClick={onToggle}
                className={`rounded-lg border px-4 py-2 text-xs font-bold disabled:opacity-50 ${
                  plan.is_active
                    ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                    : "border-green-200 text-green-700 hover:bg-green-50"
                }`}
              >
                {plan.is_active ? "Pause" : "Activate"}
              </button>
            </div>
          )}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PlanMetric label="Price" value={money(plan.price_amount)} />
          <PlanMetric label="Duration" value={`${plan.duration_days} days`} />
          <PlanMetric
            label="Activation"
            value={`${plan.activation_after_days || 0} days`}
          />
          <PlanMetric label="Consults" value={plan.free_consultations} />
          <PlanMetric label="Consult Departments" value={consultDeptLabel} />
          <PlanMetric
            label="Lab Discount"
            value={`${plan.lab_discount_percentage}%`}
          />
          <PlanMetric label="Pharmacy" value={pharmacyBenefitLabel(plan)} />
          <PlanMetric label="Scope" value="Tenant" />
          <PlanMetric
            label="Benefit Items"
            value={`${benefitItemCount} items`}
          />
          <PlanMetric
            label="Min Bill"
            value={money(plan.min_discount_amount)}
          />
          <PlanMetric label="Enrollments" value={activeEnrollmentCount} />
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <PharmacySlabList slabs={plan.pharmacy_discount_slabs || []} />
        <BenefitList
          title="Free Lab Tests"
          ids={plan.free_lab_test_ids}
          rows={labTests}
          priceKey="default_price"
          quantities={plan.free_lab_test_quantities}
        />
        <BenefitList
          title="Discounted Lab Tests"
          ids={plan.discounted_lab_test_ids}
          rows={labTests}
          priceKey="default_price"
        />
        <BenefitList
          title="Free Medicines"
          ids={plan.free_medicine_ids}
          rows={medicines}
          priceKey="default_sale_price"
          quantities={plan.free_medicine_quantities}
        />
        <BenefitList
          title="Discounted Medicines"
          ids={plan.discounted_medicine_ids}
          rows={medicines}
          priceKey="default_sale_price"
        />
      </div>
    </div>
  );
}
