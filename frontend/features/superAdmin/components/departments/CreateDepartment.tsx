"use client";

import { Button, Card, Field, Input, SuggestionInput } from "@/app/components/common/ui";
import { basicMedicalDepartmentSuggestions } from "@/lib/options";
import { TenantPicker } from "../shared/TenantPicker";

export function CreateDepartment({
  tenants,
  selectedId,
  setSelectedId,
  busy,
  createDepartment,
  back,
}: any) {
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-base lg:text-lg font-bold">Create Medical Department</h3>
          <p className="text-xs lg:text-sm text-slate-500">
            Add a medical department to the selected tenant.
          </p>
        </div>
        <button
          type="button"
          onClick={back}
          className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
        >
          Back to Medical Departments
        </button>
      </div>
      <form
        onSubmit={createDepartment}
        autoComplete="off"
        className="mt-4 grid gap-3 md:grid-cols-2"
      >
        <TenantPicker
          tenants={tenants}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
        />
        <Field label="Name">
          <SuggestionInput
            name="name"
            required
            placeholder="General Medicine"
            suggestions={basicMedicalDepartmentSuggestions}
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Description">
            <Input
              name="description"
              placeholder="OP, IP, or speciality care handled by this medical department"
              className='rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm'
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button disabled={busy}>
            {busy ? "Creating..." : "Create Medical Department"}
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
