import { Input,Card,Button,Badge,ActionGroup,ActionButton } from "@/app/components/common/ui";
import { publicDisplayValue } from "@/lib/options";
import { formatDisplayRange, formatPractitionerType } from "@/utils/schedule/helpers";
import { useState } from "react";



export function ScheduleRow({
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
      className="grid cursor-pointer gap-3 px-4 py-4 text-sm transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none md:grid-cols-[1.1fr_.9fr_.9fr_.8fr_.8fr_.65fr_.7fr_1.2fr] md:items-center"
    >
      <div>
        <b className="text-sm">{doctor?.full_name || publicDisplayValue(row.practitioner_id, "Doctor")}</b>
        <p className="break-all text-sm text-slate-500">
          {scheduleRows.length} schedule{" "}
          {scheduleRows.length === 1 ? "slot" : "slots"}
        </p>
      </div>
      <span className="text-sm">{branch?.name || publicDisplayValue(row.branch_id, "Assigned branch")}</span>
      <span className="text-sm">{department?.name || "All Departments"}</span>
      <span className="text-sm">{row.room_number ? row.room_number.padStart(3, "0") : "-"}</span>
      <span className="text-sm">
        {formatDisplayRange(firstSchedule.start_time, firstSchedule.end_time)}
      </span>
      <span className="text-sm">{row.slot_minutes} min</span>
      <Badge tone={statusTone as any} className="table-status text-sm">{statusLabel}</Badge>
      <ActionGroup className="justify-end">
        <ActionButton onClick={stop(onEdit)}>Edit</ActionButton>
        <ActionButton tone="danger" onClick={stop(onDelete)}>
          Delete
        </ActionButton>
      </ActionGroup>
    </div>
  );
}


export function PractitionerPicker({ doctors, value, onChange }: any) {
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
        className=' placeholder:text-xs search-input'
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
              className={`w-full rounded-xl px-3 py-2 text-left text-xs hover:bg-slate-50 ${
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

export function Empty({ text }: any) {
  return (
    <div className="px-4 py-8 text-center text-xs lg:text-sm text-slate-500">{text}</div>
  );
}
export function Pagination({ page, totalPages, total, onPage }: any) {
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
export function ConfirmModal({ row, busy, onClose, onConfirm }: any) {
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
            className="rounded-lg border text-xs lg:text-sm py-2 px-2 lg:py-3 lg:px-4 font-bold"
          >
            Cancel
          </button>
        </div>
      </Card>
    </div>
  );
}
