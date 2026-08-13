"use client";

import { Button, Card, Field, Select } from "@/app/components/common/ui";
import { AutoRoleKeyFields } from "./AutoRoleKeyFields";
import { PermissionCheckboxes } from "./PermissionCheckboxes";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";

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
          className="close-button"
        >
          Back to Roles
        </button>
      </Card>
    );
  return (
    <Card className="mt-3">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="card-title font-bold">Edit Role</h3>
          <p className="card-desc text-slate-500">{role.key}</p>
        </div>
        <button
          type="button"
          onClick={back}
          className="close-button"
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
          <Button disabled={busy} className='save-button'>
            <ButtonLoader loading={busy}>
              {busy ? "Saving..." : "Save Role"}
            </ButtonLoader>
          </Button>
          <button
            type="button"
            onClick={back}
            className="close-button"
          >
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
