"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  Card,
  Field,
  Input,
  RefreshButton,
  Select,
  StatusToast,
} from "@/app/components/common/ui";
import { apiFetch, apiUpload } from "@/lib/api";
import { SelectField, TextField } from "@/app/components/FormElements";
import { uniqueDepartmentRows } from "@/lib/options";
import { doctorTypes } from "@/utils/doctors/constants";
import { Empty,Pagination,ConfirmModal,DoctorRow } from "@/app/components/doctors/Shared";
import { activeTenantOptions } from "@/utils/doctors/helpers";
import { DoctorForm } from "@/app/components/doctors/Forms";

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
  }, [apiSession?.tenantId]);
  useEffect(() => {
    if (apiSession && tenantId) {
      loadData(tenantId);
    }
  }, [apiSession?.tenantId, tenantId]);

  function open(nextView: string, id = "") {
    setSelectedId(id);
    setView(nextView);
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  }

  async function saveDoctorFeeRules(practitionerId: string, data: any) {
    if (!scopedSession) return;
    const practitionerType = String(data.practitionerType || "doctor");
    const branchIds: string[] = data.branchIds || [];
    const specialtyFees: any[] = data.specialtyFees || [];
    const targets = (branchIds.length ? branchIds : [null]).flatMap(
      (branchId: string | null) =>
        specialtyFees.map((specialty) => ({
          branchId,
          departmentId: specialty.departmentId,
          feeAmount: Number(specialty.fee),
          doctorSharePercentage: Math.min(
            100,
            Math.max(0, Number(specialty.doctorSharePercentage || 0)),
          ),
        })),
    );
    await Promise.all(
      targets.map((target) => {
        const existing = [...feeRules]
          .filter(
            (rule: any) =>
              rule.is_active &&
              rule.practitioner_id === practitionerId &&
              rule.branch_id === target.branchId &&
              rule.department_id === target.departmentId &&
              rule.appointment_type === "op" &&
              (practitionerType === "physiotherapist"
                ? rule.treatment_type === "physiotherapy_session"
                : !rule.treatment_type),
          )
          .sort(
            (a: any, b: any) =>
              new Date(b.created_at || 0).getTime() -
              new Date(a.created_at || 0).getTime(),
          )[0];
        if (
          existing &&
          Number(existing.fee_amount) === target.feeAmount &&
          Number(existing.doctor_share_percentage || 0) ===
            target.doctorSharePercentage &&
          Boolean(existing.share_tax_with_doctor) ===
            (data.shareTaxWithDoctor === "true")
        ) {
          return Promise.resolve(existing);
        }
        return apiFetch("/billing/doctor-fee-rules", scopedSession, {
          method: "POST",
          body: JSON.stringify({
            branch_id: target.branchId,
            department_id: target.departmentId,
            practitioner_id: practitionerId,
            appointment_type: "op",
            treatment_type:
              practitionerType === "physiotherapist"
                ? "physiotherapy_session"
                : null,
            fee_amount: target.feeAmount,
            share_type: "percentage",
            doctor_share_percentage: target.doctorSharePercentage,
            doctor_fixed_amount: null,
            share_tax_with_doctor: data.shareTaxWithDoctor === "true",
          }),
        });
      }),
    );
  }

  async function createDoctor(data: any) {
    if (!scopedSession) return;
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch("/practitioners", scopedSession, {
        method: "POST",
        body: JSON.stringify({
          user_id: data.userId || null,
          full_name: data.fullName,
          practitioner_type: data.practitionerType || "doctor",
          primary_specialty: data.primarySpecialty || null,
          registration_number: data.registrationNumber || null,
          mobile: data.mobile || null,
          email: data.email || null,
          branch_ids: data.branchIds,
          department_ids: data.departmentIds,
          actor_user_id: apiSession.user?.id || null,
        }),
      });
      await saveDoctorFeeRules(created.id, data).catch((err: any) => {
        setMessage(
          err.message || "Doctor created, but fee rule could not be saved.",
        );
      });
      setRows((previous: any[]) => [
        created,
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      open("list");
      await loadData(tenantId);
      setMessage(`Doctor created: ${created.full_name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not create doctor.");
    } finally {
      setBusy(false);
    }
  }

  async function updateDoctor(data: any) {
    if (!scopedSession || !selected) return;
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/practitioners/${selected.id}`,
        scopedSession,
        {
          method: "PATCH",
          body: JSON.stringify({
            user_id: data.userId || null,
            full_name: data.fullName,
            practitioner_type: data.practitionerType || "doctor",
            primary_specialty: data.primarySpecialty || null,
            registration_number: data.registrationNumber || null,
            mobile: data.mobile || null,
            email: data.email || null,
            status: data.status || "active",
            branch_ids: data.branchIds || [],
            department_ids: data.departmentIds || [],
            actor_user_id: apiSession.user?.id || null,
          }),
        },
      );
      await saveDoctorFeeRules(updated.id, data).catch((err: any) => {
        setMessage(
          err.message || "Doctor updated, but fee rule could not be saved.",
        );
      });
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

  async function uploadDoctorSignature(practitionerId: string, file: File) {
    if (!scopedSession || !file) return;
    setBusy(true);
    setMessage("");
    try {
      const upload = new FormData();
      upload.append("file", file);
      upload.append("category", "signature");
      upload.append("source_module", "practitioners");
      upload.append("attached_to_doctype", "Practitioner");
      upload.append("attached_to_name", practitionerId);
      upload.append("attached_to_field", "signature_url");
      upload.append("attached_to_label", "Doctor Signature");
      upload.append("folder", "Signatures");
      const created = await apiUpload("/files", scopedSession, upload);
      setRows((previous: any[]) =>
        previous.map((row: any) =>
          row.id === practitionerId
            ? { ...row, signature_url: created.file_url }
            : row,
        ),
      );
      await loadData(tenantId);
      setMessage("Signature uploaded.");
    } catch (err: any) {
      setMessage(err.message || "Could not upload signature.");
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
        <h3 className="text-base lg:text-lg font-bold">Doctor Management</h3>
        <p className="mt-2 text-xs lg:text-sm text-slate-500">
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
        doctors={rows}
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
        doctors={rows}
        feeRules={feeRules}
        busy={busy}
        onSubmit={updateDoctor}
        onUploadSignature={(file: File) =>
          uploadDoctorSignature(selected.id, file)
        }
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
          <h3 className="card-title font-bold">Doctor Management</h3>
          <p className="card-desc text-slate-500">
            Create, update, deactivate, and map doctors to tenants, branches,
            and medical departments.
          </p>
        </div>
        <div className="flex justify-start items-center gap-2">
          <RefreshButton onRefresh={() => loadData(tenantId)} />
          <button
            type="button"
            onClick={() => open("create")}
            className="inline-flex items-center justify-center gap-2 rounded-lg lg:w-full bg-slate-900 px-4 py-3 text-xs  font-bold text-white"
          >
            <Plus size={16} />
            Create Doctor
          </button>
        </div>
      </div>
      <StatusToast message={message} onClose={() => setMessage("")} />
      <div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-6">
        {isSuperAdmin && (
          <SelectField
            label="Tenant"
            value={tenantId}
            onChange={setTenantId}
            options={tenants.map((t: any) => ({ value: t.id, label: t.name }))}
          />
        )}
        <TextField
          label="Search"
          value={query}
          onChange={(v) => {
            setQuery(v);
            setPage(1);
          }}
          placeholder="Name, specialty, mobile, email"
          className="search-filter text-xs placeholder:text-xs"
        />
        <SelectField
          label="Type"
          value={type}
          onChange={(v) => {
            setType(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All types" },
            ...doctorTypes.map(([value, label]) => ({ value, label })),
          ]}
        />
        <SelectField
          label="Status"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All status" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
        />
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <div className="min-w-[1280px]">
          <div className="hidden md:grid grid-cols-[1.05fr_.65fr_.9fr_.9fr_.65fr_.7fr_.7fr_1.45fr] items-center gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 ">
            <span className="text-sm">Doctor</span>
            <span className="text-sm">Type</span>
            <span className="text-sm">Branches</span>
            <span className="text-sm">Departments</span>
            <span className="text-sm">Contact</span>
            <span className="text-sm">Fee</span>
            <span className="text-sm text-center">Status</span>
            <span className="text-sm text-center lg:text-right">Actions</span>
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
