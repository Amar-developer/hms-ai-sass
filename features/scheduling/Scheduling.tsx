"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
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

const weekdays = [
  ["0", "Monday"],
  ["1", "Tuesday"],
  ["2", "Wednesday"],
  ["3", "Thursday"],
  ["4", "Friday"],
  ["5", "Saturday"],
  ["6", "Sunday"],
] as const;
const pageSize = 10;

function formatDisplayTime(value: any) {
  const raw = String(value || "").slice(0, 5);
  const [hourText, minuteText = "00"] = raw.split(":");
  const hour = Number(hourText);
  if (Number.isNaN(hour)) return raw || "-";
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minuteText.padStart(2, "0")} ${period}`;
}

function formatDisplayRange(start: any, end: any) {
  return `${formatDisplayTime(start)} - ${formatDisplayTime(end)}`;
}

function selectedSchedulePayloads(fd: FormData) {
  const weekdays = fd
    .getAll("weekdays")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  const fallbackWeekday = fd.get("weekday");
  const selectedWeekdays = weekdays.length
    ? weekdays
    : [Number(fallbackWeekday ?? 0)];
  const rangeCount = Number(fd.get("rangeCount") || 1);
  const ranges = Array.from(
    { length: Math.max(1, rangeCount) },
    (_, index) => ({
      start_time: fd.get(`startTime_${index}`) || fd.get("startTime"),
      end_time: fd.get(`endTime_${index}`) || fd.get("endTime"),
      is_active: fd.get(`isActive_${index}`) !== "false",
    }),
  ).filter((range) => range.start_time && range.end_time);
  return selectedWeekdays.flatMap((weekday) =>
    ranges.map((range) => ({
      branch_id: fd.get("branchId"),
      department_id: fd.get("departmentId") || null,
      weekday,
      start_time: range.start_time,
      end_time: range.end_time,
      is_active: range.is_active,
      slot_minutes: Number(fd.get("slotMinutes") || 15),
      room_name: fd.get("roomName") || null,
    })),
  );
}

function scheduleGroupKey(row: any) {
  return [
    row.practitioner_id,
    row.branch_id,
    row.department_id || "",
    row.room_name || "",
    row.slot_minutes,
  ].join("|");
}

function groupSchedules(rows: any[]) {
  const groups = new Map<string, any>();
  for (const row of rows) {
    const key = scheduleGroupKey(row);
    const existing = groups.get(key);
    if (existing) {
      existing.schedules.push(row);
      existing.updated_at = [
        existing.updated_at,
        row.updated_at,
        row.created_at,
      ]
        .filter(Boolean)
        .sort()
        .at(-1);
      existing.is_active = existing.schedules.some(
        (item: any) => item.is_active,
      );
    } else {
      groups.set(key, {
        ...row,
        id: key,
        schedules: [row],
        group_key: key,
        is_active: row.is_active,
      });
    }
  }
  return Array.from(groups.values()).map((group: any) => ({
    ...group,
    schedules: [...group.schedules].sort(
      (a: any, b: any) =>
        a.weekday - b.weekday ||
        String(a.start_time).localeCompare(String(b.start_time)),
    ),
  }));
}

export function Scheduling({ apiSession, branchId }: any) {
  const isSuperAdmin = Boolean(apiSession?.user?.is_super_admin);
  const [view, setView] = useState("list");
  const [tenants, setTenants] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState(apiSession?.tenantId || "");
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterDepartment, setFilterDepartment] = useState("all");
  const [filterWeekday, setFilterWeekday] = useState("all");
  const [filterStatus, setFilterStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<any>(null);
  const scopedSession =
    apiSession && tenantId ? { ...apiSession, tenantId } : apiSession;
  const selected = groupSchedules(rows).find(
    (row: any) => row.id === selectedId,
  );

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
      const [branchRows, departmentRows, doctorRows, scheduleRows] =
        await Promise.all([
          apiFetch(`/tenants/${nextTenantId}/branches`, session).catch(
            () => [],
          ),
          apiFetch(`/tenants/${nextTenantId}/departments`, session).catch(
            () => [],
          ),
          apiFetch("/practitioners", session),
          apiFetch(
            `/practitioners/schedules${filterStatus === "all" ? "" : `?is_active=${filterStatus === "active"}`}`,
            session,
          ),
        ]);
      setBranches(branchRows);
      setDepartments(uniqueDepartmentRows(departmentRows, filterDepartment));
      setDoctors(doctorRows);
      setRows(scheduleRows);
    } catch (err: any) {
      setMessage(err.message || "Could not load schedules.");
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
  }, [apiSession?.token, tenantId, filterStatus]);

  function open(nextView: string, id = "") {
    setSelectedId(id);
    setView(nextView);
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  }

  async function createSchedule(e: any) {
    e.preventDefault();
    if (!scopedSession) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const practitionerId = String(fd.get("practitionerId") || "");
    const schedulePayloads = selectedSchedulePayloads(fd);
    setBusy(true);
    setMessage("");
    try {
      const createdRows = await Promise.all(
        schedulePayloads.map((item) =>
          apiFetch(
            `/practitioners/${practitionerId}/schedules`,
            scopedSession,
            { method: "POST", body: JSON.stringify(item) },
          ),
        ),
      );
      setRows((previous: any[]) => [
        ...createdRows,
        ...previous.filter(
          (row: any) => !createdRows.some((item: any) => item.id === row.id),
        ),
      ]);
      form.reset();
      open("list");
      await loadData(tenantId);
      setMessage(
        `${createdRows.length} schedule ${createdRows.length === 1 ? "slot" : "slots"} created.`,
      );
    } catch (err: any) {
      setMessage(err.message || "Could not create schedule.");
    } finally {
      setBusy(false);
    }
  }

  async function updateSchedule(e: any) {
    e.preventDefault();
    if (!scopedSession || !selected) return;
    const fd = new FormData(e.currentTarget);
    const practitionerId = String(
      fd.get("practitionerId") || selected.practitioner_id || "",
    );
    const schedulePayloads = selectedSchedulePayloads(fd);
    const [firstPayload, ...extraPayloads] = schedulePayloads;
    const existingRows = selected.schedules || [selected];
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/practitioners/schedules/${existingRows[0].id}`,
        scopedSession,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...firstPayload,
            practitioner_id: practitionerId,
          }),
        },
      );
      const createdRows = await Promise.all(
        extraPayloads.map((item) =>
          apiFetch(
            `/practitioners/${practitionerId}/schedules`,
            scopedSession,
            { method: "POST", body: JSON.stringify(item) },
          ),
        ),
      );
      await Promise.all(
        existingRows
          .slice(schedulePayloads.length)
          .map((row: any) =>
            apiFetch(`/practitioners/schedules/${row.id}`, scopedSession, {
              method: "DELETE",
            }),
          ),
      );
      await Promise.all(
        existingRows
          .slice(1, schedulePayloads.length)
          .map((row: any) =>
            apiFetch(`/practitioners/schedules/${row.id}`, scopedSession, {
              method: "DELETE",
            }),
          ),
      );
      setRows((previous: any[]) => [
        updated,
        ...createdRows,
        ...previous.filter(
          (row: any) =>
            !existingRows.some((item: any) => item.id === row.id) &&
            !createdRows.some((item: any) => item.id === row.id),
        ),
      ]);
      open("list");
      await loadData(tenantId);
      setMessage(
        createdRows.length
          ? `Schedule updated and ${createdRows.length} extra ${createdRows.length === 1 ? "slot" : "slots"} created.`
          : "Schedule updated.",
      );
    } catch (err: any) {
      setMessage(err.message || "Could not update schedule.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSchedule(row: any) {
    if (!scopedSession) return;
    const rowsToDelete = row.schedules || [row];
    setBusy(true);
    setMessage("");
    try {
      await Promise.all(
        rowsToDelete.map((item: any) =>
          apiFetch(`/practitioners/schedules/${item.id}`, scopedSession, {
            method: "DELETE",
          }),
        ),
      );
      setRows((previous: any[]) =>
        previous.filter(
          (item: any) =>
            !rowsToDelete.some((deleted: any) => deleted.id === item.id),
        ),
      );
      setMessage(
        `${rowsToDelete.length} schedule ${rowsToDelete.length === 1 ? "slot" : "slots"} deleted.`,
      );
    } catch (err: any) {
      setMessage(err.message || "Could not delete schedule.");
    } finally {
      setBusy(false);
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
      const text = [doctor?.full_name, row.room_name, department?.name, row.id]
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
  const groupedRows = groupSchedules(filtered).sort(
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
          <h3 className="text-lg font-bold">
            Doctor Scheduling & Availability
          </h3>
          <p className="text-sm text-slate-500">
            Tenant-scoped weekly consultation timings mapped to doctor, branch,
            department, room, and slot duration.
          </p>
        </div>
        <button
          type="button"
          onClick={() => open("create")}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
        >
          <Plus size={16} />
          Create Schedule
        </button>
      </div>
      {message && (
        <div className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">
          {message}
        </div>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-7">
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
            placeholder="Doctor, room, department"
          />
        </Field>
        <Field label="Branch">
          <Select
            value={filterBranch}
            onChange={(e: any) => {
              setFilterBranch(e.target.value);
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
        <Field label="Department">
          <Select
            value={filterDepartment}
            onChange={(e: any) => {
              setFilterDepartment(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All departments</option>
            {departments.map((department: any) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Weekday">
          <Select
            value={filterWeekday}
            onChange={(e: any) => {
              setFilterWeekday(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All days</option>
            {weekdays.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select
            value={filterStatus}
            onChange={(e: any) => {
              setFilterStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </Select>
        </Field>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <div className="min-w-[1120px]">
          <div className="hidden grid-cols-[1.1fr_.9fr_.9fr_.8fr_.8fr_.65fr_.7fr_1.2fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 xl:grid">
            <span>Doctor</span>
            <span>Branch</span>
            <span>Department</span>
            <span>Room</span>
            <span>Timing</span>
            <span>Slots</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>
          <div className="divide-y divide-slate-200">
            {pageRows.length === 0 && (
              <Empty
                text={
                  busy
                    ? "Loading schedules..."
                    : "No schedules match your search."
                }
              />
            )}{" "}
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
          row={confirm.row}
          onClose={() => setConfirm(null)}
          onConfirm={() => deleteSchedule(confirm.row)}
        />
      )}
    </Card>
  );
}

function ScheduleForm({
  title,
  schedule,
  branches,
  departments,
  doctors,
  busy,
  onSubmit,
  back,
}: any) {
  const scheduleRows = schedule?.schedules?.length
    ? schedule.schedules
    : [schedule].filter(Boolean);
  const initialDays = Array.from(
    new Set<string>(scheduleRows.map((row: any) => String(row.weekday ?? 0))),
  );
  const initialRanges = Array.from(
    new Map(
      scheduleRows.map((row: any) => {
        const range = {
          start: String(row.start_time || "09:00").slice(0, 5),
          end: String(row.end_time || "13:00").slice(0, 5),
          isActive: row.is_active !== false,
        };
        return [`${range.start}|${range.end}|${range.isActive}`, range];
      }),
    ).values(),
  );
  const [selectedDays, setSelectedDays] = useState<string[]>(
    initialDays.length ? initialDays : [String(schedule?.weekday ?? 0)],
  );
  const [dayToAdd, setDayToAdd] = useState("");
  const [ranges, setRanges] = useState<any[]>(
    initialRanges.length
      ? initialRanges
      : [
          {
            start: String(schedule?.start_time || "09:00").slice(0, 5),
            end: String(schedule?.end_time || "13:00").slice(0, 5),
            isActive: schedule?.is_active !== false,
          },
        ],
  );
  const [selectedDoctorId, setSelectedDoctorId] = useState(
    schedule?.practitioner_id || "",
  );
  const [selectedBranchId, setSelectedBranchId] = useState(
    schedule?.branch_id || "",
  );
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(
    schedule?.department_id || "",
  );
  const applyDoctorLinks = (doctorId: string) => {
    const doctor = doctors.find((item: any) => item.id === doctorId);
    const branchIds = doctor?.branch_ids || [];
    const departmentIds = doctor?.department_ids || [];
    setSelectedBranchId((current) =>
      current && branchIds.includes(current) ? current : branchIds[0] || "",
    );
    setSelectedDepartmentId((current) =>
      current && departmentIds.includes(current)
        ? current
        : departmentIds[0] || "",
    );
  };
  useEffect(() => {
    if (selectedDoctorId) applyDoctorLinks(selectedDoctorId);
  }, [selectedDoctorId, doctors.length]);
  const addDay = (value: string) => {
    if (value && !selectedDays.includes(value))
      setSelectedDays((current) => [...current, value]);
    setDayToAdd("");
  };
  const removeDay = (value: string) =>
    setSelectedDays((current) =>
      current.length > 1 ? current.filter((item) => item !== value) : current,
    );
  const updateRange = (index: number, key: string, value: any) =>
    setRanges((current) =>
      current.map((range, itemIndex) =>
        itemIndex === index ? { ...range, [key]: value } : range,
      ),
    );
  const addRange = () =>
    setRanges((current) => [
      ...current,
      { start: "17:00", end: "19:00", isActive: true },
    ]);
  const removeRange = (index: number) =>
    setRanges((current) =>
      current.length > 1
        ? current.filter((_, itemIndex) => itemIndex !== index)
        : current,
    );
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-bold">{title}</h3>
          <p className="text-sm text-slate-500">
            {schedule?.id || "Create weekly consultation timing for a doctor."}
          </p>
        </div>
        <button
          type="button"
          onClick={back}
          className="rounded-2xl border px-4 py-3 text-sm font-bold"
        >
          Back to Schedules
        </button>
      </div>
      <form
        onSubmit={onSubmit}
        className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <Field label="Doctor">
          <input type="hidden" name="practitionerId" value={selectedDoctorId} />
          <PractitionerPicker
            doctors={doctors}
            value={selectedDoctorId}
            onChange={(doctorId: string) => {
              setSelectedDoctorId(doctorId);
              applyDoctorLinks(doctorId);
            }}
          />
        </Field>
        <Field label="Branch">
          <Select
            name="branchId"
            value={selectedBranchId}
            onChange={(event: any) => setSelectedBranchId(event.target.value)}
            required
          >
            <option value="">Select branch</option>
            {branches.map((branch: any) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Department">
          <Select
            name="departmentId"
            value={selectedDepartmentId}
            onChange={(event: any) =>
              setSelectedDepartmentId(event.target.value)
            }
          >
            <option value="">All departments</option>
            {departments.map((department: any) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="md:col-span-2 xl:col-span-3">
          <input type="hidden" name="weekday" value={selectedDays[0]} />
          {selectedDays.map((value) => (
            <input key={value} type="hidden" name="weekdays" value={value} />
          ))}
          <div className="grid gap-3 md:grid-cols-[260px_1fr] md:items-end">
            <Field label="Add Weekday">
              <Select
                value={dayToAdd}
                onChange={(event: any) => addDay(event.target.value)}
              >
                <option value="">Select day</option>
                {weekdays
                  .filter(([value]) => !selectedDays.includes(value))
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </Select>
            </Field>
            <div className="flex min-h-[50px] flex-wrap items-center gap-2">
              {selectedDays.map((value) => {
                const label =
                  weekdays.find(([day]) => day === value)?.[1] || value;
                return (
                  <span
                    key={value}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800"
                  >
                    {label}
                    <button
                      type="button"
                      onClick={() => removeDay(value)}
                      className="rounded-full p-1 text-slate-500 hover:bg-white hover:text-red-600"
                      aria-label={`Remove ${label}`}
                    >
                      <X size={14} />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
        <div className="md:col-span-2 xl:col-span-3">
          <input type="hidden" name="rangeCount" value={ranges.length} />
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Time Ranges
            </p>
            <button
              type="button"
              onClick={addRange}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold"
            >
              <Plus size={14} />
              Add Range
            </button>
          </div>
          <div className="grid gap-3">
            {ranges.map((range, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-[1fr_1fr_180px_auto] md:items-end"
              >
                <Field label={`Start Time ${index + 1}`}>
                  <Input
                    name={`startTime_${index}`}
                    type="time"
                    value={range.start}
                    onChange={(event: any) =>
                      updateRange(index, "start", event.target.value)
                    }
                    required
                  />
                </Field>
                <Field label={`End Time ${index + 1}`}>
                  <Input
                    name={`endTime_${index}`}
                    type="time"
                    value={range.end}
                    onChange={(event: any) =>
                      updateRange(index, "end", event.target.value)
                    }
                    required
                  />
                </Field>
                <Field label={`Status ${index + 1}`}>
                  <Select
                    name={`isActive_${index}`}
                    value={String(range.isActive)}
                    onChange={(event: any) =>
                      updateRange(
                        index,
                        "isActive",
                        event.target.value === "true",
                      )
                    }
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </Select>
                </Field>
                <button
                  type="button"
                  onClick={() => removeRange(index)}
                  disabled={ranges.length === 1}
                  className="inline-flex h-[46px] items-center justify-center rounded-xl border bg-white px-3 text-sm font-bold text-slate-700 disabled:text-slate-300"
                  aria-label="Remove time range"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <Field label="Slot Minutes">
          <Input
            name="slotMinutes"
            type="number"
            min="1"
            max="240"
            defaultValue={schedule?.slot_minutes || 15}
          />
        </Field>
        <Field label="Room Name">
          <Input
            name="roomName"
            defaultValue={schedule?.room_name || ""}
            placeholder="Room 1"
          />
        </Field>
        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3">
          <Button disabled={busy}>
            {busy
              ? "Saving..."
              : schedule
                ? "Save Schedule"
                : "Create Schedule"}
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

function ScheduleRow({
  row,
  branches,
  departments,
  doctors,
  onEdit,
  onDelete,
}: any) {
  const doctor = doctors.find((item: any) => item.id === row.practitioner_id);
  const branch = branches.find((item: any) => item.id === row.branch_id);
  const department = departments.find(
    (item: any) => item.id === row.department_id,
  );
  const scheduleRows = row.schedules || [row];
  const activeCount = scheduleRows.filter((item: any) => item.is_active).length;
  const statusLabel =
    activeCount === scheduleRows.length
      ? "Active"
      : activeCount === 0
        ? "Inactive"
        : "Mixed";
  const statusTone =
    activeCount === scheduleRows.length
      ? "green"
      : activeCount === 0
        ? "red"
        : "amber";
  const firstSchedule = scheduleRows[0];
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
      className="grid cursor-pointer gap-3 px-4 py-4 text-sm transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none xl:grid-cols-[1.1fr_.9fr_.9fr_.8fr_.8fr_.65fr_.7fr_1.2fr] xl:items-center"
    >
      <div>
        <b>{doctor?.full_name || row.practitioner_id}</b>
        <p className="break-all text-xs text-slate-500">
          {scheduleRows.length} schedule{" "}
          {scheduleRows.length === 1 ? "slot" : "slots"}
        </p>
      </div>
      <span>{branch?.name || row.branch_id}</span>
      <span>{department?.name || "All departments"}</span>
      <span>{row.room_name || "No room"}</span>
      <span>
        {formatDisplayRange(firstSchedule.start_time, firstSchedule.end_time)}
      </span>
      <span>{row.slot_minutes} min</span>
      <Badge tone={statusTone as any}>{statusLabel}</Badge>
      <ActionGroup>
        <ActionButton onClick={stop(onEdit)}>Edit</ActionButton>
        <ActionButton tone="danger" onClick={stop(onDelete)}>
          Delete
        </ActionButton>
      </ActionGroup>
    </div>
  );
}

function formatPractitionerType(value: any) {
  return String(value || "doctor")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function PractitionerPicker({ doctors, value, onChange }: any) {
  const selected = doctors.find((doctor: any) => doctor.id === value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const search = query.trim().toLowerCase();
  const rows = [...doctors]
    .sort((a: any, b: any) =>
      String(a.full_name || "").localeCompare(String(b.full_name || "")),
    )
    .filter((doctor: any) => {
      if (!search) return true;
      return [
        doctor.full_name,
        doctor.primary_specialty,
        doctor.practitioner_type,
        doctor.registration_number,
        ...(doctor.branch_ids || []),
        ...(doctor.department_ids || []),
      ]
        .filter(Boolean)
        .some((item) => String(item).toLowerCase().includes(search));
    });
  return (
    <div className="relative">
      <Input
        value={open ? query : selected?.full_name || ""}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(event: any) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event: any) => {
          if (event.key === "Enter") event.preventDefault();
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder="Type doctor or physiotherapist"
        required={!value}
      />
      {open && (
        <div className="absolute z-40 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl">
          {rows.length === 0 && (
            <div className="px-3 py-3 text-sm text-slate-500">
              No practitioner found.
            </div>
          )}
          {rows.map((doctor: any) => (
            <button
              key={doctor.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(doctor.id);
                setQuery("");
                setOpen(false);
              }}
              className={`w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                doctor.id === value
                  ? "bg-slate-900 text-white hover:bg-slate-900"
                  : ""
              }`}
            >
              <b>{doctor.full_name}</b>
              <span
                className={`ml-2 text-xs ${
                  doctor.id === value ? "text-slate-200" : "text-slate-500"
                }`}
              >
                {formatPractitionerType(doctor.practitioner_type)}
              </span>
              {doctor.primary_specialty && (
                <p
                  className={`text-xs ${
                    doctor.id === value ? "text-slate-200" : "text-slate-500"
                  }`}
                >
                  {doctor.primary_specialty}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ text }: any) {
  return (
    <div className="px-4 py-8 text-center text-sm text-slate-500">{text}</div>
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
function ConfirmModal({ row, busy, onClose, onConfirm }: any) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-md">
        <h3 className="text-lg font-bold">Delete Schedule</h3>
        <p className="mt-2 text-sm text-slate-600">
          This will permanently delete this schedule row. Existing appointments
          remain unchanged.
        </p>
        <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-bold">
          {formatDisplayRange(row.start_time, row.end_time)}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? "Working..." : "Confirm Delete"}
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
