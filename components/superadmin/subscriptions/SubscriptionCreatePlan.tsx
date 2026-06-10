"use client";

import { Button, Card } from "@/components/common/ui";
import { FormField } from "@/components/FormElements";
import { Input } from "@/components/common/ui";
import { defaultModuleKeys } from "../../../utils/superAdmin/superAdmin";
import { ModuleEntitlementChecklist } from "./ModuleEntitlementChecklist";

export function SubscriptionCreatePlan({
  loading,
  createPlan,
  back,
  modules,
}: any) {
  const defaults = defaultModuleKeys(modules);
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-base lg:text-lg font-bold">Create Custom Plan</h3>
          <p className="text-xs lg:text-sm text-slate-500">
            Create a reusable SaaS package with limits, pricing, and enabled
            modules.
          </p>
        </div>
        <button
          type="button"
          onClick={back}
          className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
        >
          Back to Subscriptions
        </button>
      </div>
      <form onSubmit={createPlan} className="mt-5 grid gap-3 md:grid-cols-2">
        <FormField label="Plan Key">
          <Input name="key" required placeholder="growth_clinic" />
        </FormField>
        <FormField label="Plan Name">
          <Input name="name" required placeholder="Growth Clinic" />
        </FormField>
        <FormField label="Patient Limit">
          <Input
            name="monthlyPatientLimit"
            type="number"
            required
            min="1"
            defaultValue="300"
          />
        </FormField>
        <FormField label="Monthly Price">
          <Input
            name="priceInrMonthly"
            type="number"
            required
            min="0"
            defaultValue="2999"
          />
        </FormField>
        <FormField label="Included Branches">
          <Input
            name="includedBranches"
            type="number"
            min="1"
            defaultValue="1"
          />
        </FormField>
        <FormField label="Included Doctors">
          <Input
            name="includedDoctors"
            type="number"
            min="1"
            defaultValue="3"
          />
        </FormField>
        <div className="md:col-span-2">
          <ModuleEntitlementChecklist modules={modules} selected={defaults} />
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button disabled={loading}>
            {loading ? "Saving..." : "Create Plan"}
          </Button>
          <button
            type="button"
            onClick={back}
            className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
          >
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
