"use client";

import { Badge } from "@/app/components/common/ui";
import { formatTitle, permissionModuleTitle } from "../../helpers";

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
          <h4 className="card-title font-bold">Module Permissions</h4>
          <p className="card-desc text-slate-500">
            Enable the exact workflow actions this role may use. Manage grants
            the module's administrative workflows where supported.
          </p>
        </div>
        <Badge
          tone="slate"
          className="rounded-lg px-2 py-2 lg:px-3 lg:py-2 text-xs lg:text-sm w-[15%] lg:w-[15%]"
        >
          {selectedSet.size} selected
        </Badge>
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
              </div>
              <p className="text-xs text-slate-500">
                {grouped[module].length} permissions
              </p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {grouped[module]
                .sort((a: any, b: any) => a.key.localeCompare(b.key))
                .map((permission: any) => (
                  <label
                    key={permission.key}
                    className="flex items-start gap-2 rounded-xl bg-slate-50 p-1.5 text-sm"
                    title={permission.description || permission.key}
                  >
                    <input
                      type="checkbox"
                      name="permissionKeys"
                      value={permission.key}
                      defaultChecked={selectedSet.has(permission.key)}
                      className="mt-1 h-3.5 w-3.5"
                    />
                    <span>
                      <span className="font-semibold text-xs">
                        {labelFor(permission)}
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
