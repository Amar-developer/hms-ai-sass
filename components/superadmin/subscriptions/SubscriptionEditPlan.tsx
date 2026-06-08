"use client";

import { Button, Card, Input } from "@/components/common/ui";
import { FormField } from "@/components/FormElements";
import { ModuleEntitlementChecklist } from "./ModuleEntitlementChecklist";

export function SubscriptionEditPlan({
  loading,
  plan,
  updatePlan,
  back,
  modules,
}: any) {
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-bold">Edit Subscription Plan</h3>
          <p className="text-sm text-slate-500">{plan.key}</p>
        </div>
        <button
          type="button"
          onClick={back}
          className="rounded-2xl border px-4 py-3 text-sm font-bold"
        >
          Back to Subscriptions
        </button>
      </div>
      <form onSubmit={updatePlan} className="mt-5 grid gap-3 md:grid-cols-2">
        <FormField label="Plan Name">
          <Input name="name" required defaultValue={plan.name} />
        </FormField>
        <FormField label="Monthly Price">
          <Input
            name="priceInrMonthly"
            type="number"
            required
            min="0"
            defaultValue={plan.price_inr_monthly}
          />
        </FormField>
        <FormField label="Patient Limit">
          <Input
            name="monthlyPatientLimit"
            type="number"
            required
            min="0"
            defaultValue={plan.monthly_patient_limit}
          />
        </FormField>
        <FormField label="Included Branches">
          <Input
            name="includedBranches"
            type="number"
            required
            min="0"
            defaultValue={plan.included_branches}
          />
        </FormField>
        <FormField label="Included Doctors">
          <Input
            name="includedDoctors"
            type="number"
            required
            min="0"
            defaultValue={plan.included_doctors}
          />
        </FormField>
        <div className="md:col-span-2">
          <ModuleEntitlementChecklist
            modules={modules}
            selected={plan.enabled_modules || []}
          />
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button disabled={loading}>
            {loading ? "Saving..." : "Update Plan"}
          </Button>
          <button
            type="button"
            onClick={back}
            className="rounded-2xl border px-4 py-3 text-sm font-bold"
          >
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
