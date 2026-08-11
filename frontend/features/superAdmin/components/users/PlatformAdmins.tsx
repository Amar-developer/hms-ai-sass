"use client";

import { useEffect, useState } from "react";

import { Badge, Card, Input } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { apiFetch } from "@/lib/api";
import { displayDateTime } from "@/utils/helper";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import { TableSkeleton } from "@/app/components/common/loader/TableSkeleton";

export function PlatformAdmins({ apiSession, busy, setBusy, setMessage }: any) {
  const [admins, setAdmins] = useState<any[]>([]);
  const [statusPassword, setStatusPassword] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!apiSession) return;
    setLoading(true);
    try {
      setAdmins(await apiFetch("/identity/super-admins", apiSession));
    } catch (error: any) {
      setMessage(error.message || "Could not load platform administrators.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSession?.user?.id]);

  async function invite(event: any) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch(
        "/identity/super-admins",
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            name: data.get("name"),
            email: data.get("email"),
            mobile: data.get("mobile") || null,
            temporary_password: data.get("temporaryPassword"),
            current_password: data.get("currentPassword"),
            reason: data.get("reason"),
          }),
        },
      );
      setAdmins((rows) => [
        created,
        ...rows.filter((row) => row.id !== created.id),
      ]);
      form.reset();
      setMessage(`Super admin created: ${created.name}`);
    } catch (error: any) {
      setMessage(error.message || "Could not create super admin.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(admin: any) {
    if (!statusPassword || statusReason.trim().length < 3) {
      setMessage("Current password and a reason are required for status changes.");
      return;
    }
    const action = admin.is_active ? "deactivate" : "reactivate";
    if (!window.confirm(`${action} ${admin.name}'s super admin access?`)) return;
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/identity/super-admins/${encodeURIComponent(admin.id)}/status`,
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            is_active: !admin.is_active,
            current_password: statusPassword,
            reason: statusReason,
          }),
        },
      );
      setAdmins((rows) =>
        rows.map((row) => (row.id === updated.id ? updated : row)),
      );
      setStatusPassword("");
      setStatusReason("");
      setMessage(`Super admin ${updated.is_active ? "activated" : "deactivated"}.`);
    } catch (error: any) {
      setMessage(error.message || `Could not ${action} super admin.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="mt-3">
        <h3 className="card-title font-bold">Add Root Super Admin</h3>
        <p className="card-desc mt-1 text-slate-500">
          Creates a root-level platform owner under the primary tenant. The
          temporary password must be changed on first login.
        </p>
        <form
          className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
          onSubmit={invite}
        >
          <FormField label="Name">
            <Input name="name" required placeholder="Platform administrator" />
          </FormField>
          <FormField label="Company email">
            <Input name="email" type="email" required placeholder="admin@company.com" />
          </FormField>
          <FormField label="Mobile">
            <Input name="mobile" placeholder="Controlled company number" />
          </FormField>
          <FormField label="Temporary password">
            <Input
              name="temporaryPassword"
              type="password"
              minLength={12}
              required
              autoComplete="new-password"
            />
          </FormField>
          <FormField label="Your current password">
            <Input
              name="currentPassword"
              type="password"
              minLength={8}
              required
              autoComplete="current-password"
            />
          </FormField>
          <FormField label="Access reason">
            <Input name="reason" minLength={3} required placeholder="Operational continuity" />
          </FormField>
          <div className="md:col-span-2 xl:col-span-3">
            <button
              className="rounded-lg bg-slate-950 px-4 py-3 font-bold text-white disabled:opacity-50"
              disabled={busy}
            >
              <ButtonLoader loading={busy}>
                {busy ? "Creating..." : "Create root Super Admin"}
              </ButtonLoader>
            </button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-start">
          <div>
            <h3 className="card-title font-bold">Root Super Administrators</h3>
            <p className="card-desc text-slate-500">
              Root access is global. Use Platform Admin or tenant roles for routine work.
            </p>
          </div>
          <button
            className="rounded-lg border px-3 py-2 font-bold"
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <FormField label="Your current password for status changes">
            <Input
              type="password"
              value={statusPassword}
              onChange={(event: any) => setStatusPassword(event.target.value)}
              autoComplete="current-password"
            />
          </FormField>
          <FormField label="Status-change reason">
            <Input
              value={statusReason}
              onChange={(event: any) => setStatusReason(event.target.value)}
              placeholder="Required for audit history"
            />
          </FormField>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Administrator</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last login</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && admins.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-0">
                    <TableSkeleton />
                  </td>
                </tr>
              )}
              {!loading && admins.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-slate-500">
                    No platform administrators found.
                  </td>
                </tr>
              )}
              {admins.map((admin) => (
                <tr key={admin.id}>
                  <td className="px-4 py-3 font-bold">{admin.name}</td>
                  <td className="px-4 py-3">{admin.email}</td>
                  <td className="px-4 py-3">
                    <Badge tone={admin.is_active ? "green" : "red"} className="normal-badge">
                      {admin.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {admin.last_login_at ? displayDateTime(admin.last_login_at) : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      className="rounded-lg border px-3 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={busy || admin.id === apiSession.user.id}
                      onClick={() => void changeStatus(admin)}
                    >
                      {admin.id === apiSession.user.id
                        ? "Current account"
                        : admin.is_active
                          ? "Deactivate"
                          : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
