"use client";

import { Select } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";

export function TenantPicker({ tenants, selectedId, setSelectedId }: any) {
  return (
    <FormField label="Selected Tenant">
      <Select
        value={selectedId}
        onChange={(e: any) => setSelectedId(e.target.value)}
        className='rounded-lg px-2 py-1.5 lg:px-4 lg:py-3 text-xs lg:text-sm'
      >
        {tenants.map((tenant: any) => (
          <option key={tenant.id} value={tenant.id}>
            {tenant.name}
          </option>
        ))}
      </Select>
    </FormField>
  );
}
