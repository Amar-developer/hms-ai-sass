"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export type PrivilegedAccessOptions = {
  platform_permission_keys: string[];
  support_permission_keys: string[];
  maximum_support_duration_minutes: number;
};

export type PrivilegedAccount = {
  id: string;
  name: string;
  email: string;
  user_type: "platform_admin" | "support_admin";
  is_active: boolean;
  permissions?: string[];
};

export type SupportGrant = {
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

export function usePrivilegedAccess(
  apiSession: any,
  isRoot: boolean,
  setBusy: (busy: boolean) => void,
  setMessage: (message: string) => void,
) {
  const [options, setOptions] = useState<PrivilegedAccessOptions>({
    platform_permission_keys: [],
    support_permission_keys: [],
    maximum_support_duration_minutes: 480,
  });
  const [accounts, setAccounts] = useState<PrivilegedAccount[]>([]);
  const [grants, setGrants] = useState<SupportGrant[]>([]);
  const [editablePermissions, setEditablePermissions] = useState<
    Record<string, string[]>
  >({});

  async function load() {
    if (!apiSession) return;
    setBusy(true);
    try {
      const [optionRows, grantRows, accountRows] = await Promise.all([
        apiFetch<PrivilegedAccessOptions>(
          "/identity/privileged-access/options",
          apiSession,
        ),
        apiFetch<SupportGrant[]>(
          "/identity/support-access-grants",
          apiSession,
        ),
        isRoot
          ? apiFetch<PrivilegedAccount[]>(
              "/identity/privileged-accounts",
              apiSession,
            )
          : Promise.resolve<PrivilegedAccount[]>([]),
      ]);
      setOptions(optionRows);
      setGrants(grantRows);
      if (isRoot) {
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

  async function createAccount(payload: {
    account_type: "platform_admin" | "support_admin";
    name: FormDataEntryValue | null;
    email: FormDataEntryValue | null;
    mobile: FormDataEntryValue | null;
    temporary_password: FormDataEntryValue | null;
    current_password: FormDataEntryValue | null;
    permission_keys: string[];
    reason: FormDataEntryValue | null;
  }) {
    setBusy(true);
    try {
      await apiFetch("/identity/privileged-accounts", apiSession, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setMessage("Privileged account created.");
      await load();
      return true;
    } catch (error: any) {
      setMessage(error.message || "Could not create privileged account.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function updateAccount(
    account: PrivilegedAccount,
    isActive: boolean,
    currentPassword: string,
    reason: string,
  ) {
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

  async function createGrant(payload: {
    user_id: FormDataEntryValue | null;
    tenant_id: FormDataEntryValue | null;
    permission_keys: string[];
    duration_minutes: number;
    current_password: FormDataEntryValue | null;
    reason: FormDataEntryValue | null;
  }) {
    setBusy(true);
    try {
      await apiFetch("/identity/support-access-grants", apiSession, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setMessage("Temporary support access granted.");
      await load();
      return true;
    } catch (error: any) {
      setMessage(error.message || "Could not grant support access.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function revokeGrant(
    grant: SupportGrant,
    currentPassword: string,
    reason: string,
  ) {
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

  return {
    options,
    accounts,
    grants,
    editablePermissions,
    setEditablePermissions,
    load,
    createAccount,
    updateAccount,
    createGrant,
    revokeGrant,
  };
}
