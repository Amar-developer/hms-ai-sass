"use client";

import { apiBlob, apiFetch, apiUpload } from "@/lib/api";
import { dateInputToIso,title } from "../helpers";
import {
  UserFormValues,
  DepartmentFormValues,
  BranchFormValues,
  SupplierFormValues,
} from "../settings.schema";

type Setter<T = any> = React.Dispatch<React.SetStateAction<T[]>>;
type EntitySection =
  | "roles"
  | "users"
  | "departments"
  | "branches"
  | "suppliers"
  | "tax"
  | "offers";

interface UseTenantAdminActionsArgs {
  apiSession: any;
  branchId: string;
  open: (section: string, view?: string) => void;
  reload: () => Promise<void>;
  setBusy: (busy: boolean) => void;
  setMessage: (message: string) => void;
  departments: any[];
  setRoles: Setter;
  setUsers: Setter;
  setDepartments: Setter;
  setBranches: Setter;
  setSuppliers: Setter;
  setTaxRules: Setter;
  setDiscountOffers: Setter;
  setPasswordUser: (user: any) => void;
  invoicePrefix: string;
  invoiceLogoUrl: string;
  setInvoiceLogoUrl: (url: string) => void;
  bankDetails: any;
  numberingRules: any;
  requeueAfter: number;
  noShowAfter: number;
  slotIntervalsEnabled: boolean;
  slotIntervalMinutes: number;
  payments: string;
  providers: string;
  reportEnabled: boolean;
  reportRecipients: string;
  reportCc: string;
  reportSendDay: number;
  reportFilters: any;
  setReportBusy: (value: string) => void;
}

export function useTenantAdminActions({
  apiSession,
  branchId,
  open,
  reload,
  setBusy,
  setMessage,
  departments,
  setRoles,
  setUsers,
  setDepartments,
  setBranches,
  setSuppliers,
  setTaxRules,
  setDiscountOffers,
  setPasswordUser,
  invoicePrefix,
  invoiceLogoUrl,
  setInvoiceLogoUrl,
  bankDetails,
  numberingRules,
  requeueAfter,
  noShowAfter,
  slotIntervalsEnabled,
  slotIntervalMinutes,
  payments,
  providers,
  reportEnabled,
  reportRecipients,
  reportCc,
  reportSendDay,
  reportFilters,
  setReportBusy,
}: UseTenantAdminActionsArgs) {
  const entityConfig: Record<
    EntitySection,
    {
      path: string;
      setter: Setter;
      statusMethod: "POST" | "PATCH";
      statusPath: (id: string) => string;
    }
  > = {
    roles: {
      path: "/identity/roles",
      setter: setRoles,
      statusMethod: "POST",
      statusPath: (id) => `/identity/roles/${id}/status`,
    },
    users: {
      path: "/identity/users",
      setter: setUsers,
      statusMethod: "POST",
      statusPath: (id) => `/identity/users/${id}/status`,
    },
    departments: {
      path: `/tenants/${apiSession?.tenantId}/departments`,
      setter: setDepartments,
      statusMethod: "POST",
      statusPath: (id) =>
        `/tenants/${apiSession?.tenantId}/departments/${id}/status`,
    },
    branches: {
      path: `/tenants/${apiSession?.tenantId}/branches`,
      setter: setBranches,
      statusMethod: "POST",
      statusPath: (id) =>
        `/tenants/${apiSession?.tenantId}/branches/${id}/status`,
    },
    suppliers: {
      path: "/pharmacy/suppliers",
      setter: setSuppliers,
      statusMethod: "PATCH",
      statusPath: (id) => `/pharmacy/suppliers/${id}`,
    },
    tax: {
      path: "/billing/tax-rules",
      setter: setTaxRules,
      statusMethod: "PATCH",
      statusPath: (id) => `/billing/tax-rules/${id}`,
    },
    offers: {
      path: "/billing/discount-offers",
      setter: setDiscountOffers,
      statusMethod: "PATCH",
      statusPath: (id) => `/billing/discount-offers/${id}`,
    },
  };

  async function createEntity(
    section: EntitySection,
    body: any,
    successMessage: (created: any) => string,
    failureMessage: string,
  ) {
    const { path, setter } = entityConfig[section];
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch(path, apiSession, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setter((previous: any[]) => [
        created,
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      open(section);
      await reload();
      setMessage(successMessage(created));
      return created;
    } catch (err: any) {
      setMessage(err.message || failureMessage);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function updateEntity(
    section: EntitySection,
    id: string,
    body: any,
    successMessage: string,
    failureMessage: string,
  ) {
    const { path, setter } = entityConfig[section];
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(`${path}/${id}`, apiSession, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setter((previous: any[]) => [
        updated,
        ...previous.filter((row: any) => row.id !== updated.id),
      ]);
      open(section);
      await reload();
      setMessage(successMessage);
      return updated;
    } catch (err: any) {
      setMessage(err.message || failureMessage);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createRole(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get("name") || "").trim();
    const roleBranchId = String(fd.get("branchId") || "");
    const normalKey = (value: any) =>
      String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    const matchingDepartments = departments.filter(
      (row: any) =>
        row.is_active !== false && normalKey(row.name) === normalKey(name),
    );
    const conflict = matchingDepartments.find(
      (row: any) =>
        String(row.branch_id || "") === roleBranchId ||
        !row.branch_id ||
        !roleBranchId,
    );
    if (conflict) {
      setMessage(
        roleBranchId
          ? "This medical department already exists for all branches or this branch. Edit the existing row instead."
          : "This medical department already exists in one or more branches. Remove branch-specific mappings before creating an all-branches department.",
      );
      return;
    }
    const created = await createEntity(
      "roles",
      {
        name: fd.get("name"),
        key: fd.get("key"),
        permission_keys: fd.getAll("permissionKeys").map(String),
      },
      (row) => `Role created: ${row.name}`,
      "Could not create role.",
    );
    if (created) form.reset();
  }

  async function updateRole(e: any, selectedRole: any) {
    e.preventDefault();
    if (!selectedRole) return;
    const fd = new FormData(e.currentTarget);
    await updateEntity(
      "roles",
      selectedRole.id,
      {
        name: fd.get("name"),
        key: fd.get("key"),
        is_active: fd.get("isActive") === "true",
        permission_keys: fd.getAll("permissionKeys").map(String),
      },
      "Role updated.",
      "Could not update role.",
    );
  }

  async function createUser(data: UserFormValues) {
    const created = await createEntity(
      "users",
      {
        name: data.name,
        email: data.email,
        password: data.password,
        mobile: data.mobile || null,
        user_type: data.userType || "staff",
        branch_id: data.branchId || null,
        role_keys: data.roleKeys || [],
        must_change_password: data.mustChangePassword === "true",
      },
      (row) => `User created: ${row.name}`,
      "Could not create user.",
    );
    return created;
  }

  async function updateUser(data: UserFormValues, selectedUser: any) {
    if (!selectedUser) return;
    await updateEntity(
      "users",
      selectedUser.id,
      {
        name: data.name,
        email: data.email,
        user_type: data.userType || "staff",
        mobile: data.mobile || null,
        branch_id: data.branchId || null,
        role_keys: data.roleKeys || [],
        is_active: data.isActive === "true",
        must_change_password: data.mustChangePassword === "true",
      },
      "User updated.",
      "Could not update user.",
    );
  }

  async function resetUserPassword(e: any, passwordUser: any) {
    e.preventDefault();
    if (!passwordUser) return;
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("newPassword") || "");
    const confirmPassword = String(fd.get("confirmPassword") || "");
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/identity/users/${passwordUser.id}/password-reset`,
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            new_password: password,
            must_change_password: fd.get("mustChangePassword") === "true",
          }),
        },
      );
      setUsers((previous: any[]) =>
        previous.map((user: any) => (user.id === updated.id ? updated : user)),
      );
      setPasswordUser(null);
      setMessage(`Password reset for ${updated.name}.`);
    } catch (err: any) {
      setMessage(err.message || "Could not reset password.");
    } finally {
      setBusy(false);
    }
  }

  async function createDepartment(data: DepartmentFormValues) {
    await createEntity(
      "departments",
      {
        name: data.name.trim(),
        description: data.description || null,
        branch_id: data.branchId || null,
      },
      (row) => `Medical Department created: ${row.name}`,
      "Could not create department.",
    );
  }

  async function updateDepartment(
    data: DepartmentFormValues,
    selectedDepartment: any,
  ) {
    if (!selectedDepartment) return;
    await updateEntity(
      "departments",
      selectedDepartment.id,
      {
        name: data.name,
        description: data.description || null,
        branch_id: data.branchId || null,
        is_active: data.isActive === "true",
      },
      "Medical Department updated.",
      "Could not update department.",
    );
  }

  async function createBranch(data: BranchFormValues) {
    await createEntity(
      "branches",
      {
        name: data.name,
        code: data.code,
        area: data.area || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
      },
      (row) => `Branch created: ${row.name}`,
      "Could not create branch.",
    );
  }

  async function updateBranch(data: any, selectedBranch: any) {
    if (!selectedBranch) return;
    await updateEntity(
      "branches",
      selectedBranch.id,
      {
        name: data.name,
        code: data.code,
        area: data.area || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        is_active: data.isActive === "true",
      },
      "Branch updated.",
      "Could not update branch.",
    );
  }

  async function createSupplier(data: SupplierFormValues) {
    await createEntity(
      "suppliers",
      {
        name: data.name,
        gstin: data.gstin || null,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        created_by_user_id: apiSession.user?.id,
      },
      (row) => `Supplier created: ${row.name}`,
      "Could not create supplier.",
    );
  }

  async function updateSupplier(
    data: SupplierFormValues,
    selectedSupplier: any,
  ) {
    if (!selectedSupplier) return;
    await updateEntity(
      "suppliers",
      selectedSupplier.id,
      {
        name: data.name,
        gstin: data.gstin || null,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        is_active: data.isActive === "true",
      },
      "Supplier updated.",
      "Could not update supplier.",
    );
  }

  async function createTaxRule(data: any) {
    await createEntity(
      "tax",
      {
        branch_id: data.branchId || null,
        name: data.name,
        tax_percentage: Number(data.taxPercentage || 0),
        tax_label: data.taxLabel || "GST",
        service_scope: data.serviceScope || "all",
        created_by_user_id: apiSession.user?.id,
      },
      (row) => `Tax rule created: ${row.name}`,
      "Could not create tax rule.",
    );
  }

  async function updateTaxRule(data: any, selectedTaxRule: any) {
    if (!selectedTaxRule) return;
    await updateEntity(
      "tax",
      selectedTaxRule.id,
      {
        branch_id: data.branchId || null,
        name: data.name,
        tax_percentage: Number(data.taxPercentage || 0),
        tax_label: data.taxLabel || "GST",
        service_scope: data.serviceScope || "all",
        is_active: data.isActive === "true",
      },
      "Tax rule updated.",
      "Could not update tax rule.",
    );
  }

  async function createDiscountOffer(data: any) {
    await createEntity(
      "offers",
      {
        branch_id: data.branchId || null,
        name: data.name,
        code: data.code || null,
        service_scope: data.serviceScope || "all",
        discount_type: data.discountType || "percentage",
        value: Number(data.value || 0),
        minimum_bill_amount: Number(data.minimumBillAmount || 0),
        max_discount_amount: data.maxDiscountAmount
          ? Number(data.maxDiscountAmount)
          : null,
        valid_from: dateInputToIso(data.validFrom),
        valid_until: dateInputToIso(data.validUntil),
        created_by_user_id: apiSession.user?.id,
      },
      (row) => `Offer created: ${row.name}`,
      "Could not create discount offer.",
    );
  }

  async function updateDiscountOffer(data: any, selectedOffer: any) {
    if (!selectedOffer) return;
    await updateEntity(
      "offers",
      selectedOffer.id,
      {
        branch_id: data.branchId || null,
        name: data.name,
        code: data.code || null,
        service_scope: data.serviceScope || "all",
        discount_type: data.discountType || "percentage",
        value: Number(data.value || 0),
        minimum_bill_amount: Number(data.minimumBillAmount || 0),
        max_discount_amount: data.maxDiscountAmount
          ? Number(data.maxDiscountAmount)
          : null,
        valid_from: dateInputToIso(data.validFrom),
        valid_until: dateInputToIso(data.validUntil),
        is_active: data.isActive === "true",
      },
      "Discount offer updated.",
      "Could not update discount offer.",
    );
  }

  async function changeStatus(entity: EntitySection, row: any) {
    const cfg = entityConfig[entity];
    setBusy(true);
    setMessage("");
    try {
      await apiFetch(cfg.statusPath(row.id), apiSession, {
        method: cfg.statusMethod,
        body: JSON.stringify({ is_active: !row.is_active }),
      });
      await reload();
      setMessage(`${title(entity)} status updated.`);
    } catch (err: any) {
      setMessage(err.message || "Could not change status.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRow(
    entity: "roles" | "users" | "departments" | "branches" | "suppliers",
    row: any,
  ) {
    setBusy(true);
    setMessage("");
    try {
      await apiFetch(`${entityConfig[entity].path}/${row.id}`, apiSession, {
        method: "DELETE",
      });
      await reload();
      setMessage(`${title(entity)} deactivated.`);
    } catch (err: any) {
      setMessage(err.message || "Could not delete record.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    setMessage("");
    setBusy(true);
    const list = (v: string) =>
      v
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    try {
      await Promise.all([
        apiFetch("/settings", apiSession, {
          method: "PUT",
          body: JSON.stringify({
            scope: "branch",
            scope_id: branchId,
            module: "invoice",
            key: "invoice.prefix",
            value: numberingRules.prefix || invoicePrefix,
            actor_user_id: apiSession.user?.id,
          }),
        }),
        apiFetch("/settings", apiSession, {
          method: "PUT",
          body: JSON.stringify({
            scope: "branch",
            scope_id: branchId,
            module: "numbering",
            key: "numbering.rules",
            value: numberingRules,
            actor_user_id: apiSession.user?.id,
          }),
        }),
        apiFetch("/settings", apiSession, {
          method: "PUT",
          body: JSON.stringify({
            scope: "tenant",
            module: "invoice",
            key: "invoice.logo_url",
            value: invoiceLogoUrl,
            actor_user_id: apiSession.user?.id,
          }),
        }),
        apiFetch("/settings", apiSession, {
          method: "PUT",
          body: JSON.stringify({
            scope: "branch",
            scope_id: branchId,
            module: "queue",
            key: "queue.requeue_after_patients",
            value: Number(requeueAfter),
            actor_user_id: apiSession.user?.id,
          }),
        }),
        apiFetch("/settings", apiSession, {
          method: "PUT",
          body: JSON.stringify({
            scope: "branch",
            scope_id: branchId,
            module: "queue",
            key: "queue.auto_no_show_after_missed_calls",
            value: Number(noShowAfter),
            actor_user_id: apiSession.user?.id,
          }),
        }),
        apiFetch("/settings", apiSession, {
          method: "PUT",
          body: JSON.stringify({
            scope: "branch",
            scope_id: branchId,
            module: "appointments",
            key: "appointment.slot_intervals_enabled",
            value: slotIntervalsEnabled,
            actor_user_id: apiSession.user?.id,
          }),
        }),
        apiFetch("/settings", apiSession, {
          method: "PUT",
          body: JSON.stringify({
            scope: "branch",
            scope_id: branchId,
            module: "appointments",
            key: "appointment.slot_interval_minutes",
            value: Number(slotIntervalMinutes),
            actor_user_id: apiSession.user?.id,
          }),
        }),
        apiFetch("/settings", apiSession, {
          method: "PUT",
          body: JSON.stringify({
            scope: "tenant",
            module: "payment",
            key: "payment.methods_enabled",
            value: list(payments),
            actor_user_id: apiSession.user?.id,
          }),
        }),
        apiFetch("/settings", apiSession, {
          method: "PUT",
          body: JSON.stringify({
            // Tenant scoped so it stays in sync with the super admin screen and
            // the receipt PDF, which read bank details at tenant scope.
            scope: "tenant",
            module: "accounts",
            key: "accounts.bank_details",
            value: bankDetails,
            actor_user_id: apiSession.user?.id,
          }),
        }),
        apiFetch("/settings", apiSession, {
          method: "PUT",
          body: JSON.stringify({
            scope: "tenant",
            module: "communication",
            key: "communication.providers_enabled",
            value: list(providers),
            actor_user_id: apiSession.user?.id,
          }),
        }),
      ]);
      await reload();
      setMessage("Settings saved.");
    } catch (err: any) {
      setMessage(err.message || "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadInvoiceLogo(file: File) {
    if (!file) return;
    setMessage("");
    setBusy(true);
    try {
      const upload = new FormData();
      upload.append("file", file);
      upload.append("category", "logo");
      upload.append("source_module", "settings");
      upload.append("attached_to_doctype", "Tenant");
      upload.append("attached_to_name", apiSession?.tenantId);
      upload.append("attached_to_field", "invoice.logo_url");
      upload.append("attached_to_label", "Invoice Logo");
      upload.append("folder", "Branding");
      const created = await apiUpload("/files", apiSession, upload);
      setInvoiceLogoUrl(created.file_url);
      await apiFetch("/settings", apiSession, {
        method: "PUT",
        body: JSON.stringify({
          scope: "tenant",
          module: "invoice",
          key: "invoice.logo_url",
          value: created.file_url,
          actor_user_id: apiSession.user?.id,
        }),
      });
      await reload();
      setMessage("Invoice logo uploaded and saved.");
    } catch (err: any) {
      setMessage(err.message || "Could not upload invoice logo.");
    } finally {
      setBusy(false);
    }
  }

  async function saveReportSettings() {
    const list = (v: string) =>
      v
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    setReportBusy("save");
    setMessage("");
    try {
      await apiFetch("/reports/monthly-email/config", apiSession, {
        method: "PUT",
        body: JSON.stringify({
          enabled: reportEnabled,
          recipients: list(reportRecipients),
          cc: list(reportCc),
          send_day: Number(reportSendDay || 1),
          filters: reportFilters,
        }),
      });
      await reload();
      setMessage("Monthly report email settings saved.");
    } catch (err: any) {
      setMessage(err.message || "Could not save monthly report settings.");
    } finally {
      setReportBusy("");
    }
  }

  async function sendMonthlyReportNow() {
    const list = (v: string) =>
      v
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    setReportBusy("send");
    setMessage("");
    try {
      const job = await apiFetch("/reports/monthly-email/send", apiSession, {
        method: "POST",
        body: JSON.stringify({
          recipients: list(reportRecipients),
          cc: list(reportCc),
          filters: reportFilters,
        }),
      });
      await reload();
      setMessage(
        job.status === "failed"
          ? `Report job failed to queue: ${job.failure_reason}`
          : "Monthly report job queued.",
      );
    } catch (err: any) {
      setMessage(err.message || "Could not queue monthly report.");
    } finally {
      setReportBusy("");
    }
  }

  async function resendMonthlyReport(job: any) {
    setReportBusy(`resend-${job.id}`);
    setMessage("");
    try {
      await apiFetch("/reports/monthly-email/send", apiSession, {
        method: "POST",
        body: JSON.stringify({
          recipients: job.recipients || [],
          cc: job.cc || [],
          from_date: job.period_start,
          to_date: job.period_end,
          filters: job.filters || reportFilters,
        }),
      });
      await reload();
      setMessage("Report queued again.");
    } catch (err: any) {
      setMessage(err.message || "Could not resend report.");
    } finally {
      setReportBusy("");
    }
  }

  async function downloadMonthlyReport(job: any) {
    setReportBusy(`download-${job.id}`);
    setMessage("");
    try {
      const blob = await apiBlob(
        `/reports/monthly-email/jobs/${job.id}/download`,
        apiSession,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `monthly-revenue-report-${job.period_start}-${job.period_end}.xls`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setMessage(err.message || "Could not download report.");
    } finally {
      setReportBusy("");
    }
  }

  return {
    createRole,
    updateRole,
    createUser,
    updateUser,
    resetUserPassword,
    createDepartment,
    updateDepartment,
    createBranch,
    updateBranch,
    createSupplier,
    updateSupplier,
    createTaxRule,
    updateTaxRule,
    createDiscountOffer,
    updateDiscountOffer,
    changeStatus,
    deleteRow,
    saveSettings,
    uploadInvoiceLogo,
    saveReportSettings,
    sendMonthlyReportNow,
    resendMonthlyReport,
    downloadMonthlyReport,
  };
}
