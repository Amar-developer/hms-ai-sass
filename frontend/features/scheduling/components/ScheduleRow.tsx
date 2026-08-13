import { publicDisplayValue } from "@/lib/options";
import { formatDisplayRange, formatWeekdaysLabel } from "../helpers";
import { Badge } from "@/app/components/common/ui";
import { RowActions } from "@/features/admin/components/RowActions";

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
  const doctorName =
    row.practitioner_full_name ||
    doctor?.full_name ||
    publicDisplayValue(row.practitioner_id, "Doctor");
  const branchName =
    row.branch_name ||
    branch?.name ||
    publicDisplayValue(row.branch_id, "Assigned branch");
  const departmentName = row.department_name || department?.name || "All Departments";

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
      className="grid cursor-pointer gap-3 px-4 py-4 text-sm transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none md:grid-cols-[1.1fr_.9fr_.9fr_.9fr_.8fr_.65fr_.7fr_.7fr] md:items-center"
    >
      <b className="text-sm">{doctorName}</b>
      <span className="text-sm">{branchName}</span>
      <span className="text-sm">{departmentName}</span>
      <span className="text-sm">{formatWeekdaysLabel(row.mode, row.weekdays)}</span>
      <span className="text-sm">
        {formatDisplayRange(row.start_time, row.end_time)}
      </span>
      <span className="text-sm">{row.slot_minutes} min</span>
      <Badge tone={row.is_active ? "green" : "red"} className="normal-badge text-sm">
        {row.is_active ? "Active" : "Inactive"}
      </Badge>
      <div className="flex justify-center">
        <RowActions
          actions={[
            {
              label: "Edit",
              onClick: onEdit,
            },
            {
              label: "Delete",
              onClick: onDelete,
              danger: true,
            },
          ]}
        />
      </div>
    </div>
  );
}
