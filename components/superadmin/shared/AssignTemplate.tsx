"use client";

import { Button, Card, Select } from "@/components/common/ui";
import { FormField } from "@/components/FormElements";

export function AssignTemplate({
  title,
  item,
  tenants,
  busy,
  onSubmit,
  back,
}: any) {
  if (!item)
    return (
      <Card>
        <h3 className="text-lg font-bold">Template not found</h3>
        <button
          type="button"
          onClick={back}
          className="mt-4 rounded-2xl border px-4 py-3 text-sm font-bold"
        >
          Back
        </button>
      </Card>
    );
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-bold">{title}</h3>
          <p className="text-sm text-slate-500">
            {item.name} will be copied or updated in the selected tenant.
          </p>
        </div>
        <button
          type="button"
          onClick={back}
          className="rounded-2xl border px-4 py-3 text-sm font-bold"
        >
          Back
        </button>
      </div>
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
        <FormField label="Target Tenant">
          <Select name="targetTenantId" required>
            {tenants.map((tenant: any) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="flex items-end gap-2">
          <Button disabled={busy}>
            {busy ? "Assigning..." : "Assign to Tenant"}
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
