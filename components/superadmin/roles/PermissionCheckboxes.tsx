"use client";

import { Badge } from "@/components/common/ui";
import { requiredRolePermissions } from "../../../utils/superAdmin/constants";
import { formatTitle, permissionModuleTitle } from "../../../utils/superAdmin/superAdmin";

export function PermissionCheckboxes({ permissions, selected }: any) {
  const catalog = [...permissions];
  for (const permission of requiredRolePermissions) {
    if (!catalog.some((item: any) => item.key === permission.key))
      catalog.push(permission);
  }
  const grouped = catalog.reduce((acc: any, permission: any) => {
    acc[permission.module] = [...(acc[permission.module] || []), permission];
    return acc;
  }, {});
  const buckets = [
    ["manage", "Manage", ["manage", "sign", "approve", "export"]],
    ["create", "Create", ["create"]],
    ["read", "Read", ["read", "view"]],
    ["edit", "Edit", ["edit", "write"]],
    ["delete", "Delete", ["delete", "cancel"]],
  ];
  const modules = Object.keys(grouped).sort();
  const selectedSet = new Set(selected || []);
  const bucketFor = (permission: any) =>
    buckets.find((bucket: any) => bucket[2].includes(permission.action)) ||
    buckets[0];
  const labelFor = (permission: any) =>
    formatTitle(String(permission.action || "manage").replaceAll("_", " "));

  return (
    <div>
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h4 className="font-bold">Module Permissions</h4>
          <p className="text-sm text-slate-500">
            Enable permissions by module. Use Manage for full workflow/action
            access, then Create, Read, Edit, and Delete as needed.
          </p>
        </div>
        <Badge tone="slate">{selectedSet.size} selected</Badge>
      </div>
      <div className="mt-3 grid gap-4 xl:grid-cols-2">
        {modules.map((module) => (
          <div
            key={module}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
              <div>
                <h5 className="font-bold">{permissionModuleTitle(module)}</h5>
                <p className="text-xs text-slate-500">
                  {grouped[module].length} permissions
                </p>
              </div>
              <Badge tone="slate">Module</Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {buckets.map((bucket: any) => {
                const bucketPermissions = grouped[module]
                  .filter(
                    (permission: any) =>
                      bucketFor(permission)[0] === bucket[0],
                  )
                  .sort((a: any, b: any) => a.key.localeCompare(b.key));
                return (
                  <div
                    key={`${module}-${bucket[0]}`}
                    className="rounded-2xl bg-slate-50 p-3"
                  >
                    <p className="mb-2 text-xs font-bold uppercase text-slate-500">
                      {bucket[1]}
                    </p>
                    <div className="grid gap-2">
                      {bucketPermissions.length ? (
                        bucketPermissions.map((permission: any) => (
                          <label
                            key={permission.key}
                            className="flex items-start gap-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              name="permissionKeys"
                              value={permission.key}
                              defaultChecked={selectedSet.has(permission.key)}
                              className="mt-1 h-4 w-4"
                            />
                            <span>
                              <span className="font-semibold">
                                {labelFor(permission)}
                              </span>
                              <span className="block break-all text-xs text-slate-400">
                                {permission.key}
                              </span>
                            </span>
                          </label>
                        ))
                      ) : (
                        <span className="text-xs text-slate-300">
                          No access
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
