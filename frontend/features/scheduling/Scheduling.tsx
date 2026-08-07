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
import { status_options } from "../superAdmin/constants";
import {
  type FilterConfig,
  FilterSection,
} from "@/app/components/common/FilterSection";
import { DataTable } from "@/app/components/common/DataTable";
import { getScheduleColumns } from "./column";

export function Scheduling({
  apiSession,
  branchId,
  view = "list",
  selectedId = "",
}: any) {
  const router = useRouter();
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
  const [query, setQuery] = useState("");
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterWeekday, setFilterWeekday] = useState("all");
  const [filterStatus, setFilterStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<any>(null);

  const scopedSession =
    apiSession && tenantId ? { ...apiSession, tenantId } : apiSession;

  // One row is one editable schedule now — no more client-side grouping.
  const selected = rows.find((row: any) => row.id === selectedId);

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

  const filteredRows = rows
    .filter((row: any) => {
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
        (filterBranch === "all" || row.branch_id === filterBranch) &&
        (filterDepartment === "all" ||
          row.department_id === filterDepartment) &&
        (filterWeekday === "all" ||
          (row.weekdays || []).includes(Number(filterWeekday))) &&
        (filterStatus === "all" ||
          (filterStatus === "active" ? row.is_active : !row.is_active))
      );
    })
    .sort(
      (a: any, b: any) =>
        new Date(b.updated_at || b.created_at).getTime() -
        new Date(a.updated_at || a.created_at).getTime(),
    );

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const scheduleFilters: FilterConfig[] = [
    {
      key: "branch",
      label: "Branch",
      options: [
        { value: "All", label: "All Branches" },
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
        { value: "All", label: "All Departments" },
        ...departments.map((department: any) => ({
          value: department.id,
          label: department.name,
        })),
      ],
    },
    {
      key: "weekday",
      label: "Weekday",
      options: [
        { value: "all", label: "All days" },
        ...weekdays.map(([value, label]) => ({
          value,
          label,
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
    branch: filterBranch,
    department: filterDepartment,
    weekday: filterWeekday,
    status: filterStatus,
  };

  const handleChange = (key: string, value: string) => {
    if (key == "branch") {
      setFilterBranch(value);
    }
    if (key == "department") {
      setFilterDepartment(value);
    }
    if (key == "status") {
      setFilterStatus(value);
    }
    if (key == "weekday") {
      setFilterWeekday(value);
    }
    setPage(1);
  };

  const handleReset = () => {
    setFilterBranch("all");
    setFilterDepartment("all");
    setQuery("");
    setFilterStatus("active");
    setFilterWeekday("all");
  };
  const columns = getScheduleColumns({
    doctors,
    branches,
    departments,
    onEdit: (id) => open("edit", id),
    onDelete: (row) => setConfirm({ row }),
  });
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
      <FilterSection
        query={query}
        setQuery={setQuery}
        filters={scheduleFilters}
        filterValues={filterValues}
        onFilterChange={handleChange}
        onReset={handleReset}
        title="Search"
        searchPlaceholder="Search"
        className="lg:grid-cols-6"
      />
      <div className="mt-3 overflow-x-auto max-w-[1000px]">
        <DataTable
          columns={columns}
          data={pageRows}
          loading={loading}
          emptyMessage="No schedules available"
          className=" rounded-2xl border border-slate-200 overflow-auto"
          onRowClick={(row) => open("edit", row.id)}
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
