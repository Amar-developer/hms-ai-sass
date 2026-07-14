"use client";

import { Field, SearchableSelect, Select } from "@/app/components/common/ui";
import { branchDisplayName } from "../../helpers";

export function BranchSelect({ branches, defaultValue = "" }: any) {
  return (
    <Field label="Branch">
      <SearchableSelect
        name="branchId"
        // defaultValue={defaultValue || ""}
        options={[
          { value: "", label: "All branches" },
          ...branches.map((branch: any) => ({
            value: branch.id,
            label: branchDisplayName(branch),
          })),
        ]}
      />
    </Field>
  );
}
