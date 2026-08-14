"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Card, RefreshButton, SearchableSelect, StatusToast } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";
import { DoctorForm } from "@/features/doctors/forms/DoctorForm";
import { Pagination } from "@/app/components/common/Pagination";
import { canCopyDatabaseIds } from "@/app/components/common/CopyIdButton";
import {
  usePractitionersQuery,
  useDoctorReferenceData,
  useDoctorActions,
} from "@/features/doctors/api";
import { AdaptiveFilterTrigger } from "@/app/components/common/AdaptiveFilterTrigger";
import { BreadcrumbSlot } from "@/features/shell/AppShell";
import { DataTable } from "@/app/components/common/DataTable";
import { getDoctorColumns } from "./Column";
import { getDoctorTableSchema } from "./filterSchema";
import { sortRows } from "@/utils/sortRows";
import type { SortState } from "@/utils/types";

const pageSize = 10;

export function Doctors({
  apiSession,
  clinic,
  allowedDepartments = [],
  view = "list",
  selectedId = "",
}: any) {
  const router = useRouter();
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
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [sort, setSort] = useState<SortState | null>({
    key: "updated_at",
    dir: "desc",
  });
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<any>(null);
  const [selectedDepartmentByDoctor, setSelectedDepartmentByDoctor] = useState<
    Record<string, string>
  >({});
  const [selectedBranchByDoctor, setSelectedBranchByDoctor] = useState<
    Record<string, string>
  >({});
  const selected = rows.find((row: any) => row.id === selectedId);
  const {
    tenants,
    branches,
    departments,
    users,
    feeRules,
    feeRulesTenantId,
    referenceLoading,
    loadReferenceData,
    loadUsers,
    loadFeeRules,
    loadEditorData,
  } = useDoctorReferenceData({
    apiSession,
    tenantId,
    setTenantId,
    clinic,
    allowedDepartments,
    setMessage,
  });
  const listLoading = practitionersLoading || referenceLoading;

  const doctorSchema = getDoctorTableSchema({ branches, departments });

  const filterValues = {
    branch: branchFilter,
    department: departmentFilter,
    status,
  };

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

  function resetDoctorFilters() {
    setBranchFilter("all");
    setDepartmentFilter("all");
    setStatus("all");
    setPage(1);
  }

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

  const {
    createDoctor,
    updateDoctor: updateDoctorRequest,
    uploadDoctorSignature,
    deactivate,
    deleteDoctor,
  } = useDoctorActions({
    apiSession,
    scopedSession,
    tenantId,
    feeRules,
    setBusy,
    setMessage,
    setConfirm,
    syncSharedPractitioner,
    setLivePractitioners,
    loadFeeRules,
    afterSave: () => open("list"),
  });

  async function refreshList() {
    await Promise.all([
      refetchPractitioners(),
      loadReferenceData(tenantId, true),
    ]);
  }

  // Bounce back to the list if a direct/bookmarked edit link no longer
  // resolves to a real practitioner, but only once loading has actually
  // finished.
  useEffect(() => {
    if (view !== "edit" || !selectedId || listLoading) return;
    if (!selected) router.replace("/practitioners");
  }, [view, selectedId, listLoading, selected, router]);

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
        onSubmit={(data: any) => updateDoctorRequest(selected, data)}
        onUploadSignature={(file: File) =>
          uploadDoctorSignature(selected.id, file)
        }
        back={() => open("list")}
      />
    );
  const filtered = sortRows(
    rows.filter((row: any) => {
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
    }),
    sort,
    (row, key) =>
      key === "updated_at" ? row.updated_at || row.created_at : row[key],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  const doctorColumns = getDoctorColumns({
    canCopyIds,
    branches,
    departments,
    feeRules,
    selectedBranchByDoctor,
    setSelectedBranchByDoctor,
    selectedDepartmentByDoctor,
    setSelectedDepartmentByDoctor,
    canEditDoctor,
    canDeleteDoctor,
    openEdit: (id: string) => open("edit", id),
    setConfirm,
  });

  return (
    <Card>
      <BreadcrumbSlot>
        <AdaptiveFilterTrigger
          schema={doctorSchema}
          query={query}
          setQuery={setQuery}
          filterValues={filterValues}
          onFilterChange={handleFilterChange}
          sort={sort}
          onSortChange={setSort}
          onReset={resetDoctorFilters}
        >
          {isSuperAdmin && (
            <FormField label="Tenant">
              <SearchableSelect
                searchable={false}
                value={tenantId}
                onChange={setTenantId}
                options={tenants.map((t: any) => ({ value: t.id, label: t.name }))}
              />
            </FormField>
          )}
        </AdaptiveFilterTrigger>
      </BreadcrumbSlot>
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
              className="primary-action gap-2 px-4 py-3 text-xs lg:w-full"
            >
              <Plus size={16} />
              Create Doctor
            </button>
          )}
        </div>
      </div>
      <StatusToast message={message} onClose={() => setMessage("")} />
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <div className="min-w-[1080px]">
          <DataTable
            columns={doctorColumns}
            data={pageRows}
            loading={listLoading}
            emptyMessage="No doctors match your search."
            onRowClick={(row: any) => open("edit", row.id)}
            sort={sort ?? undefined}
            onSortChange={setSort}
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
