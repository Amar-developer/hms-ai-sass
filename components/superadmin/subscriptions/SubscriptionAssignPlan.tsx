"use client";

import { Button, Card, Input, Select } from "@/components/common/ui";
import { FormField } from "@/components/FormElements";
import { TenantPicker } from "../shared/TenantPicker";

export function SubscriptionAssignPlan({
  loading,
  tenants,
  selectedId,
  setSelectedId,
  plans,
  selectedTenant,
  assignSubscription,
  back,
}: any) {
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-bold">Assign / Upgrade Tenant Plan</h3>
          <p className="text-sm text-slate-500">
            Assign immediately, schedule renewal, or upgrade a tenant when
            limits are reached.
          </p>
        </div>
        <button
          type="button"
          onClick={back}
          className="rounded-2xl border px-4 py-3 text-sm font-bold"
        >
          Back to Subscriptions
        </button>
      </div>
      <form
        onSubmit={assignSubscription}
        className="mt-5 grid gap-3 md:grid-cols-2"
      >
        <TenantPicker
          tenants={tenants}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
        />
        <FormField label="Plan">
          <Select name="planId" required>
            {plans.map((plan: any) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} - ₹{plan.price_inr_monthly}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Activation Date">
          <Input
            name="startsOn"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </FormField>
        <FormField label="End Date">
          <Input name="endsOn" type="date" placeholder="Auto from plan" />
        </FormField>
        <FormField label="Billing Amount">
          <Input
            name="billingAmount"
            type="number"
            min="0"
            placeholder="Auto from plan price"
          />
        </FormField>
        <FormField label="Notes">
          <Input
            name="notes"
            placeholder="Upgrade, renewal, scheduled migration"
          />
        </FormField>
        <div className="md:col-span-2">
          {selectedTenant && (
            <div className="mb-3 rounded-2xl bg-slate-50 p-4 text-sm">
              <b>Selected tenant:</b> {selectedTenant.name}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={loading || !selectedId || plans.length === 0}>
              {loading ? "Assigning..." : "Save Subscription"}
            </Button>
            <button
              type="button"
              onClick={back}
              className="rounded-2xl border px-4 py-3 text-sm font-bold"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </Card>
  );
}
