"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  ActionButton,
  ActionGroup,
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
} from "@/components/ui";
import { UPLOADS_BASE, apiFetch, apiUpload, type ApiSession } from "@/lib/api";

type PatientProps = {
  apiSession: ApiSession | null;
};

const pageSize = 10;
const genders = [
  ["unknown", "Unknown"],
  ["male", "Male"],
  ["female", "Female"],
  ["other", "Other"],
] as const;

export function Patient({ apiSession }: PatientProps) {
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
    const tenantRows = await apiFetch("/tenants", apiSession);
    setTenants(tenantRows);
    if (!tenantId)
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
    try {
      const [
        detail,
        summaryData,
        consultationRows,
        labRows,
        pharmacyRows,
        physioRows,
        ipRows,
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
      ]);
      setSelectedDetail(detail);
      setSummary(summaryData);
      setSelectedId(id);
      setConsultations(Array.isArray(consultationRows) ? consultationRows : []);
      setLabOrders(Array.isArray(labRows) ? labRows : []);
      setPharmacyIssues(Array.isArray(pharmacyRows) ? pharmacyRows : []);
      setPhysioCases(Array.isArray(physioRows) ? physioRows : []);
      setPatientIpAdmissions(Array.isArray(ipRows) ? ipRows : []);
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

  async function createPatient(e: any) {
    e.preventDefault();
    if (!scopedSession) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch("/patients", scopedSession, {
        method: "POST",
        body: JSON.stringify(formPayload(fd)),
      });
      setRows((previous: any[]) => [
        toRow(created),
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      form.reset();
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

  async function updatePatient(e: any) {
    e.preventDefault();
    if (!scopedSession || !selectedId) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(`/patients/${selectedId}`, scopedSession, {
        method: "PATCH",
        body: JSON.stringify({
          ...formPayload(fd),
          status: fd.get("status") || "active",
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
        loading={busy}
        message={message}
        onBack={() => open("list")}
        onEdit={() => open("edit", selected.id)}
        onUploadPhoto={uploadPhoto}
      />
    );

  const filtered = rows
    .filter((row: any) => {
      const created = row.created_at ? new Date(row.created_at).getTime() : 0;
      const from = fromDate ? new Date(fromDate).getTime() : 0;
      const to = toDate
        ? new Date(`${toDate}T23:59:59`).getTime()
        : Number.MAX_SAFE_INTEGER;
      return (
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
        <button
          type="button"
          onClick={() => open("create")}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
        >
          <Plus size={16} />
          Create Patient
        </button>
      </div>
      {message && (
        <div className="rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">
          {message}
        </div>
      )}
      <div className="rounded-3xl border border-slate-200 bg-slate-50/50 p-4">
        <div
          className={`grid gap-3 ${isSuperAdmin ? "lg:grid-cols-3 xl:grid-cols-[1.2fr_1.1fr_.9fr_.9fr_.85fr_.85fr_auto]" : "lg:grid-cols-3 xl:grid-cols-[1.35fr_1.05fr_.9fr_.9fr_.85fr_.85fr_auto]"}`}
        >
          {isSuperAdmin && (
            <Field label="Tenant">
              <Select
                value={tenantId}
                onChange={(e: any) => setTenantId(e.target.value)}
              >
                {tenants.map((tenant: any) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Patient / Mobile">
            <Input
              value={query}
              onChange={(e: any) => setQuery(e.target.value)}
              placeholder="Name, mobile, area"
            />
          </Field>
          <Field label="Branch">
            <Select
              value={branchFilter}
              onChange={(e: any) => {
                setBranchFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All branches</option>
              {branches.map((branch: any) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Gender">
            <Select
              value={gender}
              onChange={(e: any) => {
                setGender(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All gender</option>
              {genders.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={status}
              onChange={(e: any) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="deceased">Deceased</option>
            </Select>
          </Field>
          <Field label="From">
            <Input
              type="date"
              value={fromDate}
              onChange={(e: any) => setFromDate(e.target.value)}
            />
          </Field>
          <Field label="To">
            <Input
              type="date"
              value={toDate}
              onChange={(e: any) => setToDate(e.target.value)}
            />
          </Field>
          <div className="flex items-end gap-2">
            <Button
              className="min-h-[46px] px-5"
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
              className="min-h-[46px] rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
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

function formPayload(fd: FormData) {
  return {
    branch_id: fd.get("branchId") || null,
    full_name: fd.get("fullName"),
    mobile: fd.get("mobile") || null,
    alternate_mobile: fd.get("alternateMobile") || null,
    email: fd.get("email") || null,
    gender: fd.get("gender") || "unknown",
    date_of_birth: fd.get("dateOfBirth") || null,
    age_years: fd.get("ageYears") ? Number(fd.get("ageYears")) : null,
    guardian_name: fd.get("guardianName") || null,
    guardian_mobile: fd.get("guardianMobile") || null,
    area: fd.get("area") || null,
    address: fd.get("address") || null,
    blood_group: fd.get("bloodGroup") || null,
  };
}

function toRow(patient: any) {
  return { ...patient, active_alert_count: 0, critical_alert_count: 0 };
}

function PatientForm({ title, patient, branches, busy, onSubmit, back }: any) {
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-bold">{title}</h3>
          <p className="text-sm text-slate-500">
            {patient?.patient_number || "Create tenant-scoped patient record."}
          </p>
        </div>
        <button
          type="button"
          onClick={back}
          className="rounded-2xl border px-4 py-3 text-sm font-bold"
        >
          Back
        </button>
      </div>
      <form
        onSubmit={onSubmit}
        className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <Field label="Full Name">
          <Input
            name="fullName"
            defaultValue={patient?.full_name || ""}
            required
          />
        </Field>
        <Field label="Mobile">
          <Input name="mobile" defaultValue={patient?.mobile || ""} />
        </Field>
        <Field label="Branch">
          <Select name="branchId" defaultValue={patient?.branch_id || ""}>
            <option value="">No branch</option>
            {branches.map((branch: any) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Gender">
          <Select name="gender" defaultValue={patient?.gender || "unknown"}>
            {genders.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date of Birth">
          <Input
            name="dateOfBirth"
            type="date"
            defaultValue={patient?.date_of_birth || ""}
          />
        </Field>
        <Field label="Age Years">
          <Input
            name="ageYears"
            type="number"
            min="0"
            max="130"
            defaultValue={patient?.age_years || ""}
          />
        </Field>
        <Field label="Guardian Name">
          <Input
            name="guardianName"
            defaultValue={patient?.guardian_name || ""}
          />
        </Field>
        <Field label="Guardian Mobile">
          <Input
            name="guardianMobile"
            defaultValue={patient?.guardian_mobile || ""}
          />
        </Field>
        <Field label="Alternate Mobile">
          <Input
            name="alternateMobile"
            defaultValue={patient?.alternate_mobile || ""}
          />
        </Field>
        <Field label="Email">
          <Input
            name="email"
            type="email"
            defaultValue={patient?.email || ""}
          />
        </Field>
        <Field label="Area">
          <Input name="area" defaultValue={patient?.area || ""} />
        </Field>
        <Field label="Blood Group">
          <Input name="bloodGroup" defaultValue={patient?.blood_group || ""} />
        </Field>
        {patient && (
          <Field label="Status">
            <Select name="status" defaultValue={patient.status || "active"}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="deceased">Deceased</option>
            </Select>
          </Field>
        )}
        <div className="md:col-span-2 xl:col-span-3">
          <Field label="Address">
            <Input name="address" defaultValue={patient?.address || ""} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3">
          <Button disabled={busy}>
            {busy ? "Saving..." : patient ? "Save Patient" : "Create Patient"}
          </Button>
          <button
            type="button"
            onClick={back}
            className="rounded-2xl border px-4 py-3 text-sm font-bold"
          >
            Cancel
          </button>
        </div>
      </form>
    </Card>
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
  if (!val) return "-";
  try {
    return new Date(val).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return val;
  }
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
  loading,
  message,
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
        {message && (
          <div className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">
            {message}
          </div>
        )}
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
              {c.prescription_text && (
                <Row label="Prescription" value={c.prescription_text} />
              )}
              {c.lab_referral_text && (
                <Row label="Lab Referral" value={c.lab_referral_text} />
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
          <div className="mt-3 space-y-3">
            {labOrders.map((order: any) => (
              <div
                key={order.id}
                className="rounded-2xl bg-slate-50 p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-bold">{fmtDate(order.created_at)}</span>
                  <StatusBadge status={order.status} />
                </div>
                <p className="mt-1 text-slate-700">{order.tests || "-"}</p>
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
          <div className="mt-3 space-y-3">
            {pharmacyIssues.map((issue: any) => (
              <div
                key={issue.id}
                className="rounded-2xl bg-slate-50 p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-bold">{fmtDate(issue.created_at)}</span>
                  <StatusBadge status={issue.status} />
                </div>
                <p className="mt-1 text-slate-700">
                  {issue.medicine_text || "-"}
                </p>
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
