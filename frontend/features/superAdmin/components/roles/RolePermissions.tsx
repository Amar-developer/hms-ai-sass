"use client";

import { Button, Card } from "@/app/components/common/ui";
import { PermissionCheckboxes } from "./PermissionCheckboxes";

export function RolePermissions({
  role,
  roles,
  permissionCatalog,
  onRoleChange,
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
          <h3 className="text-lg font-bold">Role Permissions</h3>
          <p className="text-sm text-slate-500">
            {role.name} · {role.key}
          </p>
        </div>
        <button
          type="button"
          onClick={back}
          className="rounded-2xl border px-4 py-3 text-sm font-bold"
        >
          Back to Roles
        </button>
      </div>
      <form onSubmit={updateRole} className="mt-4 space-y-4">
        <input type="hidden" name="name" value={role.name} />
        <input type="hidden" name="key" value={role.key} />
        <input type="hidden" name="isActive" value={String(role.is_active)} />
        <input type="hidden" name="replacePermissions" value="true" />
        <PermissionCheckboxes
          permissions={permissionCatalog}
          selected={role.permission_keys || []}
          roleName={role.name}
          roleId={role.id}
          roleOptions={roles}
          onRoleChange={onRoleChange}
          showHeading={false}
        />
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy}>
            {busy ? "Saving..." : "Save Permissions"}
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
