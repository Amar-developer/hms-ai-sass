"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Card, RefreshButton, StatusToast } from "@/app/components/common/ui";
import { apiFetch, apiUpload } from "@/lib/api";
import { mapWithConcurrency } from "@/lib/concurrency";
import { SelectField } from "@/app/components/FormElements";
import { uniqueDepartmentRows } from "@/lib/options";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";
import { activeTenantOptions } from "@/utils/helper";
import { DoctorForm } from "@/features/doctors/forms/DoctorForm";
import { Pagination } from "@/app/components/common/Pagination";
import {
  CopyIdButton,
  canCopyDatabaseIds,
} from "@/app/components/common/CopyIdButton";
import { usePractitionersQuery } from "@/features/doctors/api/usePractitionersQuery";
import { useQueryClient } from "@tanstack/react-query";
import {
  getTenantBranches,
  getTenantDepartments,
} from "@/features/tenants/api/tenantReferenceQueries";
import { status_options } from "../superAdmin/constants";
import { FilterSection } from "@/app/components/common/FilterSection";
import { DataTable } from "@/app/components/common/DataTable";
import { Column } from "@/utils/types";
import { Badge } from "@/app/components/common/ui";
import { RowActions } from "@/features/admin/components/RowActions";
import { doctorTypes } from "@/features/doctors/constants";
import {
  activeDoctorDepartmentFeeRules,
  activeDoctorFeeRule,
  formatPractitionerName,
} from "@/features/doctors/helpers";

const pageSize = 10;

export function Doctors({
  apiSession,
  clinic,
  allowedDepartments = [],
  view = "list",
  selectedId = "",
}: any) {
  const router = useRouter();
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
  const canCreateDoctor = hasPermission(
    "practitioners.manage",
    "practitioners.create",
  );
  const canEditDoctor = hasPermission(
    "practitioners.manage",
    "practitioners.edit",
  );
  const canDeleteDoctor = hasPermission(
    "practitioners.manage",
    "practitioners.delete",
  );
  const [tenants, setTenants] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState(apiSession?.tenantId || "");
  const scopedSession =
    apiSession && tenantId ? { ...apiSession, tenantId } : apiSession;
  const {
    livePractitioners: rows,
    isLoading: practitionersLoading,
    error: practitionersError,
    refetch: refetchPractitioners,
    setLocal: setLivePractitioners,
  } = usePractitionersQuery(scopedSession);
  const [branches, setBranches] = useState<any[]>(clinic?.branches || []);
  const [departments, setDepartments] = useState<any[]>(
    uniqueDepartmentRows(allowedDepartments),
  );
  const [users, setUsers] = useState<any[]>([]);
  const [feeRules, setFeeRules] = useState<any[]>([]);
  const [usersTenantId, setUsersTenantId] = useState("");
  const [feeRulesTenantId, setFeeRulesTenantId] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<any>(null);
  const [selectedDepartmentByDoctor, setSelectedDepartmentByDoctor] = useState<
    Record<string, string>
  >({});
  const [selectedBranchByDoctor, setSelectedBranchByDoctor] = useState<
    Record<string, string>
  >({});
  const selected = rows.find((row: any) => row.id === selectedId);
  const listLoading = practitionersLoading || referenceLoading;

  // Bounce back to the list if a direct/bookmarked edit link no longer
  // resolves to a real practitioner, but only once loading has actually
  // finished.
  useEffect(() => {
    if (view !== "edit" || !selectedId || listLoading) return;
    if (!selected) router.replace("/practitioners");
  }, [view, selectedId, listLoading, selected, router]);

  function syncSharedPractitioner(practitioner: any) {
    if (!setLivePractitioners || !practitioner?.id) return;
    setLivePractitioners((previous: any[]) =>
      previous.some((row: any) => row.id === practitioner.id)
        ? previous.map((row: any) =>
            row.id === practitioner.id ? practitioner : row,
          )
        : [practitioner, ...previous],
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

  async function loadReferenceData(nextTenantId = tenantId, force = false) {
    if (!apiSession || !nextTenantId) return;
    if (!force && nextTenantId === apiSession.tenantId) {
      setBranches(clinic?.branches || []);
      setDepartments(uniqueDepartmentRows(allowedDepartments));
      return;
    }
    setReferenceLoading(true);
    setMessage("");
    const session = { ...apiSession, tenantId: nextTenantId };
    try {
      const [branchRows, departmentRows] = await Promise.all([
        getTenantBranches(queryClient, session, nextTenantId, force),
        getTenantDepartments(queryClient, session, nextTenantId, force),
      ]);
      setBranches(branchRows);
      setDepartments(uniqueDepartmentRows(departmentRows));
    } catch (err: any) {
      setMessage(err.message || "Could not load doctors.");
    } finally {
      setReferenceLoading(false);
    }
  }

  async function loadUsers(nextTenantId = tenantId) {
    if (!apiSession || !nextTenantId) return;
    if (usersTenantId === nextTenantId) return;
    const session = { ...apiSession, tenantId: nextTenantId };
    const userRows = await apiFetch("/identity/users", session).catch(() => []);
    setUsers(userRows);
    setUsersTenantId(nextTenantId);
  }

  async function loadFeeRules(nextTenantId = tenantId, force = false) {
    if (!apiSession || !nextTenantId) return;
    if (!force && feeRulesTenantId === nextTenantId) return;
    const session = { ...apiSession, tenantId: nextTenantId };
    const feeRuleRows = await apiFetch(
      "/billing/doctor-fee-rules",
      session,
    ).catch(() => []);
    setFeeRules(feeRuleRows);
    setFeeRulesTenantId(nextTenantId);
  }

  async function loadEditorData(nextTenantId = tenantId) {
    await Promise.all([loadUsers(nextTenantId), loadFeeRules(nextTenantId)]);
  }

  async function refreshList() {
    await Promise.all([
      refetchPractitioners(),
      loadReferenceData(tenantId, true),
    ]);
  }
  useEffect(() => {
    if (apiSession) {
      loadTenants();
    }
  }, [apiSession?.tenantId]);
  useEffect(() => {
    if (apiSession && tenantId) {
      setUsersTenantId("");
      setFeeRulesTenantId("");
      setUsers([]);
      setFeeRules([]);
      loadReferenceData(tenantId);
    }
  }, [apiSession?.tenantId, tenantId, clinic, allowedDepartments]);

  useEffect(() => {
    if (practitionersError) {
      setMessage(
        (practitionersError as Error).message || "Could not load doctors.",
      );
    }
  }, [practitionersError]);

  useEffect(() => {
    if (listLoading || !rows.length || feeRulesTenantId === tenantId) return;
    // Fee labels enrich the table, but they must not delay the first useful
    // render. Form-only users remain completely deferred until Create/Edit.
    const timer = window.setTimeout(() => void loadFeeRules(tenantId), 300);
    return () => window.clearTimeout(timer);
  }, [feeRulesTenantId, listLoading, rows.length, tenantId]);

  function open(nextView: string, id = "") {
    const finish = () => {
      const path =
        nextView === "create"
          ? "/practitioners/new"
          : nextView === "edit"
            ? `/practitioners/${id}/edit`
            : "/practitioners";
      router.push(path);
      requestAnimationFrame(() =>
        window.scrollTo({ top: 0, behavior: "smooth" }),
      );
    };
    if (nextView !== "create" && nextView !== "edit") {
      finish();
      return;
    }
    setBusy(true);
    setMessage("");
    void loadEditorData()
      .then(finish)
      .catch((err: any) => {
        setMessage(err.message || "Could not load doctor editor data.");
      })
      .finally(() => setBusy(false));
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
    await mapWithConcurrency(
      targets,
      (target) => {
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
      },
      4,
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
      syncSharedPractitioner(created);
      open("list");
      await loadFeeRules(tenantId, true);
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
      syncSharedPractitioner(updated);
      open("list");
      await loadFeeRules(tenantId, true);
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
      if (setLivePractitioners) {
        setLivePractitioners((previous: any[]) =>
          previous.map((row: any) =>
            row.id === practitionerId
              ? { ...row, signature_url: created.file_url }
              : row,
          ),
        );
      }
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
      syncSharedPractitioner(updated);
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
      if (setLivePractitioners) {
        setLivePractitioners((previous: any[]) =>
          previous.map((item: any) =>
            item.id === row.id ? { ...item, status: "inactive" } : item,
          ),
        );
      }
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

  if (view === "create" && canCreateDoctor)
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
        (branchFilter === "all" ||
          (row.branch_ids || []).includes(branchFilter)) &&
        (departmentFilter === "all" ||
          (row.department_ids || []).includes(departmentFilter))
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
  const doctorFilters = [
    {
      key: "branch",
      label: "Branch",
      options: [
        { value: "all", label: "All branches" },
        ...branches.map((branch: any) => ({
          value: branch.id,
          label: branch.name,
        })),
      ],
    },
    {
      key: "department",
      label: "Department",
      options: [
        { value: "all", label: "All departments" },
        ...departments.map((department: any) => ({
          value: department.id,
          label: department.name,
        })),
      ],
    },
    {
      key: "status",
      label: "Status",
      options: status_options,
    },
  ];

  const filterValues = {
    branch: branchFilter,
    department: departmentFilter,
    status,
  };

  const doctorColumns: Column<any>[] = [
    {
      key: "full_name",
      header: "Doctor",
      width:'140px',
      render: (row: any) => (
        <div className="flex min-w-0 items-center gap-2">
          <b className="truncate text-sm">{formatPractitionerName(row)}</b>
          <CopyIdButton value={row.id} label="Doctor ID" allowed={canCopyIds} />
        </div>
      ),
    },
    {
      key: "practitioner_type",
      header: "Type",
      width:'100px',
      render: (row: any) => (
        <span className="text-sm">
          {doctorTypes.find(
            ([value]) => value === row.practitioner_type,
          )?.[1] || row.practitioner_type}
        </span>
      ),
    },
    {
      key: "branch_ids",
      header: "Branches",
      width: "140px",
      disableRowClick: true,
      render: (row: any) => {
        const rowBranches = (row.branch_ids || []).map((id: string) => ({
          branchId: id,
          branchName: branches.find((branch: any) => branch.id === id)?.name || id,
        }));
        if (!rowBranches.length) return <span className="text-sm">-</span>;
        if (rowBranches.length === 1)
          return (
            <span className="text-slate-600 text-sm">
              {rowBranches[0].branchName}
            </span>
          );
        const selectedBranchId =
          selectedBranchByDoctor[row.id] || rowBranches[0].branchId;
        return (
          <select
            value={selectedBranchId}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) =>
              setSelectedBranchByDoctor((previous) => ({
                ...previous,
                [row.id]: event.target.value,
              }))
            }
            className="border rounded px-2 py-1 text-sm"
          >
            {rowBranches.map((branch: any) => (
              <option value={branch.branchId} key={branch.branchId}>
                {branch.branchName}
              </option>
            ))}
          </select>
        );
      },
    },
    {
      key: "department_ids",
      header: "Departments",
      cellClassName:"text-center",
      className:"text-center",
      width:"180px",
      disableRowClick: true,
      render: (row: any) => {
        const specialties = (row.department_ids || []).map(
          (departmentId: string) => ({
            departmentId,
            departmentName:
              departments.find((department: any) => department.id === departmentId)
                ?.name || departmentId,
          }),
        );
        if (!specialties.length) return <span className="text-sm">-</span>;
        if (specialties.length === 1)
          return (
            <span className="text-slate-600 text-sm">
              {specialties[0].departmentName}
            </span>
          );
        const selectedDepartmentId =
          selectedDepartmentByDoctor[row.id] || specialties[0].departmentId;
        return (
          <select
            value={selectedDepartmentId}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) =>
              setSelectedDepartmentByDoctor((previous) => ({
                ...previous,
                [row.id]: event.target.value,
              }))
            }
            className="border rounded px-2 py-1 text-sm"
          >
            {specialties.map((specialty: any) => (
              <option value={specialty.departmentId} key={specialty.departmentId}>
                {specialty.departmentName}
              </option>
            ))}
          </select>
        );
      },
    },
    {
      key: "contact",
      header: "Contact",
      width:"120px",
      render: (row: any) => (
        <span className="break-all text-sm">
          {row.mobile || row.email || "-"}
        </span>
      ),
    },
    {
      key: "fee",
      header: "Fee",
      width:"80px",
      render: (row: any) => {
        const departmentIds = row.department_ids || [];
        if (!departmentIds.length) return <span className="text-sm">-</span>;
        const selectedDepartmentId =
          selectedDepartmentByDoctor[row.id] || departmentIds[0];
        const departmentFeeRules = activeDoctorDepartmentFeeRules(
          feeRules,
          row,
        );
        const fallbackFeeRule = activeDoctorFeeRule(feeRules, row);
        const feeRule =
          departmentFeeRules.find(
            (rule: any) => rule.department_id === selectedDepartmentId,
          ) || fallbackFeeRule;
        return (
          <span className="text-sm">
            {feeRule
              ? `₹${Number(feeRule.fee_amount || 0).toLocaleString("en-IN")}`
              : "-"}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      width:"100px",
      className: "text-center",
      cellClassName: "text-center",
      render: (row: any) => (
        <Badge
          tone={row.status === "active" ? "green" : "red"}
          className="table-status text-sm"
        >
          {row.status === "active" ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width:"100px",
      className: "text-center",
      cellClassName: "text-center",
      disableRowClick: true,
      render: (row: any) => (
        <div className="flex justify-center">
          <RowActions
            actions={[
              {
                label: "Edit",
                onClick: () => open("edit", row.id),
              },
              {
                label: row.status === "active" ? "Inactive" : "Active",
                onClick: () => setConfirm({ kind: "status", row }),
                hidden: !canEditDoctor,
              },
              {
                label: "Delete",
                onClick: () => setConfirm({ kind: "delete", row }),
                hidden: !canDeleteDoctor,
                danger: true,
              },
            ]}
          />
        </div>
      ),
    },
  ];

  const handleFilterChange = (key: string, value: string) => {
    setPage(1);
    switch (key) {
      case "branch":
        setBranchFilter(value);
        break;
      case "department":
        setDepartmentFilter(value);
        break;
      case "status":
        setStatus(value);
        break;
    }
    loadUsers(tenantId);
  };

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
          <RefreshButton onRefresh={refreshList} />
          {canCreateDoctor && (
            <button
              type="button"
              onClick={() => open("create")}
              className="inline-flex items-center justify-center gap-2 rounded-lg lg:w-full bg-slate-900 px-4 py-3 text-xs  font-bold text-white"
            >
              <Plus size={16} />
              Create Doctor
            </button>
          )}
        </div>
      </div>
      <StatusToast message={message} onClose={() => setMessage("")} />
      <div className="mt-4 grid grid-2">
        {isSuperAdmin && (
          <SelectField
            label="Tenant"
            value={tenantId}
            onChange={setTenantId}
            options={tenants.map((t: any) => ({ value: t.id, label: t.name }))}
          />
        )}
        <FilterSection
          title="Doctors"
          filters={doctorFilters}
          filterValues={filterValues}
          query={query}
          setQuery={setQuery}
          onReset={() => {
            setBranchFilter("all");
            setDepartmentFilter("all");
            setStatus("all");
            setPage(1);
          }}
          onFilterChange={handleFilterChange}
        />
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <div className="min-w-[1280px]">
          <DataTable
            columns={doctorColumns}
            data={pageRows}
            loading={listLoading}
            emptyMessage="No doctors match your search."
            onRowClick={(row: any) => open("edit", row.id)}
          />
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
          action={confirm}
          onCancel={() => setConfirm(null)}
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
