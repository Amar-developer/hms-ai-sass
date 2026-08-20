"use client";

import {
  Button,
  Card,
  Input,
  SearchableSelect,
} from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { Empty } from "@/app/components/common/Empty";
import { Info } from "@/app/components/common/Info";
import { TenantPicker } from "../shared/TenantPicker";
import { SubscriptionTable } from "./SubscriptionTable";

export function SubscriptionCreditsPage({
  loading,
  tenants,
  selectedId,
  setSelectedId,
  usage,
  credits,
  invoices,
  addCredits,
  back,
}: any) {
  return (
    <div className="space-y-5">
      <Card className="mt-3">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h3 className="card-title font-bold">Additional Credits</h3>
            <p className="card-desc text-slate-500">
              Add temporary patient credits and review tenant credit usage and
              SaaS invoices.
            </p>
          </div>
          <button
            type="button"
            onClick={back}
            className="close-button"
          >
            Back to Subscriptions
          </button>
        </div>
        <form onSubmit={addCredits} className="mt-5 grid gap-3 md:grid-cols-2">
          <TenantPicker
            tenants={tenants}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
          />
          <FormField label="Credit Type">
            <SearchableSelect
              name="creditType"
              searchable={false}
              value="patients"
              options={[
                {
                  label: "Patients",
                  value: "patients",
                },
              ]}
            />
          </FormField>
          <FormField label="Quantity">
            <Input
              name="quantity"
              type="number"
              required
              min="1"
              defaultValue="50"
            />
          </FormField>
          <FormField label="Amount">
            <Input name="amount" type="number" min="0" defaultValue="0" />
          </FormField>
          <FormField label="Starts On">
            <Input
              name="startsOn"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </FormField>
          <FormField label="Expires On">
            <Input name="expiresOn" type="date" />
          </FormField>
          <div className="md:col-span-2">
            <FormField label="Reason">
              <Input name="reason" placeholder="Patient limit extension" />
            </FormField>
          </div>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button disabled={loading || !selectedId} className='save-button'>
              {loading ? "Adding..." : "Add Credits"}
            </Button>
            <Button
              type="button"
              onClick={back}
              className="close-button bg-slate-100 text-slate-900"
            >
              Cancel
            </Button>
          </div>
        </form>
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <h4 className="font-bold">Current Usage</h4>
          {usage ? (
            <div className="mt-4 grid gap-3">
              <Info label="Plan" value={usage.plan_name} />
              <Info
                label="Patients"
                value={`${usage.current_patient_count}/${usage.effective_patient_limit}`}
              />
              <Info
                label="Available Credits"
                value={usage.additional_patient_credits}
              />
            </div>
          ) : (
            <Empty text="Select a tenant with an active subscription." />
          )}
        </Card>
        <SubscriptionTable
          title="Credit Purchases"
          rows={credits}
          columns={["credit_type", "quantity", "used_quantity", "amount"]}
        />
        <SubscriptionTable
          title="Invoices"
          rows={invoices}
          columns={["invoice_number", "amount", "status", "due_on"]}
        />
      </div>
    </div>
  );
}
