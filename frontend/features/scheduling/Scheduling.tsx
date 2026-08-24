"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, CalendarClock, PlusCircle } from "lucide-react";
import { Card, RefreshButton, StatusToast } from "@/app/components/common/ui";
import { selectedSchedulePayloadsFromRHF } from "@/features/scheduling/helpers";
import { ScheduleForm } from "@/features/scheduling/forms/ScheduleForms";
import { pageSize } from "./constants";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";
import { newSegment, editSegment } from "@/lib/routeSlugs";
import { Pagination } from "@/app/components/common/Pagination";
import { ScheduleFormValues } from "./schedule.schema";
import {
  getScheduleFilterOptions,
  getSchedulePage,
  useSchedulingData,
  useSchedulingActions,
} from "./api";
import { AdaptiveFilterTrigger } from "@/app/components/common/AdaptiveFilterTrigger";
import { AdaptiveSortTrigger } from "@/app/components/common/AdaptiveSortTrigger";
import { AdaptiveResultCount } from "@/app/components/common/AdaptiveResultCount";
import { BreadcrumbSlot } from "@/features/shell/AppShell";
import { DataTable } from "@/app/components/common/DataTable";
import { getScheduleColumns } from "./column";
import { getScheduleTableSchema, getScheduleQueryFields } from "./filterSchema";
import type { QueryFilterRow } from "@/utils/queryFilter";
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
  const [schedulePage, setSchedulePage] = useState<any>(null);
  const [schedulePageLoading, setSchedulePageLoading] = useState(true);
  const [scheduleFilterOptions, setScheduleFilterOptions] = useState<
    Record<string, { value: string; label: string }[]>
  >({});

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
    setQuery("");
    setQueryFilters([]);
  };

  async function loadSchedulePage() {
    if (!scopedSession) {
      setSchedulePageLoading(false);
      return;
    }
    setSchedulePageLoading(true);
    try {
      const result = await getSchedulePage(scopedSession, {
        q: query,
        weekday: filterWeekday,
        queryFilters,
        sort,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      setSchedulePage(result);
    } catch (err: any) {
      setMessage(err.message || "Could not load schedules.");
    } finally {
      setSchedulePageLoading(false);
    }
  }

  async function loadScheduleFilterOptions() {
    if (!scopedSession) return;
    try {
      const result = await getScheduleFilterOptions(scopedSession);
      setScheduleFilterOptions(result || {});
    } catch (err: any) {
      setMessage(err.message || "Could not load schedule filter options.");
    }
  }

  useEffect(() => {
    setPage(1);
  }, [query, filterWeekday, queryFilters, sort]);

  useEffect(() => {
    void loadSchedulePage();
  }, [tenantId, query, filterWeekday, queryFilters, sort, page]);

  useEffect(() => {
    void loadScheduleFilterOptions();
  }, [tenantId]);

  // Bounce back to the list if a direct/bookmarked edit link no longer
  // resolves to a real schedule, but only once loading has finished.
  useEffect(() => {
    if (view !== "edit" || !selectedId || loading) return;
    if (!selected) router.replace("/clinic/scheduling");
  }, [view, selectedId, loading, selected, router]);

  function open(nextView: string, id = "") {
    const path =
      nextView === "create"
        ? `/clinic/scheduling/${newSegment("schedule")}`
        : nextView === "edit"
          ? `/clinic/scheduling/${encodeURIComponent(id)}/${editSegment("schedule")}`
          : "/clinic/scheduling";
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
      await loadSchedulePage();
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
      await loadSchedulePage();
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
      await loadSchedulePage();
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
    filterOptions: scheduleFilterOptions,
  });
  const pageRows = schedulePage?.items || [];
  const totalRowsCount = Number(schedulePage?.total || 0);
  const totalPages = Math.max(1, Math.ceil(totalRowsCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const columns = getScheduleColumns({
    doctors,
    branches,
    departments,
    onEdit: (id) => open("edit", id),
    onDelete: (row) => setConfirm({ row }),
  });
  return (
    <Card className="p-0">
      <BreadcrumbSlot>
        <div className="flex items-center gap-2">
          <AdaptiveResultCount
            shown={pageRows.length}
            total={totalRowsCount}
            noun="schedules"
          />
          <RefreshButton
            onRefresh={async () => {
              await reload();
              await loadSchedulePage();
              await loadScheduleFilterOptions();
            }}
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
      <div className="pb-3 rounded-lg flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
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
           <PlusCircle size={16} />
            Create Schedule
          </button>
        </div>
      </div>

      <StatusToast message={message} onClose={() => setMessage("")} />
      <div className="mt-3 overflow-x-auto max-w-[1000px] rounded-lg">
        <DataTable
          columns={columns}
          data={pageRows}
          loading={loading || schedulePageLoading}
          emptyMessage="No schedules available"
          emptyDescription="Doctor weekly consultation timings created for branches and departments will show up here."
          emptyIcon={CalendarClock}
          minBodyHeight="220px"
          className=" rounded-lg border border-slate-200 overflow-auto"
          onRowClick={(row) => open("edit", row.id)}
          sort={sort ?? undefined}
          onSortChange={setSort}
        />
      </div>

      <Pagination
        page={safePage}
        totalPages={totalPages}
        total={totalRowsCount}
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
