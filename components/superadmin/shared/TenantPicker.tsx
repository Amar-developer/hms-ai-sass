"use client";

import { Select } from "@/components/common/ui";
import { FormField } from "@/components/FormElements";

export function TenantPicker({ tenants, selectedId, setSelectedId }: any) {
  return (
    <FormField label="Selected Tenant">
      <Select
        value={selectedId}
        onChange={(e: any) => setSelectedId(e.target.value)}
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
