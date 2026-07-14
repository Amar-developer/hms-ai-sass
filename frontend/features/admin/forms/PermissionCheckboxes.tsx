import { Badge } from "@/app/components/common/ui";
import { permissionModuleTitle, title } from "../helpers";

export function PermissionCheckboxes({ permissions, selected, disabled }: any) {
  const catalog = [...(permissions || [])];
  const grouped = catalog.reduce((acc: any, permission: any) => {
    acc[permission.module] = [...(acc[permission.module] || []), permission];
    return acc;
  }, {});
  const modules = Object.keys(grouped).sort();
  const selectedSet = new Set(selected || []);
  const labelFor = (permission: any) =>
    title(
      String(permission.action || "manage")
        .replaceAll("_", " ")
        .replaceAll(".", " "),
    );
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
        <Badge tone="slate" className="w-[20%] lg:w-[15%] normal-badge">
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
              <div className="flex justify-between  w-full">
                <h5 className="text-base lg:text-sm font-bold">
                  {permissionModuleTitle(module)}
                </h5>
                <p className="text-xs text-slate-500">
                  {grouped[module].length} permissions
                </p>
              </div>
              {/* <Badge tone="slate" className="rounded-lg py-2 px-2">
                Module
              </Badge> */}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {grouped[module]
                .sort((a: any, b: any) => a.key.localeCompare(b.key))
                .map((permission: any) => (
                  <label
                    key={permission.key}
                    className="flex items-start gap-2  lg:text-[11px]"
                    title={permission.description || permission.key}
                  >
                    <input
                      name="permissionKeys"
                      type="checkbox"
                      value={permission.key}
                      defaultChecked={selectedSet.has(permission.key)}
                      disabled={disabled}
                      className="mt-1 h-3 w-3"
                    />
                    <span>
                      <span className="text-sm lg:text-[12px] font-semibold">
                        {labelFor(permission)}
                      </span>
                      {/* <span className="block break-all text-[11px] text-slate-400">
                                {permission.key}
                              </span> */}
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
