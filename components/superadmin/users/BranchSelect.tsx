"use client";

import { Field, Select } from "@/components/common/ui";
import { branchDisplayName } from "../../../utils/superAdmin/superAdmin";

export function BranchSelect({ branches, defaultValue = "" }: any) {
  return (
    <Field label="Branch">
      <Select name="branchId" defaultValue={defaultValue || ""}>
        <option value="">All branches</option>
        {branches.map((branch: any) => (
          <option key={branch.id} value={branch.id}>
            {branchDisplayName(branch)}
          </option>
        ))}
      </Select>
    </Field>
  );
}
