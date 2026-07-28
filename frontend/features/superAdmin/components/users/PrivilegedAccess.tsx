"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, ShieldCheck, UserRoundCog } from "lucide-react";

import { Badge, Card, Input } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { apiFetch } from "@/lib/api";
import { displayDateTime } from "@/utils/helper";
import { PlatformAdmins } from "./PlatformAdmins";

type Options = {
  platform_permission_keys: string[];
  support_permission_keys: string[];
  maximum_support_duration_minutes: number;
};

type PrivilegedAccount = {
  id: string;
  name: string;
  email: string;
  user_type: "platform_admin" | "support_admin";
  is_active: boolean;
  permissions?: string[];
};

type SupportGrant = {
  id: string;
  tenant_id: string;
  tenant_name?: string;
  user_id: string;
  user_name?: string;
  permission_keys: string[];
  reason: string;
  expires_at: string;
  status: "scheduled" | "active" | "expired" | "revoked";
};

const permissionLabel = (key: string) =>
  key
    .split(".")
    .map((part) => part.replaceAll("_", " "))
    .join(" / ");

function PermissionGrid({
  values,
  selected,
  onChange,
}: {
  values: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {values.map((key) => (
        <label
          key={key}
          className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"
        >
          <input
            type="checkbox"
            checked={selected.includes(key)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, key]
                  : selected.filter((value) => value !== key),
              )
            }
          />
          <span className="capitalize">{permissionLabel(key)}</span>
        </label>
      ))}
    </div>
  );
}

export function PrivilegedAccess({
  apiSession,
  tenants,
  switchTenant,
  busy,
  setBusy,
  setMessage,
}: any) {
  const isRoot = Boolean(apiSession?.user?.is_super_admin);
  const isSupport = apiSession?.user?.user_type === "support_admin";
  const [options, setOptions] = useState<Options>({
    platform_permission_keys: [],
    support_permission_keys: [],
    maximum_support_duration_minutes: 480,
  });
  const [accounts, setAccounts] = useState<PrivilegedAccount[]>([]);
  const [grants, setGrants] = useState<SupportGrant[]>([]);
  const [accountType, setAccountType] = useState<
    "platform_admin" | "support_admin"
  >("platform_admin");
  const [accountPermissions, setAccountPermissions] = useState<string[]>([]);
  const [grantPermissions, setGrantPermissions] = useState<string[]>([]);
  const [editablePermissions, setEditablePermissions] = useState<
    Record<string, string[]>
  >({});

  async function load() {
    if (!apiSession) return;
    setBusy(true);
    try {
      const [optionRows, grantRows] = await Promise.all([
        apiFetch<Options>("/identity/privileged-access/options", apiSession),
        apiFetch<SupportGrant[]>(
          "/identity/support-access-grants",
          apiSession,
        ),
      ]);
      setOptions(optionRows);
      setGrants(grantRows);
      if (isRoot) {
        const accountRows = await apiFetch<PrivilegedAccount[]>(
          "/identity/privileged-accounts",
          apiSession,
        );
        setAccounts(accountRows);
        setEditablePermissions(
          Object.fromEntries(
            accountRows.map((account) => [
              account.id,
              account.permissions || [],
            ]),
          ),
        );
      }
    } catch (error: any) {
      setMessage(error.message || "Could not load privileged access.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSession?.user?.id]);

  const supportAccounts = useMemo(
    () =>
      accounts.filter(
        (account) => account.user_type === "support_admin" && account.is_active,
      ),
    [accounts],
  );
  const customerTenants = (tenants || []).filter(
    (tenant: any) => !tenant.is_primary && tenant.status !== "suspended",
  );

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      await apiFetch("/identity/privileged-accounts", apiSession, {
        method: "POST",
        body: JSON.stringify({
          account_type: accountType,
          name: data.get("name"),
          email: data.get("email"),
          mobile: data.get("mobile") || null,
          temporary_password: data.get("temporaryPassword"),
          current_password: data.get("currentPassword"),
          permission_keys:
            accountType === "platform_admin" ? accountPermissions : [],
          reason: data.get("reason"),
        }),
      });
      form.reset();
      setAccountPermissions([]);
      setMessage("Privileged account created.");
      await load();
    } catch (error: any) {
      setMessage(error.message || "Could not create privileged account.");
    } finally {
      setBusy(false);
    }
  }

  async function updateAccount(
    account: PrivilegedAccount,
    isActive = account.is_active,
  ) {
    const currentPassword = window.prompt("Enter your current Root password");
    if (!currentPassword) return;
    const reason = window.prompt("Enter the access-control reason");
    if (!reason) return;
    setBusy(true);
    try {
      await apiFetch(
        `/identity/privileged-accounts/${encodeURIComponent(account.id)}`,
        apiSession,
        {
          method: "PATCH",
          body: JSON.stringify({
            is_active: isActive,
            permission_keys:
              account.user_type === "platform_admin"
                ? editablePermissions[account.id] || []
                : undefined,
            current_password: currentPassword,
            reason,
          }),
        },
      );
      setMessage("Privileged account updated.");
      await load();
    } catch (error: any) {
      setMessage(error.message || "Could not update privileged account.");
    } finally {
      setBusy(false);
    }
  }

  async function createGrant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      await apiFetch("/identity/support-access-grants", apiSession, {
        method: "POST",
        body: JSON.stringify({
          user_id: data.get("userId"),
          tenant_id: data.get("tenantId"),
          permission_keys: grantPermissions,
          duration_minutes: Number(data.get("durationMinutes")),
          current_password: data.get("currentPassword"),
          reason: data.get("reason"),
        }),
      });
      form.reset();
      setGrantPermissions([]);
      setMessage("Temporary support access granted.");
      await load();
    } catch (error: any) {
      setMessage(error.message || "Could not grant support access.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeGrant(grant: SupportGrant) {
    const currentPassword = window.prompt("Enter your current Root password");
    if (!currentPassword) return;
    const reason = window.prompt("Enter the revocation reason");
    if (!reason) return;
    setBusy(true);
    try {
      await apiFetch(
        `/identity/support-access-grants/${encodeURIComponent(grant.id)}/revoke`,
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            current_password: currentPassword,
            reason,
          }),
        },
      );
      setMessage("Support access revoked.");
      await load();
    } catch (error: any) {
      setMessage(error.message || "Could not revoke support access.");
    } finally {
      setBusy(false);
    }
  }

  if (isSupport) {
    return (
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="card-title font-bold">My Support Access</h3>
            <p className="card-desc text-slate-500">
              Tenant access is read-only, reasoned, audited, and expires automatically.
            </p>
          </div>
          <button className="rounded-lg border px-3 py-2 font-bold" onClick={() => void load()}>
            Refresh
          </button>
        </div>
        <div className="mt-4 grid gap-3">
          {grants.map((grant) => (
            <div key={grant.id} className="grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <b>{grant.tenant_name || grant.tenant_id}</b>
                  <Badge tone={grant.status === "active" ? "green" : "slate"}>{grant.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Expires {displayDateTime(grant.expires_at)} · {grant.reason}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {grant.permission_keys.map(permissionLabel).join(", ")}
                </p>
              </div>
              <button
                className="rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
                disabled={grant.status !== "active"}
                onClick={() => switchTenant(grant.tenant_id, grant.permission_keys)}
              >
                Enter tenant
              </button>
            </div>
          ))}
          {!grants.length && <p className="text-sm text-slate-500">No support access grants.</p>}
        </div>
      </Card>
    );
  }

  if (!isRoot) {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5" size={20} />
          <div>
            <h3 className="card-title font-bold">Scoped Platform Access</h3>
            <p className="card-desc text-slate-500">
              Root Super Admin approval is required to create privileged accounts or issue support grants.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <PlatformAdmins
        apiSession={apiSession}
        busy={busy}
        setBusy={setBusy}
        setMessage={setMessage}
      />

      <Card>
        <div className="flex items-start gap-3">
          <UserRoundCog className="mt-0.5" size={20} />
          <div>
            <h3 className="card-title font-bold">Platform And Support Accounts</h3>
            <p className="card-desc text-slate-500">
              Platform Admin uses explicit platform permissions. Support Admin receives no tenant access until a temporary grant is issued.
            </p>
          </div>
        </div>
        <form className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3" onSubmit={createAccount}>
          <FormField label="Account type">
            <select className="form-select" value={accountType} onChange={(event) => setAccountType(event.target.value as typeof accountType)}>
              <option value="platform_admin">Platform Admin</option>
              <option value="support_admin">Support Admin</option>
            </select>
          </FormField>
          <FormField label="Name"><Input name="name" required /></FormField>
          <FormField label="Company email"><Input name="email" type="email" required /></FormField>
          <FormField label="Mobile"><Input name="mobile" /></FormField>
          <FormField label="Temporary password"><Input name="temporaryPassword" type="password" minLength={12} required /></FormField>
          <FormField label="Your current password"><Input name="currentPassword" type="password" required /></FormField>
          <FormField label="Access reason"><Input name="reason" minLength={3} required /></FormField>
          {accountType === "platform_admin" && (
            <div className="md:col-span-2 xl:col-span-3">
              <p className="mb-2 text-xs font-bold uppercase text-slate-500">Platform permissions</p>
              <PermissionGrid values={options.platform_permission_keys} selected={accountPermissions} onChange={setAccountPermissions} />
            </div>
          )}
          <div className="md:col-span-2 xl:col-span-3">
            <button className="rounded-lg bg-slate-950 px-4 py-3 font-bold text-white disabled:opacity-40" disabled={busy}>Create account</button>
          </div>
        </form>

        <div className="mt-5 grid gap-3">
          {accounts.map((account) => (
            <div key={account.id} className="rounded-lg border p-4">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <b>{account.name}</b>
                    <Badge tone={account.is_active ? "green" : "red"}>{account.is_active ? "Active" : "Inactive"}</Badge>
                    <Badge tone="blue">{account.user_type === "platform_admin" ? "Platform Admin" : "Support Admin"}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{account.email}</p>
                </div>
                <div className="flex gap-2">
                  {account.user_type === "platform_admin" && (
                    <button className="rounded-lg border px-3 py-2 text-xs font-bold" onClick={() => void updateAccount(account)}>Save permissions</button>
                  )}
                  <button className="rounded-lg border px-3 py-2 text-xs font-bold" onClick={() => void updateAccount(account, !account.is_active)}>
                    {account.is_active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
              {account.user_type === "platform_admin" && (
                <div className="mt-3">
                  <PermissionGrid
                    values={options.platform_permission_keys}
                    selected={editablePermissions[account.id] || []}
                    onChange={(next) => setEditablePermissions((current) => ({ ...current, [account.id]: next }))}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <Clock3 className="mt-0.5" size={20} />
          <div>
            <h3 className="card-title font-bold">Temporary Tenant Support Grant</h3>
            <p className="card-desc text-slate-500">Maximum eight hours. Read-only permissions and every grant/revocation are audited.</p>
          </div>
        </div>
        <form className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={createGrant}>
          <FormField label="Support Admin">
            <select className="form-select" name="userId" required defaultValue="">
              <option value="" disabled>Select support account</option>
              {supportAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </FormField>
          <FormField label="Customer tenant">
            <select className="form-select" name="tenantId" required defaultValue="">
              <option value="" disabled>Select tenant</option>
              {customerTenants.map((tenant: any) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
            </select>
          </FormField>
          <FormField label="Duration">
            <select className="form-select" name="durationMinutes" defaultValue="60">
              <option value="30">30 minutes</option><option value="60">1 hour</option><option value="120">2 hours</option><option value="240">4 hours</option><option value="480">8 hours</option>
            </select>
          </FormField>
          <FormField label="Your current password"><Input name="currentPassword" type="password" required /></FormField>
          <div className="md:col-span-2 xl:col-span-4">
            <FormField label="Support reason"><Input name="reason" minLength={3} required /></FormField>
          </div>
          <div className="md:col-span-2 xl:col-span-4">
            <p className="mb-2 text-xs font-bold uppercase text-slate-500">Read-only tenant permissions</p>
            <PermissionGrid values={options.support_permission_keys} selected={grantPermissions} onChange={setGrantPermissions} />
          </div>
          <div className="md:col-span-2 xl:col-span-4">
            <button className="rounded-lg bg-slate-950 px-4 py-3 font-bold text-white disabled:opacity-40" disabled={busy}>Grant temporary access</button>
          </div>
        </form>

        <div className="mt-5 overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Support Admin</th><th className="px-4 py-3">Tenant</th><th className="px-4 py-3">Expires</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead>
            <tbody className="divide-y">
              {grants.map((grant) => (
                <tr key={grant.id}><td className="px-4 py-3 font-bold">{grant.user_name || grant.user_id}</td><td className="px-4 py-3">{grant.tenant_name || grant.tenant_id}</td><td className="px-4 py-3">{displayDateTime(grant.expires_at)}</td><td className="px-4 py-3"><Badge tone={grant.status === "active" ? "green" : "slate"}>{grant.status}</Badge></td><td className="px-4 py-3"><button className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-40" disabled={grant.status !== "active"} onClick={() => void revokeGrant(grant)}>Revoke</button></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
