"use client";

import { Button, Card } from "@/app/components/common/ui";
import { AutoRoleKeyFields } from "./AutoRoleKeyFields";
import { PermissionCheckboxes } from "./PermissionCheckboxes";
import { TenantPicker } from "../shared/TenantPicker";

export function CreateRole({
  tenants,
  selectedId,
  setSelectedId,
  permissionCatalog,
  busy,
  createRole,
  back,
}: any) {
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-base lg:text-lg font-bold">Create Role</h3>
          <p className="text-xs lg:text-sm text-slate-500">
            Add a role and select module permissions.
          </p>
        </div>
        <button
          type="button"
          onClick={back}
          className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
        >
          Back to Roles
        </button>
      </div>
      <form onSubmit={createRole} className="mt-4 grid gap-3 md:grid-cols-2">
        <TenantPicker
          tenants={tenants}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
        />
        <AutoRoleKeyFields />
        <div className="md:col-span-2">
          <PermissionCheckboxes permissions={permissionCatalog} selected={[]} />
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button disabled={busy}>
            {busy ? "Creating..." : "Create Role"}
          </Button>
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
