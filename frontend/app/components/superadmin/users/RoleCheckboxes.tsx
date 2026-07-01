"use client";

import { dedupeRoleOptions, roleDisplayName } from "@/utils/superAdmin/superAdmin";

export function RoleCheckboxes({ roles, selected = [] }: any) {
  const selectedSet = new Set<string>((selected || []).map(String));
  const withTenantAdmin = roles.some((role: any) => role.key === "tenant_admin")
    ? roles
    : [
        {
          id: "tenant_admin_default",
          key: "tenant_admin",
          name: "Tenant Admin",
          permission_keys: [],
        },
        ...roles,
      ];
  const effectiveRoles = dedupeRoleOptions(withTenantAdmin, selectedSet);
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase text-slate-500">
        Role access
      </p>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {effectiveRoles.map((role: any) => (
          <label
            key={role.id}
            className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm"
          >
            <input
              name="roleKeys"
              type="checkbox"
              value={role.key}
              defaultChecked={selectedSet.has(role.key)}
              className="mt-1 h-3 w-3 lg:h-4 lg:w-4"
            />
            <span>
              <b className="text-xs lg:text-sm">{roleDisplayName(role)}</b>
              {role.is_template_locked && (
                <span className="ml-2 inline-block rounded-full bg-purple-100 px-2 py-0.5 text-[10px] lg:text-xs font-bold text-purple-700">
                  Template
                </span>
              )}
              <span className="block text-[10px] lg:text-xs text-slate-500">
                {role.permission_keys?.length
                  ? `${role.permission_keys.length} permissions`
                  : "Default admin access"}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
