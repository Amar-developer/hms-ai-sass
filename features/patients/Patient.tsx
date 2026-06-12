"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  ActionButton,
  ActionGroup,
  Badge,
  Button,
  Card,
  RefreshButton,
  StatusToast,
} from "@/components/common/ui";
import { UPLOADS_BASE, apiFetch, apiUpload, type ApiSession } from "@/lib/api";
import {
  DateField,
  NumberField,
  SelectField,
  TextField,
} from "@/components/FormElements";
import {
  PatientFormFields,
  patientFormPayload,
} from "@/features/patients/PatientFormFields";
import { paymentMethodOptions } from "@/lib/options";
import { displayDate } from "@/utils/helper";

type PatientProps = {
  apiSession: ApiSession | null;
  branchId?: string;
};

const pageSize = 10;
const genders = [
  ["male", "Male"],
  ["female", "Female"],
  ["other", "Other"],
  ["unknown", "Unknown"],
] as const;

export function Patient({ apiSession, branchId }: PatientProps) {
  const isSuperAdmin = Boolean(apiSession?.user?.is_super_admin);
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

  async function loadTenants() {
    if (!apiSession?.user?.is_super_admin) return;
    const tenantRows = activeTenantOptions(await apiFetch("/tenants", apiSession));
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
          `/patients?limit=100${query ? `&q=${encodeURIComponent(query)}` : ""}`,
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
        apiFetch('/patient-subscriptions/plans?include_inactive=true', scopedSession).catch(() => []),
        apiFetch(`/patient-subscriptions/enrollments?patient_id=${id}`, scopedSession).catch(() => []),
        apiFetch(`/billing/invoices?patient_id=${id}`, scopedSession).catch(() => []),
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
      setMembershipEnrollments(Array.isArray(enrollmentRows) ? enrollmentRows : []);
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
  }, [apiSession?.token]);
  useEffect(() => {
    if (apiSession && tenantId) {
      loadData(tenantId);
    }
  }, [apiSession?.token, tenantId]);

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
  }, [apiSession?.token, tenantId]);

  function open(nextView: string, id = "") {
    if (id) setSelectedId(id);
    if (nextView === "detail" && id) loadPatientDetail(id);
    setView(nextView);
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
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

  async function enrollMembership(data: any){
    if(!scopedSession||!selectedId)return;
    if(!data.planId){setMessage('Select membership plan.');return}
    setBusy(true);setMessage('');
    try{
      await apiFetch('/patient-subscriptions/enrollments',scopedSession,{method:'POST',body:JSON.stringify({
        branch_id:data.branchId||selected?.branch_id||branchId,
        patient_id:selectedId,
        plan_id:data.planId,
        starts_on:data.startsOn||new Date().toISOString().slice(0,10),
        paid_amount:data.paidAmount!==''?Number(data.paidAmount):undefined,
        payment_method:data.paymentMethod||"cash",
        created_by_user_id:apiSession.user?.id,
      })});
      await loadPatientDetail(selectedId);
      setMessage('Patient membership enrolled and purchase invoice created.');
    }catch(err:any){setMessage(err.message||'Could not enroll membership.')}finally{setBusy(false)}
  }

  if (!apiSession)
    return (
      <Card>
        <h3 className="text-lg font-bold">EMR / Patient Management</h3>
        <p className="mt-2 text-sm text-slate-500">
          Backend login is required to view patient records.
        </p>
      </Card>
    );

  if (view === "create")
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
  if (view === "edit" && selected)
    return (
      <PatientForm
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
        onEdit={() => open("edit", selected.id)}
        onUploadPhoto={uploadPhoto}
      />
    );

  const filtered = rows
    .filter((row: any) => {
      const search = query.trim().toLowerCase();
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
          <h3 className="text-lg font-bold">EMR / Patient Management</h3>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Tenant-scoped patient registry with history, alerts, treatment
            timeline, and audited record views.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={() => loadData(tenantId)} />
          <button
            type="button"
            onClick={() => open("create")}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
          >
            <Plus size={16} />
            Create Patient
          </button>
        </div>
      </div>
      <StatusToast message={message} onClose={() => setMessage("")} />
      <div className="rounded-3xl border border-slate-200 bg-slate-50/50 p-4">
        <div
          className={`grid gap-3 ${isSuperAdmin ? "lg:grid-cols-3 xl:grid-cols-[1.2fr_1.1fr_.9fr_.9fr_.85fr_.85fr_auto]" : "lg:grid-cols-3 xl:grid-cols-[1.35fr_1.05fr_.9fr_.9fr_.85fr_.85fr_auto]"}`}
        >
          {isSuperAdmin && (
            <SelectField
              label="Tenant"
              value={tenantId}
              onChange={setTenantId}
              options={tenants.map((t: any) => ({ value: t.id, label: t.name }))}
            />
          )}
          <TextField
            label="Patient / Mobile"
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder="Name, mobile, area"
          />
          <SelectField
            label="Branch"
            value={branchFilter}
            onChange={(v) => { setBranchFilter(v); setPage(1); }}
            options={[
              { value: "all", label: "All branches" },
              ...branches.map((b: any) => ({ value: b.id, label: b.name })),
            ]}
          />
          <SelectField
            label="Gender"
            value={gender}
            onChange={(v) => { setGender(v); setPage(1); }}
            options={[
              { value: "all", label: "All gender" },
              ...genders.map(([value, label]) => ({ value, label })),
            ]}
          />
          <SelectField
            label="Status"
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            options={[
              { value: "all", label: "All status" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
              { value: "deceased", label: "Deceased" },
            ]}
          />
          <DateField label="From" value={fromDate} onChange={setFromDate} />
          <DateField label="To" value={toDate} onChange={setToDate} />
          <div className="flex items-end gap-2">
            <Button
              className="min-h-[46px] px-5  rounded-lg text-xs lg:text-sm py-2 px-2 lg:py-3 lg:px-4"
              onClick={() => {
                setPage(1);
                loadData(tenantId);
              }}
              disabled={busy}
            >
              {busy ? "Searching..." : "Search"}
            </Button>
            <button
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
              className="min-h-[46px] text-xs lg:text-sm px-2 py-1 lg:px-4 lg:py-3 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white">
        <div className="min-w-[1080px]">
          <div className="hidden grid-cols-[1.25fr_.85fr_1fr_.75fr_.7fr_.65fr_1.35fr] items-center gap-4 bg-slate-50 px-5 py-3 text-xs font-bold uppercase text-slate-500 xl:grid">
            <span>Patient</span>
            <span>Mobile</span>
            <span>Branch</span>
            <span>Gender / Age</span>
            <span>Alerts</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>
          <div className="divide-y divide-slate-200">
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
                onView={() => open("detail", row.id)}
                onEdit={() => {
                  setSelectedDetail(row);
                  open("edit", row.id);
                }}
                onDelete={() => setConfirm({ row })}
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
          row={confirm.row}
          onClose={() => setConfirm(null)}
          onConfirm={() => deactivatePatient(confirm.row)}
        />
      )}
    </Card>
  );
}

function activeTenantOptions(tenants: any[]) {
  const seen = new Set<string>();
  return (tenants || []).filter((tenant: any) => {
    if (tenant.status === "suspended") return false;
    const key = String(tenant.name || tenant.id || "").trim().toLowerCase();
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  });
}

function toRow(patient: any) {
  return { ...patient, active_alert_count: 0, critical_alert_count: 0 };
}

function patientSearchText(patient: any, branch?: any) {
  return [
    patient.id,
    patient.patient_number,
    patient.full_name,
    patient.name,
    patient.mobile,
    patient.alternate_mobile,
    patient.guardian_name,
    patient.guardian,
    patient.guardian_mobile,
    patient.guardianMobile,
    patient.email,
    patient.area,
    patient.address,
    patient.status,
    branch?.name,
    branch?.code,
    branch?.area,
    branch?.city,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function PatientForm({
  title,
  patient,
  branches,
  defaultBranchId,
  busy,
  onSubmit,
  back,
}: any) {
  function handleSubmit(event: any) {
    event.preventDefault();
    onSubmit(patientFormPayload(new FormData(event.currentTarget)));
  }

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-bold">{title}</h3>
          <p className="text-sm text-slate-500">
            {patient?.patient_number || "Create tenant-scoped patient record."}
          </p>
        </div>
        <button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">
          Back
        </button>
      </div>
      <form
        onSubmit={handleSubmit}
        className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <PatientFormFields
          patient={patient}
          branches={branches}
          defaultBranchId={defaultBranchId}
          includeStatus={Boolean(patient)}
        />
        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3">
          <Button disabled={busy}>
            {busy ? "Saving..." : patient ? "Save Patient" : "Create Patient"}
          </Button>
          <button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}

function MembershipEnrollForm({ membershipPlans, patient, branches = [], loading, onSubmit }: any) {
  const activePlans = membershipPlans.filter((plan: any) => plan.is_active);
  const [planId, setPlanId] = useState("");
  const [branchId, setBranchId] = useState(patient?.branch_id || "all");
  const [startsOn, setStartsOn] = useState(new Date().toISOString().slice(0, 10));
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");

  function handleSubmit(e: any) {
    e.preventDefault();
    onSubmit({
      planId,
      branchId: branchId === "all" ? "" : branchId,
      startsOn,
      paidAmount,
      paymentMethod,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 grid gap-3 md:grid-cols-5">
      <SelectField
        label="Plan"
        value={planId}
        onChange={setPlanId}
        options={[
          { value: "", label: "Select plan" },
          ...activePlans.map((plan: any) => ({
            value: plan.id,
            label: `${plan.name} · ₹${Number(plan.price_amount || 0).toLocaleString("en-IN")}`,
          })),
        ]}
      />
      <SelectField
        label="Branch"
        value={branchId}
        onChange={setBranchId}
        options={[
          { value: "all", label: "All branches" },
          ...branches.map((branch: any) => ({
            value: branch.id,
            label: branch.name || branch.code || branch.id,
          })),
        ]}
      />
      <DateField label="Starts On" value={startsOn} onChange={setStartsOn} />
      <NumberField label="Amount Paid Now" value={paidAmount} onChange={setPaidAmount} min={0} placeholder="0 if unpaid" />
      <SelectField
        label="Payment Method"
        value={paymentMethod}
        onChange={setPaymentMethod}
        options={[...paymentMethodOptions]}
      />
      <div className="md:col-span-5">
        <Button disabled={loading || activePlans.length === 0}>
          {loading ? "Saving..." : "Enroll Membership"}
        </Button>
      </div>
    </form>
  );
}

function PatientRow({ row, branches, onView, onEdit, onDelete }: any) {
  const branch = branches.find((item: any) => item.id === row.branch_id);
  const stop = (handler: () => void) => (event: any) => {
    event.stopPropagation();
    handler();
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onView}
      onKeyDown={(event: any) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onView();
        }
      }}
      className="block w-full cursor-pointer text-left transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
    >
      <div className="grid gap-4 px-5 py-4 text-sm xl:grid-cols-[1.25fr_.85fr_1fr_.75fr_.7fr_.65fr_1.35fr] xl:items-center">
        <div className="min-w-0">
          <b className="block truncate text-slate-950">{row.full_name}</b>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            {row.patient_number}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase text-slate-400 xl:hidden">
            Mobile
          </p>
          <span className="block truncate text-slate-700">
            {row.mobile || row.guardian_mobile || "-"}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase text-slate-400 xl:hidden">
            Branch
          </p>
          <span className="block truncate text-slate-700">
            {branch?.name || "No branch"}
          </span>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase text-slate-400 xl:hidden">
            Gender / Age
          </p>
          <span className="text-slate-700">
            {row.gender || "-"} / {row.age_years ?? "-"}
          </span>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase text-slate-400 xl:hidden">
            Alerts
          </p>
          {row.critical_alert_count > 0 ? (
            <Badge tone="red">{row.critical_alert_count} critical</Badge>
          ) : row.active_alert_count > 0 ? (
            <Badge tone="amber">{row.active_alert_count} alerts</Badge>
          ) : (
            <span className="text-slate-400">-</span>
          )}
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase text-slate-400 xl:hidden">
            Status
          </p>
          <Badge
            tone={
              row.status === "active"
                ? "green"
                : row.status === "deceased"
                  ? "purple"
                  : "red"
            }
          >
            {row.status}
          </Badge>
        </div>
        <ActionGroup className="justify-start xl:justify-end">
          <ActionButton onClick={stop(onView)}>View</ActionButton>
          <ActionButton onClick={stop(onEdit)}>Edit</ActionButton>
          <ActionButton tone="danger" onClick={stop(onDelete)}>
            Delete
          </ActionButton>
        </ActionGroup>
      </div>
    </div>
  );
}

function fmtDate(val: string | null | undefined) {
  return displayDate(val);
}

function money(value:any){return `₹${Number(value||0).toLocaleString("en-IN")}`}

function splitListText(value: any) {
  const seen = new Set<string>();
  return String(value || "")
    .split(/\n|,/)
    .map((item: string) => item.trim())
    .filter((item: string) => {
      if (!item) return false;
      const key = item.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

const hiddenScrollbar = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function ClinicalItemList({ value, items: providedItems, empty = "-" }: any) {
  const items = providedItems || splitListText(value);
  if (items.length === 0) return <p className="mt-1 text-slate-700">{empty}</p>;
  return (
    <div className="mt-2 space-y-1.5">
      {items.map((item: string, index: number) => (
        <div
          key={`${item}-${index}`}
          className="rounded-xl bg-white/70 px-3 py-2 text-sm leading-relaxed text-slate-700"
        >
          {item}
        </div>
      ))}
    </div>
  );
}

function uniqueClinicalRecords(rows: any[], getKey: (row: any) => string) {
  const seen = new Set<string>();
  return rows.filter((row: any) => {
    const key = getKey(row).toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeClinicalText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function clinicalRecordsWithUniqueItems(
  rows: any[],
  getValue: (row: any) => any,
) {
  const seen = new Set<string>();
  return rows
    .map((row: any) => {
      const items = splitListText(getValue(row)).filter((item: string) => {
        const key = normalizeClinicalText(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { row, items };
    })
    .filter(({ items }: any) => items.length > 0);
}

function StatusBadge({ status }: any) {
  const tone =
    status === "completed" ||
    status === "paid" ||
    status === "dispensed" ||
    status === "active"
      ? "green"
      : status === "cancelled"
        ? "red"
        : status === "pending" || status === "issued"
          ? "amber"
          : "slate";
  return <Badge tone={tone}>{status}</Badge>;
}

function PatientDetail({
  patient,
  summary,
  patientIpAdmissions,
  consultations,
  labOrders,
  pharmacyIssues,
  physioCases,
  membershipPlans,
  membershipEnrollments,
  patientInvoices,
  branches,
  loading,
  message,
  onMessageClose,
  onEnrollMembership,
  onBack,
  onEdit,
  onUploadPhoto,
}: any) {
  const alerts = [
    ...(summary?.critical_alerts || []),
    ...(summary?.allergies || []),
  ];
  const risks = [...(summary?.risk_alerts || []), ...(summary?.notes || [])];
  const isAdmitted = patientIpAdmissions.some(
    (a: any) => a.status === "admitted" || a.status === "active",
  );
  const uniqueLabOrders = uniqueClinicalRecords(
    labOrders,
    (order: any) =>
      `${fmtDate(order.created_at)}|${order.status || ""}|${order.tests || ""}|${order.notes || ""}`,
  );
  const uniquePharmacyIssues = uniqueClinicalRecords(
    pharmacyIssues,
    (issue: any) =>
      `${fmtDate(issue.created_at)}|${issue.status || ""}|${issue.medicine_text || ""}|${issue.notes || ""}|${issue.amount || ""}`,
  );
  const labRows = clinicalRecordsWithUniqueItems(
    uniqueLabOrders,
    (order: any) => order.tests,
  );
  const medicineRows = clinicalRecordsWithUniqueItems(
    uniquePharmacyIssues,
    (issue: any) => issue.medicine_text,
  );
  const membershipInvoices = patientInvoices.filter((invoice:any)=>invoice.patient_subscription_enrollment_id||invoice.patient_subscription_plan_id);
  const purchaseInvoiceFor = (enrollment:any) => membershipInvoices.find((invoice:any)=>invoice.id===enrollment.purchase_invoice_id||invoice.patient_subscription_enrollment_id===enrollment.id);
  const isEnrollmentPaid = (enrollment:any) => {
    const invoice = purchaseInvoiceFor(enrollment);
    if (invoice) return Number(invoice.balance_amount||0)<=0;
    return Number(enrollment.paid_amount||0)>=Number(enrollment.plan?.price_amount||0);
  };
  const activeMembership = membershipEnrollments.find((row:any)=>row.status==="active"&&isEnrollmentPaid(row));
  const pendingMembership = membershipEnrollments.find((row:any)=>row.status==="active"&&!isEnrollmentPaid(row));
  const membershipUsageInvoices = patientInvoices.filter((invoice:any)=>Number(invoice.membership_discount_amount||0)>0);
  const membershipSavings = membershipUsageInvoices.reduce((sum:number,invoice:any)=>sum+Number(invoice.membership_discount_amount||0),0);
  const currentMembership = activeMembership || pendingMembership;
  const freeConsultTotal = Number(currentMembership?.plan?.free_consultations || 0);
  const freeConsultClaimed = Number(currentMembership?.used_consultations || 0);
  const freeConsultRemaining = Math.max(freeConsultTotal - freeConsultClaimed, 0);
  const purchaseInvoices = membershipEnrollments
    .map((row: any) => purchaseInvoiceFor(row))
    .filter(Boolean);
  const paidPurchaseInvoices = purchaseInvoices.filter((invoice: any) => Number(invoice.balance_amount || 0) <= 0);
  const duePurchaseInvoices = purchaseInvoices.filter((invoice: any) => Number(invoice.balance_amount || 0) > 0);
  const purchasePaidTotal = purchaseInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.paid_amount || 0), 0);
  const purchaseDueTotal = purchaseInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.balance_amount || 0), 0);

  return (
    <div className="space-y-5">
      {/* Demographics */}
      <Card>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div className="flex items-start gap-4">
            {patient.photo_url ? (
              <img
                src={`${UPLOADS_BASE}${patient.photo_url}`}
                alt="Patient"
                className="h-16 w-16 rounded-2xl object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-2xl font-bold text-slate-400">
                {patient.full_name?.[0]?.toUpperCase() || "P"}
              </div>
            )}
            <div>
              <h3 className="text-lg font-bold">Patient Details</h3>
              <p className="text-sm text-slate-500">
                Audited EMR view with demographics, alerts, history, treatment,
                and timeline.
              </p>
              <label className="mt-1 inline-block cursor-pointer rounded-xl border px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50">
                {patient.photo_url ? "Change Photo" : "Upload Photo"}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="sr-only"
                  onChange={(e: any) => {
                    const f = e.target.files?.[0];
                    if (f) onUploadPhoto(f);
                  }}
                />
              </label>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {loading && <Badge tone="amber">Loading…</Badge>}
            <button
              type="button"
              onClick={onBack}
              className="rounded-2xl border px-4 py-3 text-sm font-bold"
            >
              Back to Patients
            </button>
            <Button onClick={onEdit}>Edit Patient</Button>
          </div>
        </div>
        <StatusToast message={message} onClose={onMessageClose} />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Info k="Name" v={patient.full_name} />
          <Info k="Patient Number" v={patient.patient_number} />
          <Info k="Mobile" v={patient.mobile || "-"} />
          <Info
            k="Age / Gender"
            v={`${patient.age_years ?? "-"} / ${patient.gender || "-"}`}
          />
          <Info k="Blood Group" v={patient.blood_group || "-"} />
          <Info k="Area" v={patient.area || "-"} />
          <Info k="Address" v={patient.address || "-"} />
          <Info k="Guardian" v={patient.guardian_name || "-"} />
          <Info k="IP Status" v={isAdmitted ? "Admitted" : "No"} />
        </div>
      </Card>

      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <h4 className="font-bold">Patient Membership</h4>
            <p className="text-xs text-slate-500">Subscription status, usage, purchase invoice, and benefit savings for this patient.</p>
          </div>
          <Badge tone={activeMembership?"green":pendingMembership?"amber":"slate"}>{activeMembership?"Subscribed":pendingMembership?"Payment due":"Not subscribed"}</Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Info k="Current Plan" v={currentMembership?.plan?.name||"-"}/>
          <Info k="Valid Until" v={fmtDate(currentMembership?.ends_on)}/>
          <Info k="Consult Claimed" v={`${freeConsultClaimed}/${freeConsultTotal}`}/>
          <Info k="Consult Remaining" v={freeConsultRemaining}/>
          <Info k="Benefit Invoices" v={membershipUsageInvoices.length}/>
          <Info k="Membership Savings" v={money(membershipSavings)}/>
          <Info k="Purchase Invoices" v={`${paidPurchaseInvoices.length} paid / ${duePurchaseInvoices.length} due`}/>
          <Info k="Purchase Due" v={money(purchaseDueTotal)}/>
        </div>
        <MembershipEnrollForm
          membershipPlans={membershipPlans}
          patient={patient}
          branches={branches}
          loading={loading}
          onSubmit={onEnrollMembership}
        />
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border p-4">
            <h5 className="font-bold">Membership History</h5>
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
              {membershipEnrollments.length===0&&<SectionEmpty text="No membership history."/>}
              {membershipEnrollments.map((row:any)=>{
                const invoice=purchaseInvoiceFor(row);
                const due=Number(invoice?.balance_amount??Math.max(Number(row.plan?.price_amount||0)-Number(row.paid_amount||0),0));
                const total=Number(row.plan?.free_consultations||0);
                const used=Number(row.used_consultations||0);
                const paid=Number(invoice?.paid_amount??row.paid_amount??0);
                return (
                  <div key={row.id} className="border-b border-slate-100 p-3 text-sm last:border-b-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <b>{row.plan?.name||row.plan_id}</b>
                        <p className="text-xs text-slate-500">
                          {fmtDate(row.starts_on)} – {fmtDate(row.ends_on)}
                        </p>
                      </div>
                      <Badge tone={due>0?"amber":row.status==="active"?"green":"slate"}>{due>0?"payment due":row.status}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                      <span className="font-semibold text-slate-900">{money(paid)} paid</span>
                      {due>0&&<><span className="text-slate-300">·</span><span className="font-semibold text-amber-700">{money(due)} due</span></>}
                      <span className="text-slate-300">·</span>
                      <span>{invoice?.invoice_number||"no invoice"}</span>
                      <span className="text-slate-300">·</span>
                      <span>{used}/{total} consults used</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-2xl border p-4">
            <h5 className="font-bold">Benefit Usage Invoices</h5>
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
              {membershipUsageInvoices.length===0&&<SectionEmpty text="No membership benefits used yet."/>}
              {membershipUsageInvoices.map((invoice:any)=>
                <div key={invoice.id} className="grid gap-2 border-b border-slate-100 p-3 text-sm last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <b>{invoice.invoice_number}</b>
                    <p className="text-xs text-slate-500">
                      {fmtDate(invoice.created_at)} · invoice total {money(invoice.total_amount)}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-bold text-green-700">{money(invoice.membership_discount_amount)}</p>
                    <p className="text-xs text-slate-500">claimed benefit</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {membershipInvoices.length>0&&
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Info k="Total Purchase Paid" v={money(purchasePaidTotal)} />
            <Info k="Total Purchase Due" v={money(purchaseDueTotal)} />
            <Info k="Benefit Claims" v={`${membershipUsageInvoices.length} invoices · ${money(membershipSavings)}`} />
          </div>
        }
      </Card>

      {/* Alerts */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h4 className="font-bold text-red-700">
            Allergies &amp; Critical Alerts
          </h4>
          <div className="mt-3 space-y-2">
            {alerts.length === 0 && (
              <SectionEmpty text="No active allergy or critical alert." />
            )}
            {alerts.map((alert: any) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        </Card>
        <Card>
          <h4 className="font-bold">Risk Notes</h4>
          <div className="mt-3 space-y-2">
            {risks.length === 0 && (
              <SectionEmpty text="No active risk notes." />
            )}
            {risks.map((alert: any) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        </Card>
      </div>

      {/* Consultations — complaints, symptoms, diagnosis, prescription */}
      <Card>
        <h4 className="font-bold">Consultations</h4>
        <p className="text-xs text-slate-500">
          Chief complaints, diagnosis, prescriptions and referrals from each
          visit.
        </p>
        {consultations.length === 0 && (
          <SectionEmpty text="No consultation records found." />
        )}
        <div className="mt-3 space-y-3">
          {consultations.map((c: any) => (
            <div
              key={c.id}
              className="rounded-2xl border border-slate-200 p-4 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">{fmtDate(c.created_at)}</span>
                <div className="flex flex-wrap gap-2">
                  {c.treatment_type && (
                    <Badge tone="slate">{c.treatment_type.toUpperCase()}</Badge>
                  )}
                  <StatusBadge status={c.status} />
                </div>
              </div>
              {c.chief_complaint && (
                <Row label="Chief Complaint" value={c.chief_complaint} />
              )}
              {c.patient_remarks && (
                <Row label="Symptoms / Remarks" value={c.patient_remarks} />
              )}
              {c.diagnosis && <Row label="Diagnosis" value={c.diagnosis} />}
              {c.clinical_notes && (
                <Row label="Clinical Notes" value={c.clinical_notes} />
              )}
              {c.scan_referral_text && (
                <Row label="Scan Referral" value={c.scan_referral_text} />
              )}
              {c.follow_up_advice && (
                <Row label="Follow-up" value={c.follow_up_advice} />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Lab & Pharmacy side by side */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h4 className="font-bold">Lab Tests</h4>
          <p className="text-xs text-slate-500">
            Ordered diagnostic tests and results.
          </p>
          {labOrders.length === 0 && (
            <SectionEmpty text="No lab orders found." />
          )}
          <div
            className={`mt-3 max-h-[260px] space-y-3 overflow-y-auto pr-1 ${hiddenScrollbar}`}
          >
            {labRows.map(({ row: order, items }: any) => (
              <div
                key={order.id}
                className="rounded-2xl bg-slate-50 p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold">{fmtDate(order.created_at)}</span>
                  <span className="shrink-0">
                    <StatusBadge status={order.status} />
                  </span>
                </div>
                <ClinicalItemList items={items} />
                {order.notes && (
                  <p className="mt-1 text-xs text-slate-500">{order.notes}</p>
                )}
                {order.priority && order.priority !== "routine" && (
                  <Badge tone="amber">{order.priority}</Badge>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h4 className="font-bold">Medicines</h4>
          <p className="text-xs text-slate-500">
            Pharmacy issues and dispensed medicines.
          </p>
          {pharmacyIssues.length === 0 && (
            <SectionEmpty text="No pharmacy records found." />
          )}
          <div
            className={`mt-3 max-h-[260px] space-y-3 overflow-y-auto pr-1 ${hiddenScrollbar}`}
          >
            {medicineRows.map(({ row: issue, items }: any) => (
              <div
                key={issue.id}
                className="rounded-2xl bg-slate-50 p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold">{fmtDate(issue.created_at)}</span>
                  <span className="shrink-0">
                    <StatusBadge status={issue.status} />
                  </span>
                </div>
                <ClinicalItemList items={items} />
                {issue.notes && (
                  <p className="mt-1 text-xs text-slate-500">{issue.notes}</p>
                )}
                {issue.amount > 0 && (
                  <p className="mt-1 text-xs font-semibold text-slate-600">
                    ₹{issue.amount}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Physiotherapy */}
      <Card>
        <h4 className="font-bold">Physiotherapy Sessions</h4>
        <p className="text-xs text-slate-500">
          Physiotherapy cases and treatment plans.
        </p>
        {physioCases.length === 0 && (
          <SectionEmpty text="No physiotherapy records found." />
        )}
        <div className="mt-3 space-y-3">
          {physioCases.map((c: any) => (
            <div
              key={c.id}
              className="rounded-2xl border border-slate-200 p-4 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">
                  {c.case_number || fmtDate(c.assessment_date)}
                </span>
                <div className="flex flex-wrap gap-2">
                  {c.care_context && (
                    <Badge tone="slate">{c.care_context.toUpperCase()}</Badge>
                  )}
                  <StatusBadge status={c.status} />
                </div>
              </div>
              {c.body_region && (
                <Row label="Body Region" value={c.body_region} />
              )}
              {c.condition && <Row label="Condition" value={c.condition} />}
              {c.treatment_goal && (
                <Row label="Goal" value={c.treatment_goal} />
              )}
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                {c.pain_score != null && (
                  <span>
                    Pain score: <b>{c.pain_score}/10</b>
                  </span>
                )}
                {c.planned_sessions && (
                  <span>
                    Sessions planned: <b>{c.planned_sessions}</b>
                  </span>
                )}
                {c.frequency && (
                  <span>
                    Frequency: <b>{c.frequency}</b>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* IP Admissions */}
      <Card>
        <h4 className="font-bold">IP Admissions</h4>
        <p className="text-xs text-slate-500">
          Inpatient admission history with ward, room and discharge details.
        </p>
        {patientIpAdmissions.length === 0 && (
          <SectionEmpty text="No IP admission records found." />
        )}
        <div className="mt-3 space-y-3">
          {patientIpAdmissions.map((adm: any) => (
            <div
              key={adm.id}
              className="rounded-2xl border border-slate-200 p-4 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">
                  {adm.admission_number || fmtDate(adm.admission_date)}
                </span>
                <StatusBadge status={adm.status} />
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <Info k="Ward" v={adm.ward || "-"} />
                <Info
                  k="Room / Bed"
                  v={adm.room ? `${adm.room} / ${adm.bed}` : adm.bed || "-"}
                />
                <Info k="Admitted" v={fmtDate(adm.admission_date)} />
              </div>
              {adm.expected_discharge_date && (
                <div className="mt-2">
                  <Info
                    k="Expected Discharge"
                    v={fmtDate(adm.expected_discharge_date)}
                  />
                </div>
              )}
              {adm.reason && <Row label="Reason" value={adm.reason} />}
              {adm.provisional_diagnosis && (
                <Row
                  label="Provisional Diagnosis"
                  value={adm.provisional_diagnosis}
                />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Timeline */}
      <Card>
        <h4 className="font-bold">Timeline</h4>
        {(!summary?.timeline || summary.timeline.length === 0) && (
          <SectionEmpty text="No timeline events." />
        )}
        <div className="mt-3 space-y-2">
          {summary?.timeline?.map((event: any, index: number) => (
            <div
              key={`${event.type}-${index}`}
              className="rounded-2xl bg-slate-50 p-3 text-sm"
            >
              <b>{event.title}</b>
              <p className="text-slate-500">{fmtDate(event.recorded_at)}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }: any) {
  return (
    <div className="mt-2">
      <span className="text-xs font-semibold text-slate-500">{label}: </span>
      <span className="text-slate-700">{value}</span>
    </div>
  );
}
function AlertCard({ alert }: any) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-sm">
      <b>{alert.title}</b>
      <p className="text-slate-600">{alert.description || alert.alert_type}</p>
      <Badge tone={alert.severity === "critical" ? "red" : "amber"}>
        {alert.severity}
      </Badge>
    </div>
  );
}
function Info({ k, v }: any) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs text-slate-500">{k}</p>
      <p className="font-bold">{v}</p>
    </div>
  );
}
function Empty({ text }: any) {
  return (
    <div className="px-4 py-8 text-center text-sm text-slate-500">{text}</div>
  );
}
function SectionEmpty({ text }: any) {
  return <p className="mt-3 text-sm text-slate-500">{text}</p>;
}
function Pagination({ page, totalPages, total, onPage }: any) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-slate-500">
        {total} records · Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-xl border px-3 py-2 font-bold disabled:text-slate-300"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded-xl border px-3 py-2 font-bold disabled:text-slate-300"
        >
          Next
        </button>
      </div>
    </div>
  );
}
function ConfirmModal({ row, busy, onClose, onConfirm }: any) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-md">
        <h3 className="text-lg font-bold">Delete Patient</h3>
        <p className="mt-2 text-sm text-slate-600">
          This will deactivate the patient record. Treatment history remains
          available for audit and care continuity.
        </p>
        <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-bold">
          {row.full_name}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? "Working..." : "Confirm"}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border px-4 py-3 text-sm font-bold"
          >
            Cancel
          </button>
        </div>
      </Card>
    </div>
  );
}
