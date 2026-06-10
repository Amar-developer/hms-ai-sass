"use client";

import { Button, Card, Field, Input, Select, SuggestionInput } from "@/components/common/ui";
import { basicMedicalDepartmentSuggestions } from "@/lib/options";

export function EditDepartment({
  department,
  busy,
  updateDepartment,
  back,
}: any) {
  if (!department)
    return (
      <Card>
        <h3 className="text-base lg:text-lg font-bold">Medical Department not found</h3>
        <button
          type="button"
          onClick={back}
          className="mt-4 rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
        >
          Back to Medical Departments Moses
        </button>
      </Card>
    );
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-base lg:text-lg font-bold">Edit Medical Department</h3>
          <p className="text-xs lg:text-sm text-slate-500">{department.code}</p>
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
        onSubmit={updateDepartment}
        autoComplete="off"
        className="mt-4 grid gap-3 md:grid-cols-2"
      >
        <Field label="Name">
          <SuggestionInput
            name="name"
            defaultValue={department.name}
            required
            placeholder="General Medicine"
            suggestions={basicMedicalDepartmentSuggestions}
          />
        </Field>
        <Field label="Status">
          <Select
            name="isActive"
            defaultValue={String(department.is_active)}
            className='rounded-lg px-2 py-1.5 lg:px-4 lg:py-3 text-xs lg:text-sm'
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Description">
            <Input
              name="description"
              defaultValue={department.description || ""}
              className='rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm'
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button disabled={busy}>
            {busy ? "Saving..." : "Save Medical Department"}
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
