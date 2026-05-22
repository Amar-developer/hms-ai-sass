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
import { apiFetch } from "@/lib/api";
import { uniqueDepartmentRows } from "@/lib/options";

const doctorTypes = [
  ["doctor", "Doctor"],
  ["physiotherapist", "Physiotherapist"],
  ["nurse", "Nurse"],
  ["lab_specialist", "Lab Specialist"],
  ["technician", "Technician"],
] as const;

const pageSize = 10;

export function Doctors({ apiSession, clinic }: any) {
  const isSuperAdmin = Boolean(apiSession?.user?.is_super_admin);
  const [view, setView] = useState("list");
  const [tenants, setTenants] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState(apiSession?.tenantId || "");
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [feeRules, setFeeRules] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<any>(null);
  const selected = rows.find((row: any) => row.id === selectedId);
  const scopedSession =
    apiSession && tenantId ? { ...apiSession, tenantId } : apiSession;

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
      const [
        branchRows,
        departmentRows,
        userRows,
        practitionerRows,
        feeRuleRows,
      ] = await Promise.all([
        apiFetch(`/tenants/${nextTenantId}/branches`, session),
        apiFetch(`/tenants/${nextTenantId}/departments`, session),
        apiFetch("/identity/users", session).catch(() => []),
        apiFetch("/practitioners", session),
        apiFetch("/billing/doctor-fee-rules", session).catch(() => []),
      ]);
      setBranches(branchRows);
      setDepartments(uniqueDepartmentRows(departmentRows));
      setUsers(userRows);
      setRows(practitionerRows);
      setFeeRules(feeRuleRows);
    } catch (err: any) {
      setMessage(err.message || "Could not load doctors.");
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

  function open(nextView: string, id = "") {
    setSelectedId(id);
    setView(nextView);
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  }

  async function saveDoctorFeeRules(practitionerId: string, fd: FormData) {
    if (!scopedSession) return;
    const feeAmount = Number(fd.get("consultationFee") || 0);
    const doctorSharePercentage = Number(fd.get("doctorSharePercentage") || 0);
    const practitionerType = String(fd.get("practitionerType") || "doctor");
    if (feeAmount <= 0) return;
    const branchIds = fd.getAll("branchIds").map(String);
    const targets = branchIds.length ? branchIds : [null];
    await Promise.all(
      targets.map((branch: any) =>
        apiFetch("/billing/doctor-fee-rules", scopedSession, {
          method: "POST",
          body: JSON.stringify({
            branch_id: branch,
            department_id: null,
            practitioner_id: practitionerId,
            appointment_type: "op",
            treatment_type:
              practitionerType === "physiotherapist"
                ? "physiotherapy_session"
                : null,
            fee_amount: feeAmount,
            share_type: "percentage",
            doctor_share_percentage: Math.min(
              100,
              Math.max(0, doctorSharePercentage),
            ),
            doctor_fixed_amount: null,
            share_tax_with_doctor: fd.get("shareTaxWithDoctor") === "true",
          }),
        }),
      ),
    );
  }

  async function createDoctor(e: any) {
    e.preventDefault();
    if (!scopedSession) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch("/practitioners", scopedSession, {
        method: "POST",
        body: JSON.stringify({
          user_id: fd.get("userId") || null,
          full_name: fd.get("fullName"),
          practitioner_type: fd.get("practitionerType") || "doctor",
          primary_specialty: fd.get("primarySpecialty") || null,
          registration_number: fd.get("registrationNumber") || null,
          mobile: fd.get("mobile") || null,
          email: fd.get("email") || null,
          branch_ids: fd.getAll("branchIds").map(String),
          department_ids: fd.getAll("departmentIds").map(String),
          actor_user_id: apiSession.user?.id || null,
        }),
      });
      await saveDoctorFeeRules(created.id, fd);
      setRows((previous: any[]) => [
        created,
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      form.reset();
      open("list");
      await loadData(tenantId);
      setMessage(`Doctor created: ${created.full_name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not create doctor.");
    } finally {
      setBusy(false);
    }
  }

  async function updateDoctor(e: any) {
    e.preventDefault();
    if (!scopedSession || !selected) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/practitioners/${selected.id}`,
        scopedSession,
        {
          method: "PATCH",
          body: JSON.stringify({
            full_name: fd.get("fullName"),
            practitioner_type: fd.get("practitionerType") || "doctor",
            primary_specialty: fd.get("primarySpecialty") || null,
            registration_number: fd.get("registrationNumber") || null,
            mobile: fd.get("mobile") || null,
            email: fd.get("email") || null,
            status: fd.get("status") || "active",
            branch_ids: fd.getAll("branchIds").map(String),
            department_ids: fd.getAll("departmentIds").map(String),
            actor_user_id: apiSession.user?.id || null,
          }),
        },
      );
      await saveDoctorFeeRules(updated.id, fd);
      setRows((previous: any[]) => [
        updated,
        ...previous.filter((row: any) => row.id !== updated.id),
      ]);
      open("list");
      await loadData(tenantId);
      setMessage("Doctor updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update doctor.");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(row: any) {
    if (!scopedSession) return;
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/practitioners/${row.id}`,
        scopedSession,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: row.status === "active" ? "inactive" : "active",
            branch_ids: row.branch_ids || [],
            department_ids: row.department_ids || [],
            actor_user_id: apiSession.user?.id || null,
          }),
        },
      );
      setRows((previous: any[]) => [
        updated,
        ...previous.filter((item: any) => item.id !== updated.id),
      ]);
      setMessage(
        `Doctor ${updated.status === "active" ? "activated" : "deactivated"}.`,
      );
    } catch (err: any) {
      setMessage(err.message || "Could not update status.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function deleteDoctor(row: any) {
    if (!scopedSession) return;
    setBusy(true);
    setMessage("");
    try {
      await apiFetch(`/practitioners/${row.id}`, scopedSession, {
        method: "DELETE",
      });
      setRows((previous: any[]) =>
        previous.map((item: any) =>
          item.id === row.id ? { ...item, status: "inactive" } : item,
        ),
      );
      setMessage("Doctor deleted/deactivated.");
    } catch (err: any) {
      setMessage(err.message || "Could not delete doctor.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  if (!apiSession)
    return (
      <Card>
        <h3 className="text-lg font-bold">Doctor Management</h3>
        <p className="mt-2 text-sm text-slate-500">
          Backend login is required for doctor CRUD.
        </p>
      </Card>
    );

  if (view === "create")
    return (
      <DoctorForm
        title="Create Doctor"
        branches={branches}
        departments={departments}
        users={users}
        feeRules={feeRules}
        busy={busy}
        onSubmit={createDoctor}
        back={() => open("list")}
      />
    );
  if (view === "edit")
    return (
      <DoctorForm
        title="Edit Doctor"
        doctor={selected}
        branches={branches}
        departments={departments}
        users={users}
        feeRules={feeRules}
        busy={busy}
        onSubmit={updateDoctor}
        back={() => open("list")}
      />
    );

  const filtered = rows
    .filter((row: any) => {
      const text = [
        row.full_name,
        row.primary_specialty,
        row.registration_number,
        row.mobile,
        row.email,
        row.id,
      ]
        .join(" ")
        .toLowerCase();
      return (
        (!query || text.includes(query.toLowerCase())) &&
        (status === "all" || row.status === status) &&
        (type === "all" || row.practitioner_type === type)
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
    <Card>
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h3 className="text-lg font-bold">Doctor Management</h3>
          <p className="text-sm text-slate-500">
            Create, update, deactivate, and map doctors to tenants, branches,
            and departments.
          </p>
        </div>
        <button
          type="button"
          onClick={() => open("create")}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
        >
          <Plus size={16} />
          Create Doctor
        </button>
      </div>
      {message && (
        <div className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">
          {message}
        </div>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-6">
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
        <Field label="Search">
          <Input
            value={query}
            onChange={(e: any) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Name, specialty, mobile, email"
          />
        </Field>
        <Field label="Type">
          <Select
            value={type}
            onChange={(e: any) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All types</option>
            {doctorTypes.map(([value, label]) => (
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
          </Select>
        </Field>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <div className="min-w-[1280px]">
          <div className="hidden grid-cols-[1.05fr_.65fr_.9fr_.9fr_.65fr_.7fr_.7fr_1.45fr] items-center gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 xl:grid">
            <span>Doctor</span>
            <span>Type</span>
            <span>Branches</span>
            <span>Departments</span>
            <span>Contact</span>
            <span>Fee</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>
          <div className="divide-y divide-slate-200">
            {pageRows.length === 0 && (
              <Empty
                text={
                  busy ? "Loading doctors..." : "No doctors match your search."
                }
              />
            )}
            {pageRows.map((row: any) => (
              <DoctorRow
                key={row.id}
                row={row}
                branches={branches}
                departments={departments}
                feeRules={feeRules}
                onEdit={() => open("edit", row.id)}
                onStatus={() => setConfirm({ kind: "status", row })}
                onDelete={() => setConfirm({ kind: "delete", row })}
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
          confirm={confirm}
          onClose={() => setConfirm(null)}
          onConfirm={() =>
            confirm.kind === "delete"
              ? deleteDoctor(confirm.row)
              : deactivate(confirm.row)
          }
        />
      )}
    </Card>
  );
}

function activeDoctorFeeRule(feeRules: any[], doctor: any) {
  if (!doctor) return null;
  const branchIds = doctor.branch_ids || [];
  const treatmentType =
    doctor.practitioner_type === "physiotherapist"
      ? "physiotherapy_session"
      : null;
  return (
    [...(feeRules || [])]
      .filter(
        (rule: any) =>
          rule.is_active &&
          rule.practitioner_id === doctor.id &&
          rule.appointment_type === "op" &&
          (treatmentType
            ? rule.treatment_type === treatmentType
            : !rule.treatment_type) &&
          (!rule.branch_id || branchIds.includes(rule.branch_id)),
      )
      .sort(
        (a: any, b: any) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime(),
      )[0] || null
  );
}

function DoctorForm({
  title,
  doctor,
  branches,
  departments,
  users,
  feeRules,
  busy,
  onSubmit,
  back,
}: any) {
  const selectedBranches = doctor?.branch_ids || [];
  const selectedDepartments = doctor?.department_ids || [];
  const [practitionerType, setPractitionerType] = useState(
    doctor?.practitioner_type || "doctor",
  );
  const activeFeeRule = activeDoctorFeeRule(feeRules, doctor);
  const isPhysiotherapist = practitionerType === "physiotherapist";
  const doctorUsers = users.filter(
    (user: any) =>
      ["doctor", "nurse", "lab", "staff"].includes(user.user_type) ||
      user.roles?.includes("doctor"),
  );
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-bold">{title}</h3>
          <p className="text-sm text-slate-500">
            {doctor?.id || "Map doctor to branch and department availability."}
          </p>
        </div>
        <button
          type="button"
          onClick={back}
          className="rounded-2xl border px-4 py-3 text-sm font-bold"
        >
          Back to Doctors
        </button>
      </div>
      <form
        onSubmit={onSubmit}
        className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <Field label="Full Name">
          <Input
            name="fullName"
            defaultValue={doctor?.full_name || ""}
            required
            placeholder="Dr. Priya Raman"
          />
        </Field>
        <Field label="Doctor Type">
          <Select
            name="practitionerType"
            value={practitionerType}
            onChange={(event: any) => setPractitionerType(event.target.value)}
          >
            {doctorTypes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Linked Login User">
          <Select name="userId" defaultValue={doctor?.user_id || ""}>
            <option value="">No login linked</option>
            {doctorUsers.map((user: any) => (
              <option key={user.id} value={user.id}>
                {user.name} - {user.email}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Primary Specialty">
          <Input
            name="primarySpecialty"
            defaultValue={doctor?.primary_specialty || ""}
            placeholder="General Medicine"
          />
        </Field>
        <Field label="Registration Number">
          <Input
            name="registrationNumber"
            defaultValue={doctor?.registration_number || ""}
            placeholder="TNMC12345"
          />
        </Field>
        <Field label="Mobile">
          <Input name="mobile" defaultValue={doctor?.mobile || ""} />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" defaultValue={doctor?.email || ""} />
        </Field>
        {doctor && (
          <Field label="Status">
            <Select name="status" defaultValue={doctor.status}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        )}
        <Field label={isPhysiotherapist ? "Physiotherapy / Session Price" : "OP Consultation Fee"}>
          <Input
            name="consultationFee"
            type="number"
            min="0"
            defaultValue={activeFeeRule?.fee_amount ?? ""}
            placeholder="600"
          />
        </Field>
        <Field label="Doctor Share %">
          <Input
            name="doctorSharePercentage"
            type="number"
            min="0"
            max="100"
            defaultValue={activeFeeRule?.doctor_share_percentage ?? 70}
            placeholder="70"
          />
        </Field>
        <Field label="Tax Sharing">
          <Select
            name="shareTaxWithDoctor"
            defaultValue={String(activeFeeRule?.share_tax_with_doctor || false)}
          >
            <option value="false">Clinic keeps tax</option>
            <option value="true">Share tax by ratio</option>
          </Select>
        </Field>
        <div className="md:col-span-2 xl:col-span-3">
          <CheckboxGroup
            title="Branches"
            name="branchIds"
            rows={branches}
            selected={selectedBranches}
            empty="Create branches before mapping doctors."
          />
        </div>
        <div className="md:col-span-2 xl:col-span-3">
          <CheckboxGroup
            title="Departments"
            name="departmentIds"
            rows={departments}
            selected={selectedDepartments}
            empty="Create departments before mapping doctors."
          />
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3">
          <Button disabled={busy}>
            {busy ? "Saving..." : doctor ? "Save Doctor" : "Create Doctor"}
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

function DoctorRow({
  row,
  branches,
  departments,
  feeRules,
  onEdit,
  onStatus,
  onDelete,
}: any) {
  const branchNames = (row.branch_ids || []).map(
    (id: string) =>
      branches.find((branch: any) => branch.id === id)?.name || id,
  );
  const departmentNames = (row.department_ids || []).map(
    (id: string) =>
      departments.find((department: any) => department.id === id)?.name || id,
  );
  const typeLabel =
    doctorTypes.find(([value]) => value === row.practitioner_type)?.[1] ||
    row.practitioner_type;
  const feeRule = activeDoctorFeeRule(feeRules, row);
  const stop = (handler: any) => (event: any) => {
    event.stopPropagation();
    handler();
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(event: any) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit();
        }
      }}
      className="grid cursor-pointer gap-3 px-4 py-4 text-sm transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none xl:grid-cols-[1.05fr_.65fr_.9fr_.9fr_.65fr_.7fr_.7fr_1.45fr] xl:items-center"
    >
      <div>
        <b>{formatPractitionerName(row)}</b>
      </div>
      <span>{typeLabel}</span>
      <span className="text-slate-600">
        {branchNames.length ? branchNames.join(", ") : "-"}
      </span>
      <span className="text-slate-600">
        {departmentNames.length ? departmentNames.join(", ") : "-"}
      </span>
      <span className="break-all">{row.mobile || row.email || "-"}</span>
      <span>
        {feeRule
          ? `₹${Number(feeRule.fee_amount || 0).toLocaleString("en-IN")} · ${feeRule.doctor_share_percentage || 0}:${100 - Number(feeRule.doctor_share_percentage || 0)}`
          : "-"}
      </span>
      <Badge tone={row.status === "active" ? "green" : "red"}>
        {row.status === "active" ? "Active" : "Inactive"}
      </Badge>
      <ActionGroup className="justify-start xl:justify-end">
        <ActionButton onClick={stop(onEdit)}>Edit</ActionButton>
        <ActionButton onClick={stop(onStatus)}>
          {row.status === "active" ? "Inactive" : "Active"}
        </ActionButton>
        <ActionButton tone="danger" onClick={stop(onDelete)}>
          Delete
        </ActionButton>
      </ActionGroup>
    </div>
  );
}

function formatPractitionerName(row: any) {
  const name = row?.full_name || row?.name || "-";
  if (row?.practitioner_type !== "physiotherapist") return name;
  const withoutSuffix = name.replace(/,\s*PT$/i, "");
  return `${withoutSuffix}, PT`;
}

function CheckboxGroup({ title, name, rows, selected, empty }: any) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-bold uppercase text-slate-500">{title}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {rows.length === 0 && <p className="text-sm text-slate-500">{empty}</p>}
        {rows.map((row: any) => (
          <label
            key={row.id}
            className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm font-semibold"
          >
            <input
              type="checkbox"
              name={name}
              value={row.id}
              defaultChecked={selected.includes(row.id)}
            />
            <span>{row.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
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
function Empty({ text }: any) {
  return (
    <div className="px-4 py-8 text-center text-sm text-slate-500">{text}</div>
  );
}
function ConfirmModal({ confirm, busy, onClose, onConfirm }: any) {
  const isDelete = confirm.kind === "delete";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-md">
        <h3 className="text-lg font-bold">
          {isDelete ? "Delete Doctor" : "Change Doctor Status"}
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          {isDelete
            ? "This will deactivate the doctor so future scheduling cannot use them."
            : "Please confirm the doctor status change."}
        </p>
        <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-bold">
          {confirm.row.full_name}
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
