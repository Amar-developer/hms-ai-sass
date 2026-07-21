"use client";

import { SearchableSelect, Select } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";

export function TenantPicker({ tenants, selectedId, setSelectedId }: any) {
  return (
    <FormField label="Selected Tenant">
      <SearchableSelect
        value={selectedId}
        onChange={(value) => setSelectedId(value)}
        options={tenants.map((tenant: any) => ({
          value: tenant.id,
          label: tenant.name,
        }))}
        placeholder="Select tenant"
        searchable={false}
        // className="rounded-lg px-2 py-1.5 lg:px-4 lg:py-3 text-xs lg:text-sm"
      />
    </FormField>
  );
}
