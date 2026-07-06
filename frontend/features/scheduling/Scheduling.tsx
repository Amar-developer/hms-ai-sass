"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { FormField } from "@/app/components/FormElements";
import {
  ActionButton,
  ActionGroup,
  Badge,
  Button,
  Card,
  Field,
  Input,
  RefreshButton,
  SearchableSelect,
  Select,
  StatusToast,
} from "@/app/components/common/ui";
import { apiFetch } from "@/lib/api";
import { uniqueDepartmentRows } from "@/lib/options";
import {
  activeTenantOptions,
  groupSchedules,
  selectedSchedulePayloads,
} from "@/utils/schedule/helpers";
import { ScheduleForm } from "@/app/components/schedule/Forms";
import { pageSize, weekdays } from "@/utils/schedule/constants";
import { ConfirmModal, Empty, ScheduleRow } from "./Shared";
import { Pagination } from "@/app/components/common/Pagination";

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
      const [branchRows, departmentRows, doctorRows, scheduleRows] =
        await Promise.all([
          apiFetch(`/tenants/${nextTenantId}/branches`, session).catch(
            () => [],
          ),
          apiFetch(`/tenants/${nextTenantId}/departments`, session).catch(
            () => [],
          ),
          apiFetch("/practitioners", session),
          apiFetch("/practitioners/schedules", session),
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

  async function createSchedule(e: any) {
    e.preventDefault();
    if (!scopedSession) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const practitionerId = String(fd.get("practitionerId") || "");
    const doctorBranchIds =
      doctors.find((item: any) => item.id === practitionerId)?.branch_ids || [];
    const doctorDepartmentIds =
      doctors.find((item: any) => item.id === practitionerId)?.department_ids ||
      [];
    const schedulePayloads = selectedSchedulePayloads(fd, doctorBranchIds);
    if (!practitionerId || schedulePayloads.length === 0) {
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
    const doctorBranchIds =
      doctors.find((item: any) => item.id === practitionerId)?.branch_ids || [];
    const doctorDepartmentIds =
      doctors.find((item: any) => item.id === practitionerId)?.department_ids ||
      [];
    const schedulePayloads = selectedSchedulePayloads(fd, doctorBranchIds);
    if (
      schedulePayloads.length === 0 ||
      schedulePayloads.some(
        (item) =>
          !item.department_id ||
          !doctorDepartmentIds.includes(String(item.department_id)),
      )
    ) {
      setMessage("Select a medical department mapped to this doctor.");
      return;
    }
    const [firstPayload, ...extraPayloads] = schedulePayloads;
    // Only reuse active rows. Soft-deleted (is_active=false) rows are ghosts:
    // patching or counting them resurfaces removed ranges in the editor.
    const existingRows = (selected.schedules || [selected]).filter(
      (row: any) => row && row.is_active !== false,
    );
    setBusy(true);
    setMessage("");
    try {
      const updated = existingRows[0]
        ? await apiFetch(
            `/practitioners/schedules/${existingRows[0].id}`,
            scopedSession,
            {
              method: "PATCH",
              body: JSON.stringify({
                ...firstPayload,
                practitioner_id: practitionerId,
              }),
            },
          )
        : await apiFetch(
            `/practitioners/${practitionerId}/schedules`,
            scopedSession,
            {
              method: "POST",
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
      // Remove every other active row we just replaced.
      await Promise.all(
        existingRows.slice(1).map((row: any) =>
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
          <RefreshButton onRefresh={() => loadData(tenantId)} />
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
            className='search-input'
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
          <div className="md:grid grid-cols-[1.1fr_.9fr_.9fr_.8fr_.8fr_.65fr_.7fr_1.2fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 ">
            <span>Doctor</span>
            <span>Branch</span>
            <span>Department</span>
            <span>Room No.</span>
            <span>Timing</span>
            <span>Slots</span>
            <span className="text-center">Status</span>
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
