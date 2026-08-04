"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";
import { Empty } from "@/app/components/common/Empty";
import { Pagination } from "@/app/components/common/Pagination";
import {
  Button,
  Card,
  Input,
  RefreshButton,
  SearchableSelect,
  StatusToast,
} from "@/app/components/common/ui";
import { apiFetch, apiUpload, type ApiSession } from "@/lib/api";
import { readNotificationTarget } from "@/lib/notificationTarget";
import { FormField } from "@/app/components/FormElements";
import { toRow, todayInputValue } from "./helpers";
import { PatientForm } from "@/features/patients/forms/PatientForms";
import { PatientDetail } from "./components/PatientDetail";
import { activeTenantOptions } from "@/utils/helper";
import { PatientRow } from "./components/PatientRow";
import { mapPatient } from "@/lib/liveData";
import { canCopyDatabaseIds } from "@/app/components/common/CopyIdButton";
import { TableSkeleton } from "@/app/components/common/loader/TableSkeleton";
import { patient_status_options } from "./constants";
import { useQueryClient } from "@tanstack/react-query";
import { getTenantBranches } from "@/features/tenants/api/tenantReferenceQueries";
import { FilterSection } from "@/app/components/common/FilterSection";

type PatientProps = {
  apiSession: ApiSession | null;
  branchId?: string;
  loadLiveData?: (session: ApiSession) => void | Promise<unknown>;
  setActive?: (page: string) => void;
  setPatients?: (updater: (prev: any[]) => any[]) => void;
};

const pageSize = 10;
export function Patient({
  apiSession,
  branchId,
  loadLiveData,
  setActive,
  setPatients,
}: PatientProps) {
  const queryClient = useQueryClient();
  const isSuperAdmin = Boolean(apiSession?.user?.is_super_admin);
  const canCopyIds = canCopyDatabaseIds(apiSession?.user);
  const userPermissions = apiSession?.user?.permissions || [];
  const hasPermission = (...keys: string[]) =>
    Boolean(
      isSuperAdmin ||
      userPermissions.includes("*") ||
      keys.some((key) => userPermissions.includes(key)),
    );
  const canCreatePatient = hasPermission("patients.write", "patients.create");
  const canEditPatient = hasPermission("patients.edit");
  const canDeletePatient = hasPermission("patients.delete");
  const [view, setView] = useState("list");
  const [tenants, setTenants] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState(apiSession?.tenantId || "");
  const [branches, setBranches] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [selectedDetail, setSelectedDetail] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [consultations, setConsultations] = useState<any[]>([]);
  const [labOrders, setLabOrders] = useState<any[]>([]);
  const [pharmacyIssues, setPharmacyIssues] = useState<any[]>([]);
  const [physioCases, setPhysioCases] = useState<any[]>([]);
  const [patientIpAdmissions, setPatientIpAdmissions] = useState<any[]>([]);
  const [membershipPlans, setMembershipPlans] = useState<any[]>([]);
  const [membershipEnrollments, setMembershipEnrollments] = useState<any[]>([]);
  const [patientInvoices, setPatientInvoices] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [gender, setGender] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<any>(null);
  const scopedSession =
    apiSession && tenantId ? { ...apiSession, tenantId } : apiSession;
  const selected =
    selectedDetail || rows.find((row: any) => row.id === selectedId);

  function syncSharedPatient(patient: any) {
    if (!setPatients || !patient?.id) return;
    const mapped = mapPatient(patient);
    setPatients((previous: any[]) =>
      previous.some((row: any) => row.id === mapped.id)
        ? previous.map((row: any) => (row.id === mapped.id ? mapped : row))
        : [mapped, ...previous],
    );
  }

  async function loadTenants() {
    if (!apiSession?.user?.is_super_admin) return;
    const tenantRows = activeTenantOptions(
      await apiFetch("/tenants", apiSession),
    );
    setTenants(tenantRows);
    if (!tenantId || !tenantRows.some((tenant: any) => tenant.id === tenantId))
      setTenantId(
        tenantRows.find((tenant: any) => !tenant.is_primary)?.id ||
          tenantRows[0]?.id ||
          apiSession.tenantId,
      );
  }

  async function loadData(
    nextTenantId = tenantId,
    nextPage = page,
    filterOverrides: Record<string, string> = {},
  ) {
    if (!apiSession || !nextTenantId) return;
    setBusy(true);
    setMessage("");
    const session = { ...apiSession, tenantId: nextTenantId };
    try {
      const filters = {
        query,
        status,
        gender,
        branchFilter,
        fromDate,
        toDate,
        ...filterOverrides,
      };
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String((nextPage - 1) * pageSize),
        active_only: "false",
      });
      if (filters.query) params.set("q", filters.query);
      if (filters.status && filters.status !== "all")
        params.set("status", filters.status);
      if (filters.gender && filters.gender !== "all")
        params.set("gender", filters.gender);
      if (filters.branchFilter && filters.branchFilter !== "all")
        params.set("branch_id", filters.branchFilter);
      if (filters.fromDate) params.set("from_date", filters.fromDate);
      if (filters.toDate) params.set("to_date", filters.toDate);
      const [branchRows, patientRows] = await Promise.all([
        getTenantBranches(queryClient, session, nextTenantId).catch(() => []),
        apiFetch(`/patients/page?${params.toString()}`, session),
      ]);
      setBranches(branchRows);
      setRows(patientRows.items || []);
      setTotalRows(patientRows.total || 0);
      if (!selectedId && patientRows.items?.[0]?.id)
        setSelectedId(patientRows.items[0].id);
    } catch (err: any) {
      setMessage(err.message || "Could not load patients.");
    } finally {
      setBusy(false);
    }
  }

  async function loadPatientDetail(id: string) {
    if (!scopedSession || !id) return;
    setBusy(true);
    setMessage("");
    setConsultations([]);
    setLabOrders([]);
    setPharmacyIssues([]);
    setPhysioCases([]);
    setPatientIpAdmissions([]);
    setMembershipEnrollments([]);
    setPatientInvoices([]);
    try {
      const [
        detail,
        summaryData,
        consultationRows,
        labRows,
        pharmacyRows,
        physioRows,
        ipRows,
        planRows,
        enrollmentRows,
        invoiceRows,
      ] = await Promise.all([
        apiFetch(`/patients/${id}`, scopedSession),
        apiFetch(`/patients/${id}/summary`, scopedSession),
        apiFetch(
          `/consultations?patient_id=${id}&limit=50`,
          scopedSession,
        ).catch(() => []),
        apiFetch(`/lab/orders?patient_id=${id}&limit=50`, scopedSession).catch(
          () => [],
        ),
        apiFetch(
          `/pharmacy/issues?patient_id=${id}&limit=50`,
          scopedSession,
        ).catch(() => []),
        apiFetch(
          `/physiotherapy/cases?patient_id=${id}&limit=50`,
          scopedSession,
        ).catch(() => []),
        apiFetch(
          `/ip/admissions?patient_id=${id}&limit=50`,
          scopedSession,
        ).catch(() => []),
        apiFetch(
          "/patient-subscriptions/plans?include_inactive=true",
          scopedSession,
        ).catch(() => []),
        apiFetch(
          `/patient-subscriptions/enrollments?patient_id=${id}`,
          scopedSession,
        ).catch(() => []),
        apiFetch(`/billing/invoices?patient_id=${id}`, scopedSession).catch(
          () => [],
        ),
      ]);
      setSelectedDetail(detail);
      setSummary(summaryData);
      setSelectedId(id);
      setConsultations(Array.isArray(consultationRows) ? consultationRows : []);
      setLabOrders(Array.isArray(labRows) ? labRows : []);
      setPharmacyIssues(Array.isArray(pharmacyRows) ? pharmacyRows : []);
      setPhysioCases(Array.isArray(physioRows) ? physioRows : []);
      setPatientIpAdmissions(Array.isArray(ipRows) ? ipRows : []);
      setMembershipPlans(Array.isArray(planRows) ? planRows : []);
      setMembershipEnrollments(
        Array.isArray(enrollmentRows) ? enrollmentRows : [],
      );
      setPatientInvoices(Array.isArray(invoiceRows) ? invoiceRows : []);
    } catch (err: any) {
      setMessage(err.message || "Could not load patient details.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (apiSession) {
      loadTenants();
    }
  }, [apiSession?.email]);
  useEffect(() => {
    if (apiSession && tenantId) {
      setPage(1);
      loadData(tenantId, 1);
    }
  }, [apiSession?.email, tenantId]);

  const skipFirstQuerySearch = useRef(true);
  useEffect(() => {
    if (skipFirstQuerySearch.current) {
      skipFirstQuerySearch.current = false;
      return;
    }
    if (!apiSession || !tenantId) return;
    const timer = window.setTimeout(() => {
      setPage(1);
      loadData(tenantId, 1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!apiSession || !tenantId || typeof window === "undefined") return;
    const pendingPatientId =
      sessionStorage.getItem("medizinhub.patientId") ||
      readNotificationTarget("patient")?.resourceId;
    if (!pendingPatientId) return;
    sessionStorage.removeItem("medizinhub.patientId");
    setSelectedId(pendingPatientId);
    setView("detail");
    loadPatientDetail(pendingPatientId);
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  }, [apiSession?.email, tenantId]);

  function open(nextView: string, id = "") {
    if (id) setSelectedId(id);
    if (nextView === "detail" && id) loadPatientDetail(id);
    setView(nextView);
    setMessage("");
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  }

  async function openPatientEdit(id: string) {
    if (!scopedSession || !id) return;
    setBusy(true);
    setMessage("");
    try {
      const hasCompleteEditRecord =
        selectedDetail?.id === id &&
        "date_of_birth" in selectedDetail &&
        "email" in selectedDetail &&
        "alternate_mobile" in selectedDetail &&
        "address" in selectedDetail &&
        "blood_group" in selectedDetail;
      const detail = hasCompleteEditRecord
        ? selectedDetail
        : await apiFetch(`/patients/${id}`, scopedSession);
      setSelectedId(id);
      setSelectedDetail(detail);
      setView("edit");
      requestAnimationFrame(() =>
        window.scrollTo({ top: 0, behavior: "smooth" }),
      );
    } catch (err: any) {
      setMessage(err.message || "Could not load the complete patient record.");
    } finally {
      setBusy(false);
    }
  }

  async function createPatient(data: any) {
    if (!scopedSession) return;
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch("/patients", scopedSession, {
        method: "POST",
        body: JSON.stringify({
          branch_id: data.branchId || null,
          full_name: data.fullName,
          mobile: data.mobile || null,
          alternate_mobile: data.alternateMobile || null,
          email: data.email || null,
          gender: data.gender || "unknown",
          date_of_birth: data.dateOfBirth || null,
          age_years: data.ageYears ? Number(data.ageYears) : null,
          guardian_name: data.guardianName || null,
          guardian_mobile: data.guardianMobile || null,
          area: data.area || null,
          address: data.address || null,
          blood_group: data.bloodGroup || null,
          whatsapp_consent_status: data.whatsappConsentStatus || "not_recorded",
          whatsapp_consent_source: data.whatsappConsentSource || null,
          whatsapp_preferred_language: data.whatsappPreferredLanguage || "en",
        }),
      });
      setRows((previous: any[]) => [
        toRow(created),
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      syncSharedPatient(created);
      setSelectedId(created.id);
      await loadData(tenantId);
      open("detail", created.id);
      setMessage(`Patient created: ${created.full_name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not create patient.");
    } finally {
      setBusy(false);
    }
  }

  async function updatePatient(data: any) {
    if (!scopedSession || !selectedId) return;
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(`/patients/${selectedId}`, scopedSession, {
        method: "PATCH",
        body: JSON.stringify({
          branch_id: data.branchId || null,
          full_name: data.fullName,
          mobile: data.mobile || null,
          alternate_mobile: data.alternateMobile || null,
          email: data.email || null,
          gender: data.gender || "unknown",
          date_of_birth: data.dateOfBirth || null,
          age_years: data.ageYears ? Number(data.ageYears) : null,
          guardian_name: data.guardianName || null,
          guardian_mobile: data.guardianMobile || null,
          area: data.area || null,
          address: data.address || null,
          blood_group: data.bloodGroup || null,
          status: data.status || "active",
          whatsapp_consent_status: data.whatsappConsentStatus || "not_recorded",
          whatsapp_consent_source: data.whatsappConsentSource || null,
          whatsapp_preferred_language: data.whatsappPreferredLanguage || "en",
        }),
      });
      setRows((previous: any[]) => [
        toRow(updated),
        ...previous.filter((row: any) => row.id !== updated.id),
      ]);
      syncSharedPatient(updated);
      setSelectedDetail(updated);
      await loadData(tenantId);
      open("detail", updated.id);
      setMessage("Patient updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update patient.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (!scopedSession || !selectedId) return;
    const fd = new FormData();
    fd.append("file", file);
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiUpload(
        `/patients/${selectedId}/photo`,
        scopedSession,
        fd,
      );
      setSelectedDetail(updated);
      setRows((previous: any[]) => [
        toRow(updated),
        ...previous.filter((row: any) => row.id !== updated.id),
      ]);
      syncSharedPatient(updated);
      setMessage("Photo uploaded.");
    } catch (err: any) {
      setMessage(err.message || "Could not upload photo.");
    } finally {
      setBusy(false);
    }
  }

  async function deactivatePatient(row: any) {
    if (!scopedSession) return;
    setBusy(true);
    setMessage("");
    try {
      await apiFetch(`/patients/${row.id}`, scopedSession, {
        method: "DELETE",
      });
      setRows((previous: any[]) =>
        previous.map((item: any) =>
          item.id === row.id ? { ...item, status: "inactive" } : item,
        ),
      );
      if (setPatients) {
        setPatients((previous: any[]) =>
          previous.map((item: any) =>
            item.id === row.id ? { ...item, status: "inactive" } : item,
          ),
        );
      }
      if (selectedId === row.id)
        setSelectedDetail({ ...selectedDetail, status: "inactive" });
      setMessage("Patient deleted/deactivated.");
    } catch (err: any) {
      setMessage(err.message || "Could not delete patient.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function activatePatient(row: any) {
    if (!scopedSession) return;
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(`/patients/${row.id}`, scopedSession, {
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
      });
      setRows((previous: any[]) =>
        previous.map((item: any) =>
          item.id === row.id ? { ...item, status: updated.status } : item,
        ),
      );
      syncSharedPatient(updated);
      if (selectedId === row.id) setSelectedDetail(updated);
      setMessage("Patient activated.");
    } catch (err: any) {
      setMessage(err.message || "Could not activate patient.");
    } finally {
      setBusy(false);
    }
  }

  async function enrollMembership(data: any) {
    if (!scopedSession || !selectedId) return false;
    if (!data.planId) {
      setMessage("Select membership plan.");
      return false;
    }
    setBusy(true);
    setMessage("");
    try {
      await apiFetch("/patient-subscriptions/enrollments", scopedSession, {
        method: "POST",
        body: JSON.stringify({
          branch_id: data.branchId || selected?.branch_id || branchId,
          patient_id: selectedId,
          plan_id: data.planId,
          starts_on: data.startsOn || todayInputValue(),
          paid_amount:
            data.paidAmount !== "" ? Number(data.paidAmount) : undefined,
          payment_method: data.paymentMethod || "cash",
          created_by_user_id: apiSession.user?.id,
        }),
      });
      await Promise.all([
        loadPatientDetail(selectedId),
        loadLiveData?.(scopedSession),
      ]);
      setMessage("Patient membership enrolled and purchase invoice created.");
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not enroll membership.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!apiSession)
    return (
      <Card>
        <h3 className="card-title font-bold">EMR / Patient Management</h3>
        <p className="mt-2 text-sm text-slate-500">
          Backend login is required to view patient records.
        </p>
      </Card>
    );

  if (view === "create" && canCreatePatient)
    return (
      <PatientForm
        title="Create Patient"
        branches={branches}
        defaultBranchId={branchId || apiSession?.user?.branch_id || ""}
        busy={busy}
        error={message}
        onSubmit={createPatient}
        back={() => open("list")}
      />
    );
  if (view === "edit" && selected && canEditPatient)
    return (
      <PatientForm
        key={selected.id}
        title="Edit Patient"
        patient={selected}
        branches={branches}
        defaultBranchId={branchId || apiSession?.user?.branch_id || ""}
        busy={busy}
        error={message}
        onSubmit={updatePatient}
        back={() => open("detail", selected.id)}
      />
    );
  if (view === "detail" && selected)
    return (
      <PatientDetail
        apiSession={apiSession}
        patient={selected}
        summary={summary}
        patientIpAdmissions={patientIpAdmissions}
        consultations={consultations}
        labOrders={labOrders}
        pharmacyIssues={pharmacyIssues}
        physioCases={physioCases}
        membershipPlans={membershipPlans}
        membershipEnrollments={membershipEnrollments}
        patientInvoices={patientInvoices}
        branches={branches}
        loading={busy}
        message={message}
        onMessageClose={() => setMessage("")}
        onEnrollMembership={enrollMembership}
        onBack={() => open("list")}
        onEdit={() => openPatientEdit(selected.id)}
        onUploadPhoto={uploadPhoto}
        setActive={setActive}
      />
    );

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows;

  const patientFilters = [
    {
      key: "branch",
      label: "Branch",
      options: [
        { value: "all", label: "All branches" },
        ...branches.map((b: any) => ({
          value: b.id,
          label: b.name,
        })),
      ],
    },
    {
      key: "status",
      label: "Status",
      options: patient_status_options,
    },
  ];

  const filterValues = {
    branch: branchFilter,
    status,
  };

  const handleFilterChange = (key: string, value: string) => {
    setPage(1);

    const overrides: Record<string, string> = {};

    switch (key) {
      case "branch":
        setBranchFilter(value);
        overrides.branchFilter = value; // ← force the new value
        break;

      case "status":
        setStatus(value);
        overrides.status = value; // ← force the new value
        break;
    }

    loadData(tenantId, 1, overrides);
  };

  return (
    <Card className="">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0">
          <h3 className="card-title font-bold">EMR / Patient Management</h3>
          <p className="mt-1 max-w-3xl card-desc text-slate-500">
            Tenant-scoped patient registry with history, alerts, treatment
            timeline, and audited record views.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={() => loadData(tenantId)} />
          {canCreatePatient && (
            <button
              type="button"
              onClick={() => open("create")}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-xs font-bold text-white shadow-sm hover:bg-slate-800"
            >
              <Plus size={16} />
              Create Patient
            </button>
          )}
        </div>
      </div>
      <StatusToast message={message} onClose={() => setMessage("")} />
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 mt-3">
        <div
          className={`grid gap-3 ${isSuperAdmin ? "md:grid-cols-3 lg:grid-cols-[1.2fr_1.1fr_.9fr_.9fr_.85fr_.85fr_auto]" : "  "}`}
        >
          {isSuperAdmin && (
            <FormField label="Tenant">
              <SearchableSelect
                searchable={false}
                value={tenantId}
                onChange={setTenantId}
                options={tenants.map((t: any) => ({
                  value: t.id,
                  label: t.name,
                }))}
              />
            </FormField>
          )}

          <FilterSection
            title="Patient / Mobile"
            filters={patientFilters}
            filterValues={filterValues}
            className="lg:grid-cols-4"
            query={query}
            setQuery={setQuery}
            onFilterChange={handleFilterChange}
            onReset={() => {
              setStatus("all");
              setGender("all");
              setBranchFilter("all");
              setFromDate("");
              setToDate("");
              setPage(1);

              loadData(tenantId, 1, {
                query: "",
                status: "all",
                gender: "all",
                branchFilter: "all",
                fromDate: "",
                toDate: "",
              });
            }}
          >
          </FilterSection>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white z-0 scrollbar-thin mt-3">
        <div className="min-w-[1120px]">
          <div className="md:grid md:grid-cols-[1.25fr_.85fr_1fr_.75fr_.95fr_.65fr_.65fr]  lg:grid grid-cols-[1.25fr_.85fr_1fr_.75fr_.95fr_.65fr_1.35fr] items-center gap-4 bg-slate-50 px-5 py-3 text-xs font-bold uppercase text-slate-500 ">
            <span className="text-sm">Patient</span>
            <span className="text-sm">Mobile</span>
            <span className="text-sm">Branch</span>
            <span className="text-sm">Gender / Age</span>
            <span className="text-sm">Plan</span>
            <span className="text-sm text-center">Status</span>
            <span className="text-sm text-center">Actions</span>
          </div>
          <div className="divide-y divide-slate-200 z-0">
            {busy && <TableSkeleton />}
            {!busy && pageRows.length === 0 && (
              <Empty text="No patients match your search." />
            )}{" "}
            {!busy &&
              pageRows.map((row: any) => (
                <PatientRow
                  key={row.id}
                  row={row}
                  branches={branches}
                  canCopyIds={canCopyIds}
                  onView={() => open("detail", row.id)}
                  onEdit={
                    canEditPatient ? () => openPatientEdit(row.id) : undefined
                  }
                  onDelete={
                    canDeletePatient ? () => setConfirm({ row }) : undefined
                  }
                  onActivate={
                    canEditPatient ? () => activatePatient(row) : undefined
                  }
                />
              ))}
          </div>
        </div>
      </div>
      <Pagination
        page={safePage}
        totalPages={totalPages}
        total={totalRows}
        onPage={(nextPage) => {
          setPage(nextPage);
          loadData(tenantId, nextPage);
        }}
      />
      {confirm && (
        <ConfirmModal
          busy={busy}
          action={confirm.row}
          onCancel={() => setConfirm(null)}
          onConfirm={() => deactivatePatient(confirm.row)}
        />
      )}
    </Card>
  );
}
