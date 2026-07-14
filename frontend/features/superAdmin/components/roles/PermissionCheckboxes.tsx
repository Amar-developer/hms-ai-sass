"use client";

import { Badge } from "@/app/components/common/ui";
import { formatTitle,permissionModuleTitle } from "../../helpers";

export function PermissionCheckboxes({ permissions, selected }: any) {
  const catalog = [...(permissions || [])];
  const grouped = catalog.reduce((acc: any, permission: any) => {
    acc[permission.module] = [...(acc[permission.module] || []), permission];
    return acc;
  }, {});
  const modules = Object.keys(grouped).sort();
  const selectedSet = new Set(selected || []);
  const labelFor = (permission: any) =>
    formatTitle(String(permission.action || "manage").replaceAll("_", " "));

  return (
    <div>
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h4 className="text-base lg:text-lg font-bold">Module Permissions</h4>
          <p className="text-xs lg:text-sm text-slate-500">
            Enable the exact workflow actions this role may use. Manage grants
            the module's administrative workflows where supported.
          </p>
        </div>
        <Badge tone="slate" className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm w-[15%] lg:w-[15%]">{selectedSet.size} selected</Badge>
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
              <Badge tone="slate" className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm">Module</Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {grouped[module]
                .sort((a: any, b: any) => a.key.localeCompare(b.key))
                .map((permission: any) => (
                  <label
                    key={permission.key}
                    className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm"
                    title={permission.description || permission.key}
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
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
