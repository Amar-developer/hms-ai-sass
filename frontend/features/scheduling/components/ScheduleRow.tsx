import { publicDisplayValue } from "@/lib/options";
import { formatDisplayRange } from "../helpers";
import { Badge,ActionButton, ActionGroup } from "@/app/components/common/ui";

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
  const nameSource = scheduleRows[0] || row;
  // Prefer the name the API now sends on the row itself, then the resolved
  // lookup, and only ever fall back to a clean label — never a raw id/slug.
  const doctorName =
    nameSource.practitioner_full_name ||
    row.practitioner_full_name ||
    doctor?.full_name ||
    publicDisplayValue(row.practitioner_id, "Doctor");
  const branchName =
    nameSource.branch_name ||
    row.branch_name ||
    branch?.name ||
    publicDisplayValue(row.branch_id, "Assigned branch");
  const departmentName =
    nameSource.department_name ||
    row.department_name ||
    department?.name ||
    "All Departments";
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
        <b className="text-sm">{doctorName}</b>
        <p className="break-all text-sm text-slate-500">
          {scheduleRows.length} schedule{" "}
          {scheduleRows.length === 1 ? "slot" : "slots"}
        </p>
      </div>
      <span className="text-sm">{branchName}</span>
      <span className="text-sm">{departmentName}</span>
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
