import { Badge } from "@/app/components/common/ui";
import { permissionModuleTitle, title } from "../helpers";

const STANDARD_ACTIONS = [
  { key: "read", label: "Read", actions: ["read"] },
  { key: "write", label: "Create / Write", actions: ["create", "write"] },
  { key: "edit", label: "Edit", actions: ["edit"] },
  { key: "delete", label: "Delete", actions: ["delete"] },
  { key: "manage", label: "Manage", actions: ["manage"] },
] as const;

const STANDARD_ACTION_NAMES = new Set(
  STANDARD_ACTIONS.flatMap((column) => [...column.actions]),
);

function actionLabel(permission: any) {
  return title(
    String(permission.action || "manage")
      .replaceAll("_", " ")
      .replaceAll(".", " "),
  );
}

function PermissionOption({ permission, selectedSet, disabled }: any) {
  return (
    <label
      className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-700"
      title={permission.description || permission.key}
    >
      <input
        name="permissionKeys"
        type="checkbox"
        value={permission.key}
        defaultChecked={selectedSet.has(permission.key)}
        disabled={disabled}
        className="h-4 w-4 shrink-0 rounded border-slate-300"
      />
      <span className="truncate">{actionLabel(permission)}</span>
    </label>
  );
}

export function PermissionCheckboxes({
  permissions,
  selected,
  disabled,
  roleName,
}: any) {
  const catalog = [...(permissions || [])];
  const grouped = catalog.reduce((acc: any, permission: any) => {
    acc[permission.module] = [...(acc[permission.module] || []), permission];
    return acc;
  }, {});
  const modules = Object.keys(grouped).sort((a, b) =>
    permissionModuleTitle(a).localeCompare(permissionModuleTitle(b)),
  );
  const selectedSet = new Set(selected || []);

  return (
    <div>
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h4 className="card-title font-bold">
            {roleName ? `${roleName} Permissions` : "Role Permissions"}
          </h4>
          <p className="card-desc text-slate-500">
            Assign module access by action. Create and legacy Write permissions
            share one column; module-specific workflow actions remain separate.
            A sidebar module appears only when Read and at least one additional
            action are selected.
            {` ${modules.length} modules and ${catalog.length} permission actions are available.`}
          </p>
        </div>
        <Badge tone="slate" className="normal-badge whitespace-nowrap">
          {selectedSet.size} selected
        </Badge>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[1040px] table-fixed text-left text-xs">
          <thead className="bg-slate-100 uppercase text-slate-600">
            <tr>
              <th className="w-[210px] px-4 py-3">Module</th>
              {STANDARD_ACTIONS.map((column) => (
                <th key={column.key} className="w-[130px] px-3 py-3">
                  {column.label}
                </th>
              ))}
              <th className="px-3 py-3">Other Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {modules.map((module) => {
              const modulePermissions = [...grouped[module]].sort(
                (a: any, b: any) => a.key.localeCompare(b.key),
              );
              const specialPermissions = modulePermissions.filter(
                (permission: any) =>
                  !STANDARD_ACTION_NAMES.has(permission.action),
              );
              return (
                <tr key={module} className="align-top hover:bg-slate-50">
                  <th className="px-4 py-3 text-sm font-bold text-slate-900">
                    {grouped[module][0]?.module_label ||
                      permissionModuleTitle(module)}
                    <span className="mt-0.5 block break-all text-[10px] font-medium text-slate-400">
                      {module}
                    </span>
                  </th>
                  {STANDARD_ACTIONS.map((column) => {
                    const actionPermissions = modulePermissions.filter(
                      (permission: any) =>
                        (column.actions as readonly string[]).includes(
                          permission.action,
                        ),
                    );
                    return (
                      <td key={column.key} className="px-3 py-3">
                        {actionPermissions.length ? (
                          <div className="space-y-2">
                            {actionPermissions.map((permission: any) => (
                              <PermissionOption
                                key={permission.key}
                                permission={permission}
                                selectedSet={selectedSet}
                                disabled={disabled}
                              />
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3">
                    {specialPermissions.length ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {specialPermissions.map((permission: any) => (
                          <PermissionOption
                            key={permission.key}
                            permission={permission}
                            selectedSet={selectedSet}
                            disabled={disabled}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
