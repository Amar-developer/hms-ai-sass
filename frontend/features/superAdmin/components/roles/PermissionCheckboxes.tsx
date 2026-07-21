"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/app/components/common/ui";
import { formatTitle, permissionModuleTitle } from "../../helpers";

export function PermissionCheckboxes({ permissions, selected }: any) {
  const catalog = [...(permissions || [])];
  const grouped = catalog.reduce((acc: any, permission: any) => {
    acc[permission.module] = [...(acc[permission.module] || []), permission];
    return acc;
  }, {});
  const selectedFingerprint = [...(selected || [])]
    .map(String)
    .sort()
    .join("\u0000");
  const [selectedSet, setSelectedSet] = useState<Set<string>>(
    () => new Set(selected || []),
  );
  useEffect(() => {
    setSelectedSet(new Set(selected || []));
    // The stable fingerprint intentionally represents the selected array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFingerprint]);
  const moduleLabel = (module: string) =>
    grouped[module][0]?.module_label || permissionModuleTitle(module);
  const modules = Object.keys(grouped).sort((a, b) =>
    moduleLabel(a).localeCompare(moduleLabel(b)),
  );
  const includesPlatformPermissions = catalog.some((permission: any) =>
    String(permission.key || "").startsWith("platform."),
  );
  const labelFor = (permission: any) =>
    formatTitle(String(permission.action || "manage").replaceAll("_", " "));

  function togglePermission(permissionKey: string, checked: boolean) {
    setSelectedSet((current) => {
      const next = new Set(current);
      if (checked) next.add(permissionKey);
      else next.delete(permissionKey);
      return next;
    });
  }

  return (
    <div>
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h4 className="card-title font-bold">Module Permissions</h4>
          <p className="card-desc text-slate-500">
            Enable the exact workflow actions this role may use. A sidebar
            module requires Read plus at least one additional action. Manage grants
            the module's administrative workflows where supported. This catalog
            contains {modules.length} modules and {catalog.length} actions.
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {includesPlatformPermissions
              ? "Primary tenant scope: platform and tenant permissions are available."
              : "Customer tenant scope: tenant permissions only; platform permissions are excluded."}
          </p>
        </div>
        <Badge
          tone="slate"
          className="normal-badge whitespace-nowrap"
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
                <h5 className="font-bold">{moduleLabel(module)}</h5>
                <p className="mt-0.5 text-[10px] font-medium text-slate-400">
                  {module}
                </p>
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
                      checked={selectedSet.has(permission.key)}
                      onChange={(event) =>
                        togglePermission(permission.key, event.target.checked)
                      }
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
