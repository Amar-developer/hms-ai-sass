"use client";

import { Button, Card, Field, Input, Select } from "@/components/common/ui";
import { userTypes } from "../../../utils/superAdmin/constants";
import { BranchSelect } from "./BranchSelect";
import { RoleCheckboxes } from "./RoleCheckboxes";
import { TenantPicker } from "../shared/TenantPicker";

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
          <h3 className="text-base lg:text-lg font-bold">Create User</h3>
          <p className="text-xs lg:text-sm text-slate-500">
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
        <Field label="Name">
          <Input name="name" required placeholder="Clinic Admin" className='rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm'/>
        </Field>
        <Field label="Email">
          <Input
            name="email"
            type="email"
            required
            placeholder="admin@clinic.local"
            className='rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm'
          />
        </Field>
        <Field label="User Type">
          <Select name="userType" defaultValue="tenant_admin" className='rounded-lg px-2 py-1.5 lg:px-4 lg:py-3 text-xs lg:text-sm'>
            {userTypes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Password">
          <Input
            name="password"
            type="password"
            required
            placeholder="Minimum 8 characters"
            className='rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm'
          />
        </Field>
        <Field label="Mobile">
          <Input name="mobile" className='rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm'/>
        </Field>
        <BranchSelect branches={branches} />
        <Field label="Must Change Password">
          <Select name="mustChangePassword" defaultValue="true">
            <option value="true">Yes</option>
            <option value="false">No</option>
          </Select>
        </Field>
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
