"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { FormField } from "@/app/components/FormElements";
import {
  Card,
  Field,
  Input,
  RefreshButton,
  SearchableSelect,
  StatusToast,
} from "@/app/components/common/ui";
import {
  groupSchedules,
  selectedSchedulePayloadsFromRHF,
} from "@/features/scheduling/helpers";
import { ScheduleForm } from "@/features/scheduling/forms/ScheduleForms";
import { mapWithConcurrency } from "@/lib/concurrency";
import { pageSize, weekdays } from "./constants";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";
import { Empty } from "@/app/components/common/Empty";
import { TableSkeleton } from "@/app/components/common/loader/TableSkeleton";
import { ScheduleRow } from "./components/ScheduleRow";
import { Pagination } from "@/app/components/common/Pagination";
import { ScheduleFormValues } from "./schedule.schema";
import { useSchedulingData, useSchedulingActions } from "./api";

export function Scheduling({ apiSession, branchId }: any) {
  const [filterDepartment, setFilterDepartment] = useState("all");
  const [tenantId, setTenantId] = useState(apiSession?.tenantId || "");

  const { tenants, branches, departments, doctors, rows, loading, reload } =
    useSchedulingData({
      apiSession,
      tenantId,
      filterDepartment,
    });

  const { create, update, remove, busy } = useSchedulingActions(apiSession);

  const isSuperAdmin = Boolean(apiSession?.user?.is_super_admin);
  const [view, setView] = useState("list");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterWeekday, setFilterWeekday] = useState("all");
  const [filterStatus, setFilterStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<any>(null);

  const scopedSession =
    apiSession && tenantId ? { ...apiSession, tenantId } : apiSession;

  const selected = groupSchedules(rows).find(
    (row: any) => row.id === selectedId,
  );

  function open(nextView: string, id = "") {
    setSelectedId(id);
    setView(nextView);
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  }

  async function createSchedule(data: ScheduleFormValues) {
    if (!scopedSession) return;

    const practitionerId = data.practitionerId;
    const doctor = doctors.find((item: any) => item.id === practitionerId);
    const doctorBranchIds = doctor?.branch_ids || [];
    const doctorDepartmentIds = doctor?.department_ids || [];

    if (!practitionerId) {
      setMessage("Select a doctor.");
      return;
    }

    const schedulePayloads = selectedSchedulePayloadsFromRHF(
      data,
      doctorBranchIds,
    );

    if (schedulePayloads.length === 0) {
      setMessage("Select a doctor and medical department.");
      return;
    }

    if (
      schedulePayloads.some(
        (item) =>
          !item.department_id ||
          !doctorDepartmentIds.includes(String(item.department_id)),
      )
    ) {
      setMessage("Select a medical department mapped to this doctor.");
      return;
    }

    setMessage("");

    try {
      const createdRows = await create(
        practitionerId,
        schedulePayloads,
        scopedSession,
      );

      open("list");
      await reload();
      setMessage(
        `${createdRows.length} schedule ${
          createdRows.length === 1 ? "slot" : "slots"
        } created.`,
      );
    } catch (err: any) {
      setMessage(err.message || "Could not create schedule.");
    }
  }

  async function updateSchedule(data: ScheduleFormValues) {
    if (!scopedSession || !selected) return;

    const practitionerId = data.practitionerId || selected.practitioner_id;
    const doctor = doctors.find((item: any) => item.id === practitionerId);
    const doctorBranchIds = doctor?.branch_ids || [];
    const doctorDepartmentIds = doctor?.department_ids || [];

    const schedulePayloads = selectedSchedulePayloadsFromRHF(
      data,
      doctorBranchIds,
    );

    if (schedulePayloads.length === 0) {
      setMessage("Select a medical department mapped to this doctor.");
      return;
    }

    if (
      schedulePayloads.some(
        (item) =>
          !item.department_id ||
          !doctorDepartmentIds.includes(String(item.department_id)),
      )
    ) {
      setMessage("Select a medical department mapped to this doctor.");
      return;
    }

    const existingRows = (selected.schedules || [selected]).filter(
      (row: any) => row && row.is_active !== false,
    );

    setMessage("");

    try {
      const [firstPayload, ...extraPayloads] = schedulePayloads;

      // Update first existing row (or create if none exist)
      if (existingRows[0]) {
        await update(
          existingRows[0].id,
          {
            ...firstPayload,
            practitioner_id: practitionerId,
          },
          scopedSession,
        );
      } else {
        await create(practitionerId, [firstPayload], scopedSession);
      }

      // Create any extra slots
      if (extraPayloads.length > 0) {
        await create(practitionerId, extraPayloads, scopedSession);
      }

      // Delete surplus old rows
      if (existingRows.length > 1) {
        await mapWithConcurrency(
          existingRows.slice(1),
          (row: any) => remove(row.id, scopedSession),
          4,
        );
      }

      open("list");
      await reload();
      setMessage(
        extraPayloads.length
          ? `Schedule updated and ${extraPayloads.length} extra ${
              extraPayloads.length === 1 ? "slot" : "slots"
            } created.`
          : "Schedule updated.",
      );
    } catch (err: any) {
      setMessage(err.message || "Could not update schedule.");
    }
  }

  async function deleteSchedule(row: any) {
    if (!scopedSession) return;

    const rowsToDelete = row.schedules || [row];
    setMessage("");

    try {
      await mapWithConcurrency(
        rowsToDelete,
        (item: any) => remove(item.id, scopedSession),
        4,
      );

      setMessage(
        `${rowsToDelete.length} schedule ${
          rowsToDelete.length === 1 ? "slot" : "slots"
        } deleted.`,
      );
      await reload();
    } catch (err: any) {
      setMessage(err.message || "Could not delete schedule.");
    } finally {
      setConfirm(null);
    }
  }

  if (!apiSession)
    return (
      <Card>
        <h3 className="text-lg font-bold">Doctor Scheduling & Availability</h3>
        <p className="mt-2 text-sm text-slate-500">
          Backend login is required for schedule CRUD.
        </p>
      </Card>
    );

  if (view === "create")
    return (
      <ScheduleForm
        title="Create Doctor Schedule"
        branches={branches}
        departments={departments}
        doctors={doctors}
        busy={busy}
        onSubmit={createSchedule}
        back={() => open("list")}
      />
    );

  if (view === "edit" && selected)
    return (
      <ScheduleForm
        title="Edit Doctor Schedule"
        schedule={selected}
        branches={branches}
        departments={departments}
        doctors={doctors}
        busy={busy}
        onSubmit={updateSchedule}
        back={() => open("list")}
      />
    );

  const filtered = rows
    .filter((row: any) => {
      const doctor = doctors.find(
        (item: any) => item.id === row.practitioner_id,
      );
      const department = departments.find(
        (item: any) => item.id === row.department_id,
      );
      const text = [
        doctor?.full_name,
        row.room_number,
        department?.name,
        row.id,
      ]
        .join(" ")
        .toLowerCase();
      return (
        (!query || text.includes(query.toLowerCase())) &&
        (filterBranch === "all" || row.branch_id === filterBranch) &&
        (filterDepartment === "all" ||
          row.department_id === filterDepartment) &&
        (filterWeekday === "all" || String(row.weekday) === filterWeekday)
      );
    })
    .sort(
      (a: any, b: any) =>
        new Date(b.updated_at || b.created_at).getTime() -
        new Date(a.updated_at || a.created_at).getTime(),
    );

  const groupedRows = groupSchedules(filtered)
    .filter(
      (group: any) =>
        filterStatus === "all" ||
        (filterStatus === "active" ? group.is_active : !group.is_active),
    )
    .sort(
      (a: any, b: any) =>
        new Date(b.updated_at || b.created_at).getTime() -
        new Date(a.updated_at || a.created_at).getTime(),
    );

  const totalPages = Math.max(1, Math.ceil(groupedRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = groupedRows.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h3 className="card-title font-bold">
            Doctor Scheduling & Availability
          </h3>
          <p className="card-desc text-slate-500">
            Tenant-scoped weekly consultation timings mapped to doctor, branch,
            medical department, room, and slot duration.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={reload} />
          <button
            type="button"
            onClick={() => open("create")}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-xs font-bold text-white"
          >
            <Plus size={16} />
            Create Schedule
          </button>
        </div>
      </div>

      <StatusToast message={message} onClose={() => setMessage("")} />

      <div className="mt-4 grid gap-3 md:grid-cols-5 lg:grid-cols-5 xl:grid-cols-5">
        {isSuperAdmin && (
          <Field label="Tenant">
            <SearchableSelect
              value={tenantId}
              onChange={setTenantId}
              options={tenants.map((tenant: any) => ({
                value: tenant.id,
                label: tenant.name,
              }))}
              placeholder="Select Tenant"
              searchable
            />
          </Field>
        )}

        <FormField label="Search">
          <Input
            value={query}
            onChange={(e: any) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Doctor, room, medical department"
          />
        </FormField>

        <Field label="Branch">
          <SearchableSelect
            value={filterBranch}
            onChange={(value) => {
              setFilterBranch(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All branches" },
              ...branches.map((branch: any) => ({
                value: branch.id,
                label: branch.name,
              })),
            ]}
            placeholder="All branches"
            searchable={false}
          />
        </Field>

        <Field label="Department">
          <SearchableSelect
            value={filterDepartment}
            onChange={(value) => {
              setFilterDepartment(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All Departments" },
              ...departments.map((department: any) => ({
                value: department.id,
                label: department.name,
              })),
            ]}
            placeholder="All Departments"
            searchable={false}
          />
        </Field>

        <Field label="Weekday">
          <SearchableSelect
            value={filterWeekday}
            onChange={(value) => {
              setFilterWeekday(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All days" },
              ...weekdays.map(([value, label]) => ({
                value,
                label,
              })),
            ]}
            placeholder="All days"
            searchable={false}
          />
        </Field>

        <Field label="Status">
          <SearchableSelect
            value={filterStatus}
            onChange={(value) => {
              setFilterStatus(value);
              setPage(1);
            }}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
              { value: "all", label: "All" },
            ]}
            searchable={false}
            placeholder="Status"
          />
        </Field>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <div className="min-w-[1120px]">
          <div className="md:grid grid-cols-[1.1fr_.9fr_.9fr_.8fr_.8fr_.65fr_.7fr_.7fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500">
            <span>Doctor</span>
            <span>Branch</span>
            <span>Department</span>
            <span>Room No.</span>
            <span>Timing</span>
            <span>Slots</span>
            <span className="text-center">Status</span>
            <span className="text-center">Actions</span>
          </div>

          <div className="divide-y divide-slate-200">
            {loading && pageRows.length === 0 && <TableSkeleton />}
            {!loading && pageRows.length === 0 && (
              <Empty text="No schedules match your search." />
            )}
            {pageRows.map((row: any) => (
              <ScheduleRow
                key={row.id}
                row={row}
                branches={branches}
                departments={departments}
                doctors={doctors}
                onEdit={() => open("edit", row.id)}
                onDelete={() => setConfirm({ row })}
              />
            ))}
          </div>
        </div>
      </div>

      <Pagination
        page={safePage}
        totalPages={totalPages}
        total={groupedRows.length}
        onPage={setPage}
      />

      {confirm && (
        <ConfirmModal
          busy={busy}
          action={confirm.row}
          onCancel={() => setConfirm(null)}
          onConfirm={() => deleteSchedule(confirm.row)}
        />
      )}
    </Card>
  );
}
