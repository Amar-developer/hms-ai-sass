"use client";

import { useEffect, useState } from "react";
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
import {
  FormField,
} from "@/app/components/FormElements";
import { patientSearchText,toRow } from "./helpers";
import { PatientForm } from "@/features/patients/forms/PatientForms";
import { PatientDetail } from "./components/PatientDetail";
import { activeTenantOptions } from "@/utils/helper";
import { PatientRow } from "./components/PatientRow";
import { mapPatient } from "@/lib/liveData";
import { canCopyDatabaseIds } from "@/app/components/common/CopyIdButton";

type PatientProps = {
  apiSession: ApiSession | null;
  branchId?: string;
  loadLiveData?: (session: ApiSession) => void | Promise<unknown>;
  setActive?: (page: string) => void;
  setPatients?: (updater: (prev: any[]) => any[]) => void;
};

const pageSize = 10;
const genders = [
  ["male", "Male"],
  ["female", "Female"],
  ["other", "Other"],
  ["unknown", "Unknown"],
] as const;

export function Patient({
  apiSession,
  branchId,
  loadLiveData,
  setActive,
  setPatients,
}: PatientProps) {
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

  async function loadData(nextTenantId = tenantId) {
    if (!apiSession || !nextTenantId) return;
    setBusy(true);
    setMessage("");
    const session = { ...apiSession, tenantId: nextTenantId };
    try {
      const [branchRows, patientRows] = await Promise.all([
        apiFetch(`/tenants/${nextTenantId}/branches`, session).catch(() => []),
        apiFetch(
          `/patients?limit=100&active_only=false${query ? `&q=${encodeURIComponent(query)}` : ""}`,
          session,
        ),
      ]);
      setBranches(branchRows);
      setRows(patientRows);
      if (!selectedId && patientRows[0]?.id) setSelectedId(patientRows[0].id);
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
      loadData(tenantId);
    }
  }, [apiSession?.email, tenantId]);

  useEffect(() => {
    if (!apiSession || !tenantId || typeof window === "undefined") return;
    const pendingPatientId = sessionStorage.getItem("medizinhub.patientId");
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
    if (!scopedSession || !selectedId) return;
    if (!data.planId) {
      setMessage("Select membership plan.");
      return;
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
          starts_on: data.startsOn || new Date().toISOString().slice(0, 10),
          paid_amount:
            data.paidAmount !== "" ? Number(data.paidAmount) : undefined,
          payment_method: data.paymentMethod || "cash",
          created_by_user_id: apiSession.user?.id,
        }),
      });
      await loadPatientDetail(selectedId);
      if (loadLiveData) await loadLiveData(scopedSession);
      setMessage("Patient membership enrolled and purchase invoice created.");
    } catch (err: any) {
      setMessage(err.message || "Could not enroll membership.");
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
        onSubmit={createPatient}
        back={() => open("list")}
      />
    );
  if (view === "edit" && selected && canEditPatient)
    return (
      <PatientForm
        key={`${selected.id}:${selected.updated_at || ""}`}
        title="Edit Patient"
        patient={selected}
        branches={branches}
        defaultBranchId={branchId || apiSession?.user?.branch_id || ""}
        busy={busy}
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

  const filtered = rows
    .filter((row: any) => {
      const search = String(query || "").trim().toLowerCase();
      const created = row.created_at ? new Date(row.created_at).getTime() : 0;
      const from = fromDate ? new Date(fromDate).getTime() : 0;
      const to = toDate
        ? new Date(`${toDate}T23:59:59`).getTime()
        : Number.MAX_SAFE_INTEGER;
      const branch = branches.find((item: any) => item.id === row.branch_id);
      const text = patientSearchText(row, branch);
      return (
        (!search || text.includes(search)) &&
        (status === "all" || row.status === status) &&
        (gender === "all" || row.gender === gender) &&
        (branchFilter === "all" || row.branch_id === branchFilter) &&
        (!fromDate || created >= from) &&
        (!toDate || created <= to)
      );
    })
    .sort(
      (a: any, b: any) =>
        new Date(b.updated_at || b.created_at).getTime() -
        new Date(a.updated_at || a.created_at).getTime(),
    );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  return (
    <Card className="space-y-5">
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
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
        <div
          className={`grid gap-3 ${isSuperAdmin ? "md:grid-cols-3 lg:grid-cols-[1.2fr_1.1fr_.9fr_.9fr_.85fr_.85fr_auto]" : "md:grid-cols-4 lg:grid-cols-4"}`}
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
          <FormField label="Patient / Mobile">
            <Input
              value={query}
              onChange={(event: any) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Name, mobile, area"
            />
          </FormField>
          <FormField label="Branch">
            <SearchableSelect
              name="branch"
              value={branchFilter}
              onChange={(v: string) => {
                setBranchFilter(v);
                setPage(1);
              }}
              options={[
                { value: "all", label: "All branches" },
                ...branches.map((b: any) => ({
                  value: b.id,
                  label: b.name,
                })),
              ]}
              placeholder="Select branch"
              searchable={branches.length > 8}
            />
          </FormField>
          <FormField label="Status">
            <SearchableSelect
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              options={[
                { value: "all", label: "All status" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
                { value: "deceased", label: "Deceased" },
              ]}
              searchable={false}
            />
          </FormField>

          <div className="flex items-end gap-2">
            <Button
              // className="min-h-[46px] px-5  rounded-lg text-xs lg:text-sm py-2 px-2 lg:py-3 lg:px-4"
              onClick={() => {
                setPage(1);
                loadData(tenantId);
              }}
              disabled={busy}
              className="save-button"
            >
              {busy ? "Searching..." : "Search"}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setQuery("");
                setStatus("all");
                setGender("all");
                setBranchFilter("all");
                setFromDate("");
                setToDate("");
                setPage(1);
                setTimeout(() => loadData(tenantId), 0);
              }}
              className="save-button"
            >
              Reset
            </Button>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white z-0 scrollbar-thin">
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
            {pageRows.length === 0 && (
              <Empty
                text={
                  busy
                    ? "Loading patients..."
                    : "No patients match your search."
                }
              />
            )}{" "}
            {pageRows.map((row: any) => (
              <PatientRow
                key={row.id}
                row={row}
                branches={branches}
                canCopyIds={canCopyIds}
                onView={() => open("detail", row.id)}
                onEdit={canEditPatient ? () => openPatientEdit(row.id) : undefined}
                onDelete={canDeletePatient ? () => setConfirm({ row }) : undefined}
                onActivate={canEditPatient ? () => activatePatient(row) : undefined}
              />
            ))}
          </div>
        </div>
      </div>
      <Pagination
        page={safePage}
        totalPages={totalPages}
        total={filtered.length}
        onPage={setPage}
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
