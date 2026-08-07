// features/admin/schedules/scheduleColumns.tsx  (adjust path to match your structure)

import { publicDisplayValue } from "@/lib/options";
import { formatDisplayRange, formatWeekdaysLabel } from "./helpers";
import { Badge } from "@/app/components/common/ui";
import { RowActions } from "@/features/admin/components/RowActions";

type GetScheduleColumnsParams = {
  doctors: any[];
  branches: any[];
  departments: any[];
  onEdit: (id: string) => void;
  onDelete: (row: any) => void;
};

export function getScheduleColumns({
  doctors,
  branches,
  departments,
  onEdit,
  onDelete,
}: GetScheduleColumnsParams) {
  return [
    {
      key: "doctor",
      header: "Doctor",
      width: "130px",
      render: (row: any) => {
        const doctor = doctors.find(
          (item: any) => item.id === row.practitioner_id,
        );
        return (
          <b className="text-sm">
            {row.practitioner_full_name ||
              doctor?.full_name ||
              publicDisplayValue(row.practitioner_id, "Doctor")}
          </b>
        );
      },
    },
    {
      key: "branch",
      header: "Branch",
      width: "180px",
      render: (row: any) => {
        const branch = branches.find((item: any) => item.id === row.branch_id);
        return (
          <span className="text-sm">
            {row.branch_name ||
              branch?.name ||
              publicDisplayValue(row.branch_id, "Assigned branch")}
          </span>
        );
      },
    },
    {
      key: "department",
      header: "Department",
      width: "160px",
      render: (row: any) => {
        const department = departments.find(
          (item: any) => item.id === row.department_id,
        );
        return (
          <span className="text-sm">
            {row.department_name || department?.name || "All Departments"}
          </span>
        );
      },
    },
    {
      key: "days",
      header: "Days",
      width: "130px",
      render: (row: any) => (
        <span className="text-sm">
          {formatWeekdaysLabel(row.mode, row.weekdays)}
        </span>
      ),
    },
    {
      key: "timing",
      header: "Timing",
      width: "160px",
      render: (row: any) => (
        <span className="text-sm">
          {formatDisplayRange(row.start_time, row.end_time)}
        </span>
      ),
    },
    {
      key: "slot",
      header: "Slot",
      width: "100px",
      render: (row: any) => (
        <span className="text-sm">{row.slot_minutes} min</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "100px",
      className: "text-center",
      cellClassName: "text-center",
      render: (row: any) => (
        <Badge
          tone={row.is_active ? "green" : "red"}
          className="table-status text-sm"
        >
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "100px",
      className: "text-center",
      cellClassName: "text-center",
      disableRowClick: true,
      render: (row: any) => (
        <div className="flex justify-center">
          <RowActions
            actions={[
              {
                label: "Edit",
                onClick: () => onEdit(row.id),
              },
              {
                label: "Delete",
                onClick: () => onDelete(row),
                danger: true,
              },
            ]}
          />
        </div>
      ),
    },
  ];
}
