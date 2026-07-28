"use client";

import { useState } from "react";
import { Button, Card } from "@/app/components/common/ui";
import { AutoRoleKeyFields } from "./AutoRoleKeyFields";
import { PermissionCheckboxes } from "./PermissionCheckboxes";
import { TenantPicker } from "../shared/TenantPicker";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";

export function CreateRole({
  tenants,
  selectedId,
  setSelectedId,
  permissionCatalog,
  busy,
  createRole,
  back,
}: any) {
  const [roleName, setRoleName] = useState("");

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="card-title font-bold">Create Role</h3>
          <p className="card-desc text-slate-500">
            Add a role and select module permissions.
          </p>
        </div>
        <button
          type="button"
          onClick={back}
          className="close-button border font-bold"
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
        <AutoRoleKeyFields onNameChange={setRoleName} />
        <div className="md:col-span-2">
          <PermissionCheckboxes
            permissions={permissionCatalog}
            selected={[]}
            roleName={roleName}
          />
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button disabled={busy}>
            <ButtonLoader loading={busy}>
              {busy ? "Creating..." : "Create Role"}
            </ButtonLoader>
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
