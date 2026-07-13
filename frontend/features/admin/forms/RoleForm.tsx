import { Actions } from "../components/Actions";
import { Header } from "../components/Header";
import { Card,Input, SearchableSelect  } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { roleKeyFromName } from "@/utils/helper";
import { useState } from "react";
import { isLocked } from "../helpers";
import { PermissionCheckboxes } from "./PermissionCheckboxes";

export function RoleForm({
  title,
  role,
  permissions,
  busy,
  onSubmit,
  back,
}: any) {
  const [roleName, setRoleName] = useState(role?.name || "");
  const generatedKey = roleKeyFromName(roleName || role?.key || "");
  return (
    <Card>
      <Header
        title={title}
        subtitle={role?.key || "Select permissions by module action."}
        back={back}
      />
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
        <FormField label="Role Name" required>
          <Input
            name="name"
            value={roleName}
            onChange={(event: any) => setRoleName(event.target.value)}
            required
            disabled={isLocked(role)}
            placeholder="Enter role name"
          />
        </FormField>
        <input type="hidden" name="key" value={generatedKey} />
        <div className="rounded-2xl bg-slate-50 p-4 text-sm">
          <p className="text-xs font-bold uppercase text-slate-500">
            Generated Role Key
          </p>
          <p className="mt-1 font-bold text-slate-800">
            {generatedKey || "Enter role name"}
          </p>
        </div>
        {role && (
          <FormField label="Status">
            <SearchableSelect
              name="isActive"
              value={String(role.is_active)}
              disabled={isLocked(role)}
              searchable={false}
              options={[
                { value: "true", label: "Active" },
                { value: "false", label: "Inactive" },
              ]}
            />
          </FormField>
        )}
        <div className="md:col-span-2">
          <PermissionCheckboxes
            permissions={permissions}
            selected={role?.permission_keys || []}
            disabled={isLocked(role)}
          />
        </div>
        <Actions
          busy={busy}
          back={back}
          disabled={isLocked(role)}
          label={role ? "Save Role" : "Create Role"}
        />
      </form>
    </Card>
  );
}
