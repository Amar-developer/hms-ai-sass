"use client";

import { Button, Card, Field, Select } from "@/app/components/common/ui";
import { AutoRoleKeyFields } from "./AutoRoleKeyFields";
import { PermissionCheckboxes } from "./PermissionCheckboxes";

export function EditRole({
  role,
  permissionCatalog,
  busy,
  updateRole,
  back,
}: any) {
  if (!role)
    return (
      <Card>
        <h3 className="text-lg font-bold">Role not found</h3>
        <button
          type="button"
          onClick={back}
          className="mt-4 rounded-2xl border px-4 py-3 text-sm font-bold"
        >
          Back to Roles
        </button>
      </Card>
    );
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-bold">Edit Role</h3>
          <p className="text-xs lg:text-sm text-slate-500">{role.key}</p>
        </div>
        <button
          type="button"
          onClick={back}
          className="rounded-lg border px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm font-bold"
        >
          Back to Roles
        </button>
      </div>
      <form onSubmit={updateRole} className="mt-4 grid gap-3 md:grid-cols-2">
        <AutoRoleKeyFields role={role} />
        <Field label="Status">
          <Select
            name="isActive"
            defaultValue={String(role.is_active)}
            className="rounded-lg px-2 py-1.5 lg:px-4 lg:py-3 text-xs lg:text-sm
"
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </Field>
        <div className="md:col-span-2">
          <input type="hidden" name="replacePermissions" value="true" />
          <PermissionCheckboxes
            permissions={permissionCatalog}
            selected={role.permission_keys || []}
            roleName={role.name}
          />
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button disabled={busy}>{busy ? "Saving..." : "Save Role"}</Button>
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
