import { Actions } from "../components/Actions";
import { Header } from "../components/Header";
import { Card, Input, SearchableSelect } from "@/app/components/common/ui";
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
  const locked = isLocked(role);

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
            disabled={locked}
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
              disabled={locked}
              searchable={false}
              options={[
                { value: "true", label: "Active" },
                { value: "false", label: "Inactive" },
              ]}
            />
          </FormField>
        )}
        <div className="md:col-span-2">
          {locked && (
            <p className="mb-3 rounded-xl bg-violet-50 px-4 py-3 text-xs font-semibold text-violet-800">
              This role comes from a global template. You can customize its
              permissions for this tenant, but its name, key, and status remain
              controlled by the template.
            </p>
          )}
          <PermissionCheckboxes
            permissions={permissions}
            selected={role?.permission_keys || []}
            disabled={false}
            roleName={roleName || role?.name}
          />
        </div>
        <Actions
          busy={busy}
          back={back}
          disabled={false}
          label={role ? "Save Role" : "Create Role"}
        />
      </form>
    </Card>
  );
}
