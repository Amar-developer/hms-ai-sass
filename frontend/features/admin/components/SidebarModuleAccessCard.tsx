import { useState,useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { nav,roleModules } from "@/lib/navigation";
import { Card, Field,Select,StatusToast,Badge,Button } from "@/app/components/common/ui";
import { title } from "../helpers";
import { normalizeSidebarModuleMap, normalizeSidebarRole } from "@/lib/sidebarAccess";


const SIDEBAR_MODULE_OPTIONS = nav
  .map(([id, label]: any) => ({ id, label }))
  .filter((m: any) => !["superadmin", "admin", "dashboard"].includes(m.id));

interface RoleOption {
  value: string;
  label: string;
}

export function SidebarModuleAccessCard({ apiSession }: any) {
  const [map, setMap] = useState<Record<string, string[]>>({});
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [selectedRole, setSelectedRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!apiSession) return;
    Promise.all([
      apiFetch("/settings/sidebar-modules", apiSession).catch(() => ({})),
      apiFetch("/identity/roles", apiSession).catch(() => []),
    ]).then(([moduleMap, roles]: any) => {
      setMap(normalizeSidebarModuleMap(moduleMap));
      // Drive the dropdown from the tenant's own roles so the configured role
      // identity always matches the role keys carried on a user's session.
      const seen = new Set<string>();
      const options: RoleOption[] = (Array.isArray(roles) ? roles : [])
        .filter((role: any) => role?.is_active !== false && role?.key)
        .map((role: any) => ({
          value: normalizeSidebarRole(role.key),
          label: role.name || title(String(role.key).replaceAll("_", " ")),
        }))
        .filter((option: RoleOption) => {
          if (seen.has(option.value)) return false;
          seen.add(option.value);
          return true;
        });
      setRoleOptions(options);
      setSelectedRole((current) =>
        current || options[0]?.value || "",
      );
    });
  }, [apiSession?.tenantId]);

  const modulesFor = (role: string) =>
    map[role] ?? roleModules[role] ?? roleModules[normalizeSidebarRole(role)] ?? [];

  function toggle(role: string, moduleId: string) {
    const current = new Set(modulesFor(role));
    if (current.has(moduleId)) current.delete(moduleId);
    else current.add(moduleId);
    setMap({ ...map, [role]: Array.from(current) });
  }

  function resetRole(role: string) {
    const next = { ...map };
    delete next[role];
    setMap(next);
  }

  async function save() {
    if (!apiSession) return;
    setBusy(true);
    setMessage("");
    try {
      await apiFetch("/settings", apiSession, {
        method: "PUT",
        body: JSON.stringify({
          scope: "tenant",
          module: "navigation",
          key: "navigation.role_modules",
          value: map,
          actor_user_id: apiSession.user?.id,
        }),
      });
      setMessage("Sidebar module access saved. Users see changes on next login or refresh.");
    } catch (err: any) {
      setMessage(err.message || "Could not save sidebar module access.");
    } finally {
      setBusy(false);
    }
  }

  const selectedModules = new Set(modulesFor(selectedRole));
  const selectedRoleOverridden = Boolean(map[selectedRole]);
  const selectedRoleLabel =
    roleOptions.find((option) => option.value === selectedRole)?.label ||
    title(selectedRole.replaceAll("_", " "));

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div>
          <h3 className="card-title font-bold">Sidebar Module Access</h3>
          <p className="card-desc text-slate-500">
            Control which modules each role sees in the sidebar. This is separate from
            permissions. Roles left at default keep the built-in configuration.
          </p>
        </div>
        <Badge tone="blue" className="w-[20%] lg:w-[15%] px-2 py-2 rounded-lg">Role based</Badge>
      </div>
      <StatusToast message={message} onClose={() => setMessage("")} />
      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="w-full lg:max-w-xs">
              <Field label="Role">
                <Select
                  value={selectedRole}
                  onChange={(event: any) => setSelectedRole(event.target.value)}
                  disabled={roleOptions.length === 0}
                >
                  {roleOptions.length === 0 ? (
                    <option value="">No roles available</option>
                  ) : (
                    roleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))
                  )}
                </Select>
              </Field>
            </div>
            <div className="flex flex-col gap-3 rounded-xl bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between lg:min-w-[420px]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{selectedRoleLabel}</b>
                  <Badge tone={selectedRoleOverridden ? "amber" : "slate"} className="table-status">
                    {selectedRoleOverridden ? "Custom" : "Default"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedModules.size} of {SIDEBAR_MODULE_OPTIONS.length} modules visible
                </p>
              </div>
              {selectedRoleOverridden && (
                <button
                  type="button"
                  onClick={() => resetRole(selectedRole)}
                  className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Reset to default
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h4 className="text-xs lg:text-sm font-bold">Modules Visible</h4>
              <p className="text-[10px] lg:text-xs text-slate-500">
                Toggle sidebar modules for the selected role.
              </p>
            </div>
            <Badge tone="blue" className="normal-badge">{selectedRoleLabel}</Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {SIDEBAR_MODULE_OPTIONS.map((m: any) => {
              const on = selectedModules.has(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(selectedRole, m.id)}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <Button onClick={save} disabled={busy || !selectedRole} className="mt-4 save-button ">
        {busy ? "Saving..." : "Save Sidebar Access"}
      </Button>
    </Card>
  );
}
