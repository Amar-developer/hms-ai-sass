"use client";

import { SearchableSelect } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";

export function TenantPicker({ tenants, selectedId, setSelectedId }: any) {
  return (
 <div className="w-40">
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
        className="text-xs"
      />
    </FormField>
 </div>
  );
}
