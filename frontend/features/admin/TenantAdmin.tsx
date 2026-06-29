"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  sections,
  parseBankDetails,
  parseNumberingRules,
} from "@/utils/tenantAdmin/constants";
import { canUseTenantAdminSection } from "@/utils/tenantAdmin/permissions";
import { Card, StatusToast } from "@/app/components/common/ui";
import { PatientSubscriptions } from "@/features/patient_subscriptions/PatientSubscriptions";
import { apiBlob, apiFetch, apiUpload } from "@/lib/api";
import {
  title,
  dateInputToIso,
  groupDepartmentsByName,
} from "../../utils/tenantAdmin/helpers";
import {
  UserRow,
  RoleRow,
  DepartmentRow,
  BranchRow,
  SupplierRow,
  TaxRuleRow,
  DiscountOfferRow,
  Role,
} from "@/app/components/tenantAdmin/Rows";
import {
  ListCard,
  PasswordResetModal,
} from "@/app/components/tenantAdmin/Shared";
import { ConfirmModal } from "@/app/components/admin/ConfirmModal";
import {
  BranchForm,
  DepartmentForm,
  DiscountOfferForm,
  RoleForm,
  SupplierForm,
  TaxRuleForm,
  UserForm,
} from "@/app/components/tenantAdmin/Forms";
import { FilesPanel } from "@/app/components/tenantAdmin/FilesPanel";
import { SettingsPanel } from "@/app/components/tenantAdmin/SettingsPanel";
import { BRANCH_COLUMNS, DEPARTMENT_COLUMNS, DISCOUNT_OFFER_COLUMNS, ROLE_COLUMNS, SUPPLIER_COLUMNS, TAX_RULE_COLUMNS, USER_COLUMNS } from "@/utils/constants";

export function TenantAdmin({
  apiSession,
  clinic,
  branchId,
  patients,
  section: externalSection,
  setSection: externalSetSection,
}: any) {
  const [localSection, setLocalSection] = useState("users");
  const section = externalSection || localSection;
  const setSection = externalSetSection || setLocalSection;
  const [view, setView] = useState("list");
  const [roles, setRoles] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [taxRules, setTaxRules] = useState<any[]>([]);
  const [discountOffers, setDiscountOffers] = useState<any[]>([]);
  const [settings, setSettings] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [subscriptionEntitlements, setSubscriptionEntitlements] =
    useState<any>(null);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<any>(null);
  const [passwordUser, setPasswordUser] = useState<any>(null);
  const [invoicePrefix, setInvoicePrefix] = useState("MHD");
  const [invoiceLogoUrl, setInvoiceLogoUrl] = useState("");
  const [bankDetails, setBankDetails] = useState<any>(parseBankDetails(null));
  const [numberingRules, setNumberingRules] = useState<any>(
    parseNumberingRules(null, "MHD"),
  );
  const [requeueAfter, setRequeueAfter] = useState(2);
  const [noShowAfter, setNoShowAfter] = useState(3);
  const [slotIntervalsEnabled, setSlotIntervalsEnabled] = useState(false);
  const [slotIntervalMinutes, setSlotIntervalMinutes] = useState(5);
  const [payments, setPayments] = useState(
    "cash,upi,gpay,paytm,credit_card,debit_card,bank_transfer",
  );
  const [providers, setProviders] = useState("whatsapp,sms,voice");
  const [reportEnabled, setReportEnabled] = useState(false);
  const [reportRecipients, setReportRecipients] = useState("");
  const [reportCc, setReportCc] = useState("");
  const [reportSendDay, setReportSendDay] = useState(1);
  const [reportFilters, setReportFilters] = useState<any>({
    overall: true,
    doctor: true,
    department: true,
    invoice: true,
  });
  const [reportJobs, setReportJobs] = useState<any[]>([]);
  const [reportBusy, setReportBusy] = useState("");
  const loadSequence = useRef(0);
  const selectedRole = roles.find((row: any) => row.id === selectedId);
  const selectedUser = users.find((row: any) => row.id === selectedId);
  const departmentGroups = useMemo(
    () => groupDepartmentsByName(departments, branches),
    [departments, branches],
  );
  const selectedDepartment = departments.find(
    (row: any) => row.id === selectedId,
  );
  const selectedBranch = branches.find((row: any) => row.id === selectedId);
  const selectedSupplier = suppliers.find((row: any) => row.id === selectedId);
  const selectedTaxRule = taxRules.find((row: any) => row.id === selectedId);
  const selectedOffer = discountOffers.find(
    (row: any) => row.id === selectedId,
  );
  const visibleSections = sections.filter(([sectionId]) =>
    canUseTenantAdminSection(sectionId, apiSession?.user),
  );

  function open(nextSection: string, nextView = "list") {
    setSection(nextSection);
    setView(nextView);
    setSelectedId("");
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  }

  function openRolePermissions(role: any) {
    setSection("roles");
    setView("edit");
    setSelectedId(role.id);
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  }

  async function loadAdmin() {
    if (!apiSession) return;
    const requestSequence = ++loadSequence.current;
    setBusy(true);
    setMessage("");
    try {
      const scoped = { ...apiSession, tenantId: apiSession.tenantId };
      const canUsers = canUseTenantAdminSection("users", apiSession.user);
      const canRoles =
        canUseTenantAdminSection("roles", apiSession.user) || canUsers;
      const canDepartments = canUseTenantAdminSection(
        "departments",
        apiSession.user,
      );
      const canBranches = canUseTenantAdminSection("branches", apiSession.user);
      const canSuppliers = canUseTenantAdminSection(
        "suppliers",
        apiSession.user,
      );
      const canTax = canUseTenantAdminSection("tax", apiSession.user);
      const canOffers = canUseTenantAdminSection("offers", apiSession.user);
      const canSettings = canUseTenantAdminSection("settings", apiSession.user);
      const canFiles = canUseTenantAdminSection("files", apiSession.user);
      const safeFetch = async (path: string, enabled = true) =>
        enabled ? apiFetch(path, scoped).catch(() => []) : Promise.resolve([]);
      const [
        roleRows,
        userRows,
        departmentRows,
        branchRows,
        supplierRows,
        taxRows,
        offerRows,
        settingRows,
        fileRows,
        permissionRows,
        reportConfig,
        reportJobRows,
        entitlements,
      ] = await Promise.all([
        safeFetch("/identity/roles", canRoles),
        safeFetch("/identity/users", canUsers),
        safeFetch(
          `/tenants/${apiSession.tenantId}/departments`,
          canDepartments,
        ),
        safeFetch(`/tenants/${apiSession.tenantId}/branches`, canBranches),
        safeFetch("/pharmacy/suppliers?include_inactive=true", canSuppliers),
        safeFetch("/billing/tax-rules", canTax),
        safeFetch("/billing/discount-offers", canOffers),
        safeFetch("/settings", canSettings),
        safeFetch("/files?limit=200", canFiles),
        apiFetch("/identity/permissions", scoped),
        canSettings
          ? apiFetch("/reports/monthly-email/config", scoped).catch(() => null)
          : Promise.resolve(null),
        canSettings
          ? apiFetch("/reports/monthly-email/jobs?limit=5", scoped).catch(
              () => [],
            )
          : Promise.resolve([]),
        safeFetch("/subscription-plans/entitlements", canBranches),
      ]);
      if (requestSequence !== loadSequence.current) return;
      setRoles(roleRows);
      setUsers(userRows);
      setDepartments(departmentRows);
      setBranches(branchRows);
      setSuppliers(supplierRows);
      setTaxRules(taxRows);
      setDiscountOffers(offerRows);
      setSettings(settingRows);
      setFiles(fileRows);
      setPermissions(permissionRows);
      setSubscriptionEntitlements(
        entitlements && !Array.isArray(entitlements) ? entitlements : null,
      );
      const find = (key: string) => settingRows.find((x: any) => x.key === key);
      const findTenant = (key: string) =>
        settingRows.find((x: any) => x.key === key && x.scope === "tenant") ||
        find(key);
      if (find("invoice.prefix"))
        setInvoicePrefix(find("invoice.prefix").value);
      setInvoiceLogoUrl(
        String(findTenant("invoice.logo_url")?.value || clinic?.logo_url || ""),
      );
      const bankRow =
        settingRows.find(
          (x: any) => x.key === "accounts.bank_details" && x.scope === "tenant",
        ) || find("accounts.bank_details");
      setBankDetails(parseBankDetails(bankRow?.value));
      if (find("numbering.rules"))
        setNumberingRules(
          parseNumberingRules(
            find("numbering.rules").value,
            find("invoice.prefix")?.value || invoicePrefix,
          ),
        );
      if (find("queue.requeue_after_patients"))
        setRequeueAfter(Number(find("queue.requeue_after_patients").value));
      if (find("queue.auto_no_show_after_missed_calls"))
        setNoShowAfter(
          Number(find("queue.auto_no_show_after_missed_calls").value),
        );
      if (find("appointment.slot_intervals_enabled"))
        setSlotIntervalsEnabled(
          Boolean(find("appointment.slot_intervals_enabled").value),
        );
      if (find("appointment.slot_interval_minutes"))
        setSlotIntervalMinutes(
          Number(find("appointment.slot_interval_minutes").value || 5),
        );
      if (find("payment.methods_enabled"))
        setPayments((find("payment.methods_enabled").value || []).join(","));
      if (find("communication.providers_enabled"))
        setProviders(
          (find("communication.providers_enabled").value || []).join(","),
        );
      if (reportConfig) {
        setReportEnabled(Boolean(reportConfig.enabled));
        setReportRecipients((reportConfig.recipients || []).join(","));
        setReportCc((reportConfig.cc || []).join(","));
        setReportSendDay(Number(reportConfig.send_day || 1));
        setReportFilters(
          reportConfig.filters || {
            overall: true,
            doctor: true,
            department: true,
            invoice: true,
          },
        );
      }
      setReportJobs(reportJobRows || []);
    } catch (err: any) {
      if (requestSequence !== loadSequence.current) return;
      setMessage(err.message || "Could not load tenant admin data.");
    } finally {
      if (requestSequence === loadSequence.current) setBusy(false);
    }
  }

  useEffect(() => {
    loadAdmin();
  }, [apiSession?.tenantId]);
  useEffect(() => {
    setView("list");
    setSelectedId("");
    setConfirm(null);
    setPasswordUser(null);
  }, [section]);
  useEffect(() => {
    if (view !== "edit") return;
    const selectedExists =
      (section === "users" && Boolean(selectedUser)) ||
      (section === "roles" && Boolean(selectedRole)) ||
      (section === "departments" && Boolean(selectedDepartment)) ||
      (section === "branches" && Boolean(selectedBranch)) ||
      (section === "suppliers" && Boolean(selectedSupplier)) ||
      (section === "tax" && Boolean(selectedTaxRule)) ||
      (section === "offers" && Boolean(selectedOffer));
    if (!selectedExists) {
      setView("list");
      setSelectedId("");
    }
  }, [
    section,
    view,
    selectedUser,
    selectedRole,
    selectedDepartment,
    selectedBranch,
    selectedSupplier,
    selectedTaxRule,
    selectedOffer,
  ]);
  useEffect(() => {
    if (
      apiSession &&
      visibleSections.length &&
      !visibleSections.some(([sectionId]) => sectionId === section)
    ) {
      open(visibleSections[0][0]);
    }
  }, [
    apiSession?.tenantId,
    section,
    visibleSections.map(([sectionId]) => sectionId).join(","),
  ]);

  async function createRole(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get("name") || "").trim();
    const branchId = String(fd.get("branchId") || "");
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
        String(row.branch_id || "") === branchId || !row.branch_id || !branchId,
    );
    if (conflict) {
      setMessage(
        branchId
          ? "This medical department already exists for all branches or this branch. Edit the existing row instead."
          : "This medical department already exists in one or more branches. Remove branch-specific mappings before creating an all-branches department.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch("/identity/roles", apiSession, {
        method: "POST",
        body: JSON.stringify({
          name: fd.get("name"),
          key: fd.get("key"),
          permission_keys: fd.getAll("permissionKeys").map(String),
        }),
      });
      form.reset();
      setRoles((previous) => [
        created,
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      open("roles");
      await loadAdmin();
      setMessage(`Role created: ${created.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not create role.");
    } finally {
      setBusy(false);
    }
  }

  async function updateRole(e: any) {
    e.preventDefault();
    if (!selectedRole) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/identity/roles/${selectedRole.id}`,
        apiSession,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: fd.get("name"),
            key: fd.get("key"),
            is_active: fd.get("isActive") === "true",
            permission_keys: fd.getAll("permissionKeys").map(String),
          }),
        },
      );
      setRoles((previous) => [
        updated,
        ...previous.filter((row: any) => row.id !== updated.id),
      ]);
      open("roles");
      await loadAdmin();
      setMessage("Role updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update role.");
    } finally {
      setBusy(false);
    }
  }

  async function createUser(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch("/identity/users", apiSession, {
        method: "POST",
        body: JSON.stringify({
          name: fd.get("name"),
          email: fd.get("email"),
          password: fd.get("password"),
          mobile: fd.get("mobile") || null,
          user_type: fd.get("userType") || "staff",
          branch_id: fd.get("branchId") || null,
          role_keys: fd.getAll("roleKeys").map(String),
          must_change_password: fd.get("mustChangePassword") === "true",
        }),
      });
      form.reset();
      setUsers((previous) => [
        created,
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      open("users");
      await loadAdmin();
      setMessage(`User created: ${created.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not create user.");
    } finally {
      setBusy(false);
    }
  }
  ``;
  async function updateUser(e: any) {
    e.preventDefault();
    if (!selectedUser) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/identity/users/${selectedUser.id}`,
        apiSession,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: fd.get("name"),
            email: fd.get("email"),
            user_type: fd.get("userType") || "staff",
            mobile: fd.get("mobile") || null,
            branch_id: fd.get("branchId") || null,
            role_keys: fd.getAll("roleKeys").map(String),
            is_active: fd.get("isActive") === "true",
            must_change_password: fd.get("mustChangePassword") === "true",
          }),
        },
      );
      setUsers((previous) => [
        updated,
        ...previous.filter((row: any) => row.id !== updated.id),
      ]);
      open("users");
      await loadAdmin();
      setMessage("User updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update user.");
    } finally {
      setBusy(false);
    }
  }

  async function resetUserPassword(e: any) {
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
      setUsers((previous) =>
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

  async function createDepartment(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get("name") || "").trim();
    const branchId = String(fd.get("branchId") || "");
    if (name.length < 2) {
      setMessage("Medical department name must contain at least 2 characters.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch(
        `/tenants/${apiSession.tenantId}/departments`,
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            name,
            description: fd.get("description") || null,
            branch_id: branchId || null,
          }),
        },
      );
      form.reset();
      setDepartments((previous) => [
        created,
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      open("departments");
      await loadAdmin();
      setMessage(`Medical Department created: ${created.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not create department.");
    } finally {
      setBusy(false);
    }
  }

  async function updateDepartment(e: any) {
    e.preventDefault();
    if (!selectedDepartment) return;
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    if (name.length < 2) {
      setMessage("Medical department name must contain at least 2 characters.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/tenants/${apiSession.tenantId}/departments/${selectedDepartment.id}`,
        apiSession,
        {
          method: "PATCH",
          body: JSON.stringify({
            name,
            description: fd.get("description") || null,
            branch_id: fd.get("branchId") || null,
            is_active: fd.get("isActive") === "true",
          }),
        },
      );
      setDepartments((previous) => [
        updated,
        ...previous.filter((row: any) => row.id !== updated.id),
      ]);
      open("departments");
      await loadAdmin();
      setMessage("Medical Department updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update department.");
    } finally {
      setBusy(false);
    }
  }

  async function createBranch(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch(
        `/tenants/${apiSession.tenantId}/branches`,
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            name: fd.get("name"),
            code: fd.get("code"),
            area: fd.get("area") || null,
            address: fd.get("address") || null,
            city: fd.get("city") || null,
            state: fd.get("state") || null,
          }),
        },
      );
      form.reset();
      setBranches((previous) => [
        created,
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      open("branches");
      await loadAdmin();
      setMessage(`Branch created: ${created.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not create branch.");
    } finally {
      setBusy(false);
    }
  }

  async function updateBranch(e: any) {
    e.preventDefault();
    if (!selectedBranch) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/tenants/${apiSession.tenantId}/branches/${selectedBranch.id}`,
        apiSession,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: fd.get("name"),
            code: fd.get("code"),
            area: fd.get("area") || null,
            address: fd.get("address") || null,
            city: fd.get("city") || null,
            state: fd.get("state") || null,
            is_active: fd.get("isActive") === "true",
          }),
        },
      );
      setBranches((previous) => [
        updated,
        ...previous.filter((row: any) => row.id !== updated.id),
      ]);
      open("branches");
      await loadAdmin();
      setMessage("Branch updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update branch.");
    } finally {
      setBusy(false);
    }
  }

  async function createSupplier(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch("/pharmacy/suppliers", apiSession, {
        method: "POST",
        body: JSON.stringify({
          name: fd.get("name"),
          gstin: fd.get("gstin") || null,
          phone: fd.get("phone") || null,
          email: fd.get("email") || null,
          address: fd.get("address") || null,
          created_by_user_id: apiSession.user?.id,
        }),
      });
      form.reset();
      setSuppliers((previous) => [
        created,
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      open("suppliers");
      await loadAdmin();
      setMessage(`Supplier created: ${created.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not create supplier.");
    } finally {
      setBusy(false);
    }
  }

  async function updateSupplier(e: any) {
    e.preventDefault();
    if (!selectedSupplier) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/pharmacy/suppliers/${selectedSupplier.id}`,
        apiSession,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: fd.get("name"),
            gstin: fd.get("gstin") || null,
            phone: fd.get("phone") || null,
            email: fd.get("email") || null,
            address: fd.get("address") || null,
            is_active: fd.get("isActive") === "true",
          }),
        },
      );
      setSuppliers((previous) => [
        updated,
        ...previous.filter((row: any) => row.id !== updated.id),
      ]);
      open("suppliers");
      await loadAdmin();
      setMessage("Supplier updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update supplier.");
    } finally {
      setBusy(false);
    }
  }

  async function createTaxRule(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch("/billing/tax-rules", apiSession, {
        method: "POST",
        body: JSON.stringify({
          branch_id: fd.get("branchId") || null,
          name: fd.get("name"),
          tax_percentage: Number(fd.get("taxPercentage") || 0),
          tax_label: fd.get("taxLabel") || "GST",
          service_scope: fd.get("serviceScope") || "all",
          created_by_user_id: apiSession.user?.id,
        }),
      });
      form.reset();
      setTaxRules((previous) => [
        created,
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      open("tax");
      await loadAdmin();
      setMessage(`Tax rule created: ${created.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not create tax rule.");
    } finally {
      setBusy(false);
    }
  }

  async function updateTaxRule(e: any) {
    e.preventDefault();
    if (!selectedTaxRule) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/billing/tax-rules/${selectedTaxRule.id}`,
        apiSession,
        {
          method: "PATCH",
          body: JSON.stringify({
            branch_id: fd.get("branchId") || null,
            name: fd.get("name"),
            tax_percentage: Number(fd.get("taxPercentage") || 0),
            tax_label: fd.get("taxLabel") || "GST",
            service_scope: fd.get("serviceScope") || "all",
            is_active: fd.get("isActive") === "true",
          }),
        },
      );
      setTaxRules((previous) => [
        updated,
        ...previous.filter((row: any) => row.id !== updated.id),
      ]);
      open("tax");
      await loadAdmin();
      setMessage("Tax rule updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update tax rule.");
    } finally {
      setBusy(false);
    }
  }

  async function createDiscountOffer(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch("/billing/discount-offers", apiSession, {
        method: "POST",
        body: JSON.stringify({
          branch_id: fd.get("branchId") || null,
          name: fd.get("name"),
          code: fd.get("code") || null,
          service_scope: fd.get("serviceScope") || "all",
          discount_type: fd.get("discountType") || "percentage",
          value: Number(fd.get("value") || 0),
          minimum_bill_amount: Number(fd.get("minimumBillAmount") || 0),
          max_discount_amount: fd.get("maxDiscountAmount")
            ? Number(fd.get("maxDiscountAmount"))
            : null,
          valid_from: dateInputToIso(fd.get("validFrom")),
          valid_until: dateInputToIso(fd.get("validUntil")),
          created_by_user_id: apiSession.user?.id,
        }),
      });
      form.reset();
      setDiscountOffers((previous) => [
        created,
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      open("offers");
      await loadAdmin();
      setMessage(`Offer created: ${created.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not create discount offer.");
    } finally {
      setBusy(false);
    }
  }

  async function updateDiscountOffer(e: any) {
    e.preventDefault();
    if (!selectedOffer) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/billing/discount-offers/${selectedOffer.id}`,
        apiSession,
        {
          method: "PATCH",
          body: JSON.stringify({
            branch_id: fd.get("branchId") || null,
            name: fd.get("name"),
            code: fd.get("code") || null,
            service_scope: fd.get("serviceScope") || "all",
            discount_type: fd.get("discountType") || "percentage",
            value: Number(fd.get("value") || 0),
            minimum_bill_amount: Number(fd.get("minimumBillAmount") || 0),
            max_discount_amount: fd.get("maxDiscountAmount")
              ? Number(fd.get("maxDiscountAmount"))
              : null,
            valid_from: dateInputToIso(fd.get("validFrom")),
            valid_until: dateInputToIso(fd.get("validUntil")),
            is_active: fd.get("isActive") === "true",
          }),
        },
      );
      setDiscountOffers((previous) => [
        updated,
        ...previous.filter((row: any) => row.id !== updated.id),
      ]);
      open("offers");
      await loadAdmin();
      setMessage("Discount offer updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update discount offer.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(entity: string, row: any) {
    const paths: any = {
      roles: `/identity/roles/${row.id}/status`,
      users: `/identity/users/${row.id}/status`,
      departments: `/tenants/${apiSession.tenantId}/departments/${row.id}/status`,
      branches: `/tenants/${apiSession.tenantId}/branches/${row.id}/status`,
    };
    setBusy(true);
    setMessage("");
    try {
      if (entity === "suppliers")
        await apiFetch(`/pharmacy/suppliers/${row.id}`, apiSession, {
          method: "PATCH",
          body: JSON.stringify({ is_active: !row.is_active }),
        });
      else if (entity === "tax")
        await apiFetch(`/billing/tax-rules/${row.id}`, apiSession, {
          method: "PATCH",
          body: JSON.stringify({ is_active: !row.is_active }),
        });
      else if (entity === "offers")
        await apiFetch(`/billing/discount-offers/${row.id}`, apiSession, {
          method: "PATCH",
          body: JSON.stringify({ is_active: !row.is_active }),
        });
      else
        await apiFetch(paths[entity], apiSession, {
          method: "POST",
          body: JSON.stringify({ is_active: !row.is_active }),
        });
      await loadAdmin();
      setMessage(`${title(entity)} status updated.`);
    } catch (err: any) {
      setMessage(err.message || "Could not change status.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function deleteRow(entity: string, row: any) {
    const paths: any = {
      roles: `/identity/roles/${row.id}`,
      users: `/identity/users/${row.id}`,
      departments: `/tenants/${apiSession.tenantId}/departments/${row.id}`,
      branches: `/tenants/${apiSession.tenantId}/branches/${row.id}`,
      suppliers: `/pharmacy/suppliers/${row.id}`,
    };
    setBusy(true);
    setMessage("");
    try {
      await apiFetch(paths[entity], apiSession, { method: "DELETE" });
      await loadAdmin();
      setMessage(`${title(entity)} deactivated.`);
    } catch (err: any) {
      setMessage(err.message || "Could not delete record.");
    } finally {
      setBusy(false);
      setConfirm(null);
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
      await loadAdmin();
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
      upload.append("attached_to_name", apiSession.tenantId);
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
      await loadAdmin();
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
      await loadAdmin();
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
      await loadAdmin();
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
      await loadAdmin();
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

  if (!apiSession)
    return (
      <Card>
        <h3 className="text-lg font-bold">Tenant Admin</h3>
        <p className="mt-2 text-sm text-slate-500">
          Login to manage tenant settings.
        </p>
      </Card>
    );
  if (visibleSections.length === 0)
    return (
      <Card>
        <h3 className="text-lg font-bold">Tenant Admin</h3>
        <p className="mt-2 text-sm text-slate-500">
          Your role does not include tenant administration permissions.
        </p>
      </Card>
    );

  return (
    <div className="space-y-5">
      <StatusToast message={message} onClose={() => setMessage("")} />
      {section === "users" && view === "list" && (
        <ListCard
          title="Users"
          rows={users}
          searchKeys={["name", "email", "mobile", "user_type", "roles", "id"]}
          createLabel="Create User"
          onCreate={() => setView("create")}
          onRefresh={loadAdmin}
          columns={USER_COLUMNS}
          render={(user: any) => (
            <UserRow
              key={user.id}
              user={user}
              branches={branches}
              onEdit={() => {
                setSelectedId(user.id);
                setView("edit");
              }}
              onStatus={() =>
                setConfirm({ entity: "users", kind: "status", row: user })
              }
              onDelete={() =>
                setConfirm({ entity: "users", kind: "delete", row: user })
              }
            />
          )}
        />
      )}
      {section === "users" && view === "create" && (
        <UserForm
          title="Create User"
          roles={roles}
          branches={branches}
          busy={busy}
          onSubmit={createUser}
          onRoleOpen={openRolePermissions}
          apiSession={apiSession}
          back={() => open("users")}
        />
      )}
      {section === "users" && view === "edit" && selectedUser && (
        <UserForm
          title="Edit User"
          user={selectedUser}
          roles={roles}
          branches={branches}
          busy={busy}
          onSubmit={updateUser}
          onRoleOpen={openRolePermissions}
          apiSession={apiSession}
          onResetPassword={setPasswordUser}
          back={() => open("users")}
        />
      )}
      {section === "roles" && view === "list" && (
        <ListCard
          title="Roles"
          rows={roles}
          searchKeys={["name", "key", "id"]}
          createLabel="Create Role"
          onCreate={() => setView("create")}
          onRefresh={loadAdmin}
          columns={ROLE_COLUMNS}
          render={(role: Role) => (
            <RoleRow
              key={role.id}
              role={role}
              onEdit={() => {
                setSelectedId(role.id);
                setView("edit");
              }}
              onStatus={() =>
                setConfirm({ entity: "roles", kind: "status", row: role })
              }
              onDelete={() =>
                setConfirm({ entity: "roles", kind: "delete", row: role })
              }
            />
          )}
        />
      )}
      {section === "roles" && view === "create" && (
        <RoleForm
          title="Create Role"
          permissions={permissions}
          busy={busy}
          onSubmit={createRole}
          back={() => open("roles")}
        />
      )}
      {section === "roles" && view === "edit" && selectedRole && (
        <RoleForm
          title="Edit Role"
          role={selectedRole}
          permissions={permissions}
          busy={busy}
          onSubmit={updateRole}
          back={() => open("roles")}
        />
      )}

      {section === "departments" && view === "list" && (
        <ListCard
          title="Medical Departments"
          rows={departmentGroups}
          searchKeys={["name", "code", "branch_names", "description", "id"]}
          createLabel="Create  Department"
          onCreate={() => setView("create")}
          onRefresh={loadAdmin}
          columns={DEPARTMENT_COLUMNS}
          render={(department: any) => (
            <DepartmentRow
              key={department.id}
              department={department}
              branches={branches}
              onEdit={() => {
                setSelectedId(department.primary.id);
                setView("edit");
              }}
              onStatus={() =>
                setConfirm({
                  entity: "departments",
                  kind: "status",
                  row: department.primary,
                })
              }
              onDelete={() =>
                setConfirm({
                  entity: "departments",
                  kind: "delete",
                  row: department.primary,
                })
              }
            />
          )}
        />
      )}
      {section === "departments" && view === "create" && (
        <DepartmentForm
          title="Create Department"
          departments={departments}
          branches={branches}
          busy={busy}
          onSubmit={createDepartment}
          back={() => open("departments")}
        />
      )}
      {section === "departments" && view === "edit" && selectedDepartment && (
        <DepartmentForm
          title="Edit Department"
          department={selectedDepartment}
          departments={departments}
          branches={branches}
          busy={busy}
          onSubmit={updateDepartment}
          back={() => open("departments")}
        />
      )}

      {section === "branches" && view === "list" && (
        <ListCard
          title="Branches"
          rows={branches}
          searchKeys={["name", "code", "city", "state", "id"]}
          createLabel="Create Branch"
          onCreate={() => setView("create")}
          onRefresh={loadAdmin}
          columns={BRANCH_COLUMNS}
          render={(branch: any) => (
            <BranchRow
              key={branch.id}
              branch={branch}
              onEdit={() => {
                setSelectedId(branch.id);
                setView("edit");
              }}
              onStatus={() =>
                setConfirm({ entity: "branches", kind: "status", row: branch })
              }
              onDelete={() =>
                setConfirm({ entity: "branches", kind: "delete", row: branch })
              }
            />
          )}
        />
      )}
      {section === "branches" && view === "create" && (
        <BranchForm
          title="Create Branch"
          branchCount={
            branches.filter((branch: any) => branch.is_active !== false).length
          }
          branchLimit={subscriptionEntitlements?.included_branches}
          busy={busy}
          onSubmit={createBranch}
          back={() => open("branches")}
        />
      )}
      {section === "branches" && view === "edit" && selectedBranch && (
        <BranchForm
          title="Edit Branch"
          branch={selectedBranch}
          busy={busy}
          onSubmit={updateBranch}
          back={() => open("branches")}
        />
      )}

      {section === "suppliers" && view === "list" && (
        <ListCard
          title="Suppliers"
          rows={suppliers}
          searchKeys={["name", "gstin", "phone", "email", "address", "id"]}
          createLabel="Create Supplier"
          onCreate={() => setView("create")}
          onRefresh={loadAdmin}
          columns={SUPPLIER_COLUMNS}
          render={(supplier: any) => (
            <SupplierRow
              key={supplier.id}
              supplier={supplier}
              onEdit={() => {
                setSelectedId(supplier.id);
                setView("edit");
              }}
              onStatus={() =>
                setConfirm({
                  entity: "suppliers",
                  kind: "status",
                  row: supplier,
                })
              }
              onDelete={() =>
                setConfirm({
                  entity: "suppliers",
                  kind: "delete",
                  row: supplier,
                })
              }
            />
          )}
        />
      )}
      {section === "suppliers" && view === "create" && (
        <SupplierForm
          title="Create Supplier"
          busy={busy}
          onSubmit={createSupplier}
          back={() => open("suppliers")}
        />
      )}
      {section === "suppliers" && view === "edit" && selectedSupplier && (
        <SupplierForm
          title="Edit Supplier"
          supplier={selectedSupplier}
          busy={busy}
          onSubmit={updateSupplier}
          back={() => open("suppliers")}
        />
      )}

      {section === "tax" && view === "list" && (
        <ListCard
          title="Tax Rules"
          rows={taxRules}
          searchKeys={["name", "tax_label", "service_scope", "id"]}
          createLabel="Create Tax Rule"
          onCreate={() => setView("create")}
          onRefresh={loadAdmin}
          columns={TAX_RULE_COLUMNS}
          render={(rule: any) => (
            <TaxRuleRow
              key={rule.id}
              rule={rule}
              branches={branches}
              onEdit={() => {
                setSelectedId(rule.id);
                setView("edit");
              }}
              onStatus={() =>
                setConfirm({ entity: "tax", kind: "status", row: rule })
              }
              onDelete={() =>
                setConfirm({ entity: "tax", kind: "status", row: rule })
              }
            />
          )}
        />
      )}
      {section === "tax" && view === "create" && (
        <TaxRuleForm
          title="Create Tax Rule"
          branches={branches}
          busy={busy}
          onSubmit={createTaxRule}
          back={() => open("tax")}
        />
      )}
      {section === "tax" && view === "edit" && selectedTaxRule && (
        <TaxRuleForm
          title="Edit Tax Rule"
          rule={selectedTaxRule}
          branches={branches}
          busy={busy}
          onSubmit={updateTaxRule}
          back={() => open("tax")}
        />
      )}

      {section === "offers" && view === "list" && (
        <ListCard
          title="Discounts & Offers"
          rows={discountOffers}
          searchKeys={["name", "code", "service_scope", "discount_type", "id"]}
          createLabel="Create Offer"
          onCreate={() => setView("create")}
          onRefresh={loadAdmin}
          columns={DISCOUNT_OFFER_COLUMNS}
          render={(offer: any) => (
            <DiscountOfferRow
              key={offer.id}
              offer={offer}
              branches={branches}
              onEdit={() => {
                setSelectedId(offer.id);
                setView("edit");
              }}
              onStatus={() =>
                setConfirm({ entity: "offers", kind: "status", row: offer })
              }
              onDelete={() =>
                setConfirm({ entity: "offers", kind: "status", row: offer })
              }
            />
          )}
        />
      )}
      {section === "offers" && view === "create" && (
        <DiscountOfferForm
          title="Create Discount Offer"
          branches={branches}
          busy={busy}
          onSubmit={createDiscountOffer}
          back={() => open("offers")}
        />
      )}
      {section === "offers" && view === "edit" && selectedOffer && (
        <DiscountOfferForm
          title="Edit Discount Offer"
          offer={selectedOffer}
          branches={branches}
          busy={busy}
          onSubmit={updateDiscountOffer}
          back={() => open("offers")}
        />
      )}

      {section === "membership" && (
        <PatientSubscriptions
          apiSession={apiSession}
          branchId={branchId}
          branches={branches}
          patients={patients}
        />
      )}

      {section === "files" && (
        <FilesPanel
          apiSession={apiSession}
          files={files}
          setFiles={setFiles}
          setMessage={setMessage}
          branches={branches}
          patients={patients}
          busy={busy}
          setBusy={setBusy}
        />
      )}

      {section === "settings" && (
        <SettingsPanel
          apiSession={apiSession}
          settings={settings}
          invoicePrefix={invoicePrefix}
          setInvoicePrefix={setInvoicePrefix}
          numberingRules={numberingRules}
          setNumberingRules={setNumberingRules}
          invoiceLogoUrl={invoiceLogoUrl}
          setInvoiceLogoUrl={setInvoiceLogoUrl}
          bankDetails={bankDetails}
          setBankDetails={setBankDetails}
          tenantLogoUrl={clinic?.logo_url || ""}
          uploadInvoiceLogo={uploadInvoiceLogo}
          requeueAfter={requeueAfter}
          setRequeueAfter={setRequeueAfter}
          noShowAfter={noShowAfter}
          setNoShowAfter={setNoShowAfter}
          slotIntervalsEnabled={slotIntervalsEnabled}
          setSlotIntervalsEnabled={setSlotIntervalsEnabled}
          slotIntervalMinutes={slotIntervalMinutes}
          setSlotIntervalMinutes={setSlotIntervalMinutes}
          payments={payments}
          setPayments={setPayments}
          providers={providers}
          setProviders={setProviders}
          busy={busy}
          saveSettings={saveSettings}
          reportEnabled={reportEnabled}
          setReportEnabled={setReportEnabled}
          reportRecipients={reportRecipients}
          setReportRecipients={setReportRecipients}
          reportCc={reportCc}
          setReportCc={setReportCc}
          reportSendDay={reportSendDay}
          setReportSendDay={setReportSendDay}
          reportFilters={reportFilters}
          setReportFilters={setReportFilters}
          reportJobs={reportJobs}
          reportBusy={reportBusy}
          saveReportSettings={saveReportSettings}
          sendMonthlyReportNow={sendMonthlyReportNow}
          resendMonthlyReport={resendMonthlyReport}
          downloadMonthlyReport={downloadMonthlyReport}
        />
      )}
      {confirm && (
        <ConfirmModal
          action={confirm}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            confirm.kind === "delete"
              ? deleteRow(confirm.entity, confirm.row)
              : changeStatus(confirm.entity, confirm.row)
          }
        />
      )}
      {passwordUser && (
        <PasswordResetModal
          user={passwordUser}
          busy={busy}
          onSubmit={resetUserPassword}
          onCancel={() => setPasswordUser(null)}
        />
      )}
    </div>
  );
}
