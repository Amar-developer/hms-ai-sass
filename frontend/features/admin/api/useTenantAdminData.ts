"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { canUseTenantAdminSection } from "../permissions";
import { parseBankDetails,parseNumberingRules } from "../constants";
import {
  getTenantBranches,
  getTenantDepartments,
} from "@/features/tenants/api/tenantReferenceQueries";

export function useTenantAdminData(apiSession: any, clinic: any) {
  const queryClient = useQueryClient();
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
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
    vendor: true,
    department: true,
    invoice: true,
    collections: true,
    include_patient_details: false,
  });
  const [reportJobs, setReportJobs] = useState<any[]>([]);

  const loadSequence = useRef(0);

  async function reload() {
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
        canDepartments
          ? getTenantDepartments(queryClient, scoped).catch(() => [])
          : Promise.resolve([]),
        canBranches
          ? getTenantBranches(queryClient, scoped).catch(() => [])
          : Promise.resolve([]),
        safeFetch("/pharmacy/suppliers?include_inactive=true", canSuppliers),
        safeFetch("/billing/tax-rules", canTax),
        safeFetch("/billing/discount-offers", canOffers),
        safeFetch("/settings", canSettings),
        safeFetch("/files?limit=200", canFiles || canSettings),
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
        setReportFilters({
            overall: true,
            doctor: true,
            vendor: true,
            department: true,
            invoice: true,
            collections: true,
            include_patient_details: false,
            ...(reportConfig.filters || {}),
        });
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
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSession?.tenantId]);

  return {
    roles,
    setRoles,
    users,
    setUsers,
    departments,
    setDepartments,
    branches,
    setBranches,
    suppliers,
    setSuppliers,
    taxRules,
    setTaxRules,
    discountOffers,
    setDiscountOffers,
    settings,
    setSettings,
    files,
    setFiles,
    permissions,
    setPermissions,
    subscriptionEntitlements,
    busy,
    setBusy,
    message,
    setMessage,
    invoicePrefix,
    setInvoicePrefix,
    invoiceLogoUrl,
    setInvoiceLogoUrl,
    bankDetails,
    setBankDetails,
    numberingRules,
    setNumberingRules,
    requeueAfter,
    setRequeueAfter,
    noShowAfter,
    setNoShowAfter,
    slotIntervalsEnabled,
    setSlotIntervalsEnabled,
    slotIntervalMinutes,
    setSlotIntervalMinutes,
    payments,
    setPayments,
    providers,
    setProviders,
    reportEnabled,
    setReportEnabled,
    reportRecipients,
    setReportRecipients,
    reportCc,
    setReportCc,
    reportSendDay,
    setReportSendDay,
    reportFilters,
    setReportFilters,
    reportJobs,
    setReportJobs,
    reload,
  };
}
