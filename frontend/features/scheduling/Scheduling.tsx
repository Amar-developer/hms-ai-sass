"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Card, RefreshButton, StatusToast } from "@/app/components/common/ui";
import { selectedSchedulePayloadsFromRHF } from "@/features/scheduling/helpers";
import { ScheduleForm } from "@/features/scheduling/forms/ScheduleForms";
import { pageSize, weekdays } from "./constants";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";
import { Pagination } from "@/app/components/common/Pagination";
import { ScheduleFormValues } from "./schedule.schema";
import { useSchedulingData, useSchedulingActions } from "./api";
import { AdaptiveFilterTrigger } from "@/app/components/common/AdaptiveFilterTrigger";
import { AdaptiveSortTrigger } from "@/app/components/common/AdaptiveSortTrigger";
import { AdaptiveResultCount } from "@/app/components/common/AdaptiveResultCount";
import { BreadcrumbSlot } from "@/features/shell/AppShell";
import { DataTable } from "@/app/components/common/DataTable";
import { getScheduleColumns } from "./column";
import { getScheduleTableSchema, getScheduleQueryFields } from "./filterSchema";
import { sortRows } from "@/utils/sortRows";
import { applyQueryFilters, type QueryFilterRow } from "@/utils/queryFilter";
import type { SortState } from "@/utils/types";

export function Scheduling({
  apiSession,
  branchId,
  view = "list",
  selectedId = "",
}: any) {
  const router = useRouter();
  // Department is no longer a row-level filter (moved into the ad-hoc
  // builder below) — the hook only ever used it to order the department
  // dropdown's options, so a fixed "all" is equivalent to what a user who
  // never touched the old dropdown would have seen anyway.
  const filterDepartment = "all";
  const [tenantId, setTenantId] = useState(apiSession?.tenantId || "");

  const { tenants, branches, departments, doctors, rows, loading, reload } =
    useSchedulingData({
      apiSession,
      tenantId,
      filterDepartment,
    });

  const { create, update, remove, busy } = useSchedulingActions(apiSession);

  const isSuperAdmin = Boolean(apiSession?.user?.is_super_admin);
  const [query, setQuery] = useState("");
  const [filterWeekday, setFilterWeekday] = useState("all");
  const [sort, setSort] = useState<SortState | null>({
    key: "updated_at",
    dir: "desc",
  });
  const [queryFilters, setQueryFilters] = useState<QueryFilterRow[]>([]);
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<any>(null);

  const scopedSession =
    apiSession && tenantId ? { ...apiSession, tenantId } : apiSession;

  // One row is one editable schedule now — no more client-side grouping.
  const selected = rows.find((row: any) => row.id === selectedId);

  const scheduleSchema = getScheduleTableSchema();

  const filterValues = {
    weekday: filterWeekday,
  };

  const handleFilterChange = (key: string, value: string) => {
    if (key == "weekday") {
      setFilterWeekday(value);
    }
    setPage(1);
  };

  const resetScheduleFilters = () => {
    setFilterWeekday("all");
    setSort({ key: "updated_at", dir: "desc" });
  };

  // Bounce back to the list if a direct/bookmarked edit link no longer
  // resolves to a real schedule, but only once loading has finished.
  useEffect(() => {
    if (view !== "edit" || !selectedId || loading) return;
    if (!selected) router.replace("/scheduling");
  }, [view, selectedId, loading, selected, router]);

  function open(nextView: string, id = "") {
    const path =
      nextView === "create"
        ? "/scheduling/new"
        : nextView === "edit"
          ? `/scheduling/${encodeURIComponent(id)}/edit`
          : "/scheduling";
    router.push(path);
    setMessage("");
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

    // One row per branch (for "all branches") and per time range — no more
    // per-weekday fan-out, since a schedule's weekday set now lives on one
    // row.
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

    // Duplicate detection lives on the server, which compares the actual
    // time windows: separate morning/evening sessions in one department are
    // legitimate, only overlapping ones are rejected. Checking department
    // alone here would block those valid additions.
    setMessage("");

    try {
      const createdRows = await Promise.all(
        schedulePayloads.map((payload) =>
          create(practitionerId, payload, scopedSession),
        ),
      );

      open("list");
      await reload();
      setMessage(
        `${createdRows.length} schedule${createdRows.length === 1 ? "" : "s"} created.`,
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

    // As with create, overlap-based duplicate detection is the server's job.
    setMessage("");

    try {
      const [firstPayload, ...extraPayloads] = schedulePayloads;

      // The edited row is updated in place; any additional payloads (a
      // second time range, or "all branches") become brand new rows — no
      // delete/recreate dance needed since a row's weekdays never need to
      // be split or merged with another row's anymore.
      await update(
        selected.id,
        { ...firstPayload, practitioner_id: practitionerId },
        scopedSession,
      );

      if (extraPayloads.length > 0) {
        await Promise.all(
          extraPayloads.map((payload) =>
            create(practitionerId, payload, scopedSession),
          ),
        );
      }

      open("list");
      await reload();
      setMessage(
        extraPayloads.length
          ? `Schedule updated and ${extraPayloads.length} extra schedule${
              extraPayloads.length === 1 ? "" : "s"
            } created.`
          : "Schedule updated.",
      );
    } catch (err: any) {
      setMessage(err.message || "Could not update schedule.");
    }
  }

  async function deleteSchedule(row: any) {
    if (!scopedSession) return;

    setMessage("");

    try {
      await remove(row.id, scopedSession);
      setMessage("Schedule deleted.");
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
        error={message}
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
        error={message}
        onSubmit={updateSchedule}
        back={() => open("list")}
      />
    );

  const scheduleQueryFields = getScheduleQueryFields({
    rows,
    branches,
    departments,
  });
  const filteredRows = sortRows(
    applyQueryFilters(
      rows.filter((row: any) => {
        const doctor = doctors.find(
          (item: any) => item.id === row.practitioner_id,
        );
        const department = departments.find(
          (item: any) => item.id === row.department_id,
        );
        const text = [
          row.practitioner_full_name || doctor?.full_name,
          row.department_name || department?.name,
        ]
          .join(" ")
          .toLowerCase();
        return (
          (!query || text.includes(query.toLowerCase())) &&
          (filterWeekday === "all" ||
            (row.weekdays || []).includes(Number(filterWeekday)))
        );
      }),
      scheduleQueryFields,
      queryFilters,
    ),
    sort,
    (row, key) => {
      if (key === "updated_at") return row.updated_at || row.created_at;
      if (key === "doctor")
        return (
          row.practitioner_full_name ||
          doctors.find((item: any) => item.id === row.practitioner_id)
            ?.full_name
        );
      if (key === "branch")
        return (
          row.branch_name ||
          branches.find((item: any) => item.id === row.branch_id)?.name
        );
      if (key === "department")
        return (
          row.department_name ||
          departments.find((item: any) => item.id === row.department_id)
            ?.name
        );
      if (key === "status") return row.is_active ? 1 : 0;
      return row[key];
    },
  );

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const columns = getScheduleColumns({
    doctors,
    branches,
    departments,
    onEdit: (id) => open("edit", id),
    onDelete: (row) => setConfirm({ row }),
  });
  return (
    <Card>
      <BreadcrumbSlot>
        <div className="flex items-center gap-2">
          <AdaptiveResultCount
            shown={pageRows.length}
            total={filteredRows.length}
            noun="schedules"
          />
          <RefreshButton
            onRefresh={reload}
            className="h-auto rounded-md px-2.5 py-1 text-[11px]"
          />
          <AdaptiveFilterTrigger
            schema={scheduleSchema}
            query={query}
            setQuery={setQuery}
            filterValues={filterValues}
            onFilterChange={handleFilterChange}
            sort={sort}
            onSortChange={setSort}
            showSort={false}
            onReset={resetScheduleFilters}
            queryFields={scheduleQueryFields}
            queryFilters={queryFilters}
            onQueryFiltersChange={setQueryFilters}
          />
          <AdaptiveSortTrigger
            fields={scheduleSchema.sortFields}
            sort={sort}
            onSortChange={setSort}
          />
        </div>
      </BreadcrumbSlot>
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
          <button
            type="button"
            onClick={() => open("create")}
            className="primary-action gap-2 px-4 py-3 text-xs"
          >
            <Plus size={16} />
            Create Schedule
          </button>
        </div>
      </div>

      <StatusToast message={message} onClose={() => setMessage("")} />
      <div className="mt-3 overflow-x-auto max-w-[1000px]">
        <DataTable
          columns={columns}
          data={pageRows}
          loading={loading}
          emptyMessage="No schedules available"
          className=" rounded-2xl border border-slate-200 overflow-auto"
          onRowClick={(row) => open("edit", row.id)}
          sort={sort ?? undefined}
          onSortChange={setSort}
        />
      </div>

      <Pagination
        page={safePage}
        totalPages={totalPages}
        total={filteredRows.length}
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
