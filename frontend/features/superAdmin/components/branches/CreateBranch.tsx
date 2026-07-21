"use client";

import { Button, Card, Field, Input } from "@/app/components/common/ui";
import { TenantPicker } from "../shared/TenantPicker";
import { FormField } from "@/app/components/FormElements";

export function CreateBranch({
  tenants,
  selectedId,
  setSelectedId,
  busy,
  createBranch,
  back,
}: any) {
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-base lg:text-base lg:text-lg font-bold">
            Create Branch
          </h3>
          <p className="text-xs lg:text-sm text-slate-500">
            Add a branch or global branch template to the selected tenant.
          </p>
        </div>
        <button
          type="button"
          onClick={back}
          className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
        >
          Back to Branches
        </button>
      </div>
      <form onSubmit={createBranch} className="mt-4 grid gap-3 md:grid-cols-2">
        <TenantPicker
          tenants={tenants}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
        />
        <FormField label="Branch Name">
          <Input
            name="name"
            required
            placeholder="Main Branch"
          />
        </FormField>
        <FormField label="Branch Code">
          <Input
            name="code"
            required
            placeholder="MAIN"
          />
        </FormField>
        <FormField label="Area">
          <Input
            name="area"
            placeholder="Chrompet"
          />
        </FormField>
        <FormField label="City">
          <Input
            name="city"
            placeholder="Chennai"
          />
        </FormField>
        <FormField label="State">
          <Input
            name="state"
            placeholder="Tamil Nadu"
          />
        </FormField>
        <div className="md:col-span-2">
          <FormField label="Address">
            <Input
              name="address"
              placeholder="Street, area, landmark"
            />
          </FormField>
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button disabled={busy}>
            {busy ? "Creating..." : "Create Branch"}
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
