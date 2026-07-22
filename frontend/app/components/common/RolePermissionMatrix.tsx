"use client";

import { useEffect, useMemo, useState } from "react";

type Permission = {
  key: string;
  module: string;
  module_label?: string;
  action?: string;
  description?: string;
};

type RolePermissionMatrixProps = {
  permissions?: Permission[];
  selected?: string[];
  roleName?: string;
  roleId?: string;
  roleOptions?: Array<{ id: string; name: string; key?: string }>;
  onRoleChange?: (roleId: string) => void;
  disabled?: boolean;
  description?: string;
  scopeMessage?: string;
  showHeading?: boolean;
};

function humanize(value: string) {
  return String(value || "")
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function RolePermissionMatrix({
  permissions = [],
  selected = [],
  roleName,
  roleId,
  roleOptions = [],
  onRoleChange,
  disabled = false,
  description,
  scopeMessage,
  showHeading = true,
}: RolePermissionMatrixProps) {
  const selectedFingerprint = [...selected].map(String).sort().join("\u0000");
  const [selectedSet, setSelectedSet] = useState(() => new Set(selected));
  const [moduleFilter, setModuleFilter] = useState("");

  useEffect(() => {
    setSelectedSet(new Set(selected));
    // The fingerprint represents the selected list without depending on its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFingerprint]);

  const rows = useMemo(() => {
    const grouped = permissions.reduce<Record<string, Permission[]>>(
      (result, permission) => {
        result[permission.module] = [
          ...(result[permission.module] || []),
          permission,
        ];
        return result;
      },
      {},
    );

    return Object.entries(grouped)
      .map(([module, modulePermissions]) => ({
        module,
        label: modulePermissions[0]?.module_label || humanize(module),
        permissions: [...modulePermissions].sort((left, right) =>
          String(left.action || left.key).localeCompare(
            String(right.action || right.key),
          ),
        ),
      }))
      .filter((row) =>
        `${row.label} ${row.module}`
          .toLowerCase()
          .includes(moduleFilter.trim().toLowerCase()),
      )
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [moduleFilter, permissions]);

  function togglePermission(key: string, checked: boolean) {
    setSelectedSet((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  return (
    <section aria-label="Role permissions">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {showHeading ? (
            <h4 className="card-title font-bold">Role Permissions</h4>
          ) : null}
          <p className="card-desc text-slate-500">
            {description ||
              "Set the actions this role can perform for each module type."}
          </p>
          {scopeMessage ? (
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {scopeMessage}
            </p>
          ) : null}
        </div>
        <span className="normal-badge whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 font-bold text-slate-600">
          {selectedSet.size} selected
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex min-w-[760px] gap-2 border-b border-slate-200 px-3 py-2">
          <label className="sr-only" htmlFor="permission-module-filter">
            Module Type
          </label>
          <input
            id="permission-module-filter"
            type="search"
            value={moduleFilter}
            onChange={(event) => setModuleFilter(event.target.value)}
            placeholder="Module Type"
            className="w-52 rounded-lg border-0 bg-slate-100 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
          />
          {roleOptions.length && onRoleChange ? (
            <select
              aria-label="Role"
              value={roleId || ""}
              onChange={(event) => onRoleChange(event.target.value)}
              className="min-w-52 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
            >
              {roleOptions.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="min-w-52 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 shadow-inner">
              {roleName || "New Role"}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[820px] px-4">
            <div className="grid grid-cols-[220px_210px_1fr] gap-5 rounded-xl bg-slate-100 px-2 py-3 text-sm font-bold text-slate-800">
              <span>Module Type</span>
              <span>Role</span>
              <span>Permissions</span>
            </div>

            <div className="divide-y divide-slate-200">
              {rows.map((row) => (
                <div
                  key={row.module}
                  className="grid grid-cols-[220px_210px_1fr] gap-5 px-2 py-5"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {row.label}
                    </p>
                    <p className="mt-1 break-all text-[10px] font-medium text-slate-400">
                      {row.module}
                    </p>
                  </div>
                  <p className="text-sm text-slate-800">
                    {roleName || "New Role"}
                  </p>
                  <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                    {row.permissions.map((permission) => {
                      const action = humanize(permission.action || "manage");
                      return (
                        <label
                          key={permission.key}
                          title={permission.description || permission.key}
                          className="flex min-w-0 items-center gap-2 text-sm text-slate-800"
                        >
                          <input
                            type="checkbox"
                            name="permissionKeys"
                            value={permission.key}
                            checked={selectedSet.has(permission.key)}
                            disabled={disabled}
                            onChange={(event) =>
                              togglePermission(
                                permission.key,
                                event.target.checked,
                              )
                            }
                            className="h-4 w-4 shrink-0 rounded border-slate-300 accent-slate-900"
                          />
                          <span className="truncate">{action}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              {!rows.length ? (
                <p className="px-2 py-8 text-center text-sm text-slate-500">
                  No module types match this search.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
