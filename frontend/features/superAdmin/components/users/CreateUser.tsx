"use client";

import { Button, Card, Field, Input, SearchableSelect, Select } from "@/app/components/common/ui";
import { userTypes } from "../../constants";
import { BranchSelect } from "./BranchSelect";
import { RoleCheckboxes } from "./RoleCheckboxes";
import { TenantPicker } from "../shared/TenantPicker";
import { FormField } from "@/app/components/FormElements";

export function CreateUser({
  tenants,
  selectedId,
  setSelectedId,
  branches,
  roles,
  busy,
  createUser,
  back,
}: any) {
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="card-title font-bold">Create User</h3>
          <p className="table-data text-slate-500">
            Add a user under the selected tenant.
          </p>
        </div>
        <button
          type="button"
          onClick={back}
          className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
        >
          Back to Users
        </button>
      </div>
      <form
        onSubmit={createUser}
        className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <TenantPicker
          tenants={tenants}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
        />
        <FormField label="Name">
          <Input name="name" required placeholder="Clinic Admin" />
        </FormField>
        <FormField label="Email">
          <Input
            name="email"
            type="email"
            required
            placeholder="admin@clinic.local"
          />
        </FormField>
        <FormField label="User Type">
          <Select name="userType" defaultValue="tenant_admin">
            {userTypes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Password">
          <Input
            name="password"
            type="password"
            required
            placeholder="Minimum 8 characters"
          />
        </FormField>
        <FormField label="Mobile">
          <Input
            name="mobile"
            mobileNumber
            defaultValue=""
            placeholder="Enter patient mobile number"
          />
        </FormField>
        <BranchSelect branches={branches} />
        <FormField label="Must Change Password">
          <SearchableSelect
            name="mustChangePassword"
            searchable={false}
            // defaultValue="true"
            options={[
              { value: "true", label: "Yes" },
              { value: "false", label: "No" },
            ]}
          />
        </FormField>
        <div className="md:col-span-2 xl:col-span-3">
          <RoleCheckboxes roles={roles} selected={["tenant_admin"]} />
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3">
          <Button disabled={busy}>
            {busy ? "Creating..." : "Create User"}
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
