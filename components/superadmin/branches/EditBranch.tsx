"use client";

import { Button, Card, Field, Input, Select } from "@/components/common/ui";

export function EditBranch({ branch, busy, updateBranch, back }: any) {
  if (!branch)
    return (
      <Card>
        <h3 className="text-lg font-bold">Branch not found</h3>
        <button
          type="button"
          onClick={back}
          className="mt-4 rounded-2xl border px-4 py-3 text-sm font-bold"
        >
          Back to Branches
        </button>
      </Card>
    );
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-bold">Edit Branch</h3>
          <p className="text-sm text-slate-500">{branch.code}</p>
        </div>
        <button
          type="button"
          onClick={back}
          className="rounded-2xl border px-4 py-3 text-sm font-bold"
        >
          Back to Branches
        </button>
      </div>
      <form onSubmit={updateBranch} className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Branch Name">
          <Input name="name" defaultValue={branch.name} required />
        </Field>
        <Field label="Branch Code">
          <Input name="code" defaultValue={branch.code} required />
        </Field>
        <Field label="Area">
          <Input name="area" defaultValue={branch.area || ""} />
        </Field>
        <Field label="City">
          <Input name="city" defaultValue={branch.city || ""} />
        </Field>
        <Field label="State">
          <Input name="state" defaultValue={branch.state || ""} />
        </Field>
        <Field label="Status">
          <Select name="isActive" defaultValue={String(branch.is_active)}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Address">
            <Input name="address" defaultValue={branch.address || ""} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button disabled={busy}>{busy ? "Saving..." : "Save Branch"}</Button>
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
