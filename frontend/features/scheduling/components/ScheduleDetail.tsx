import React from "react";
import { Badge, Card } from "@/app/components/common/ui";
import { publicDisplayValue } from "@/lib/options";
import {
  formatDisplayRange,
  formatPractitionerType,
  formatWeekdaysLabel,
} from "../helpers";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-slate-700">{value || "-"}</p>
    </div>
  );
}

export function ScheduleDetail({
  schedule,
  doctors,
  branches,
  departments,
  canEdit,
  onEdit,
  back,
}: any) {
  const doctor = doctors.find((item: any) => item.id === schedule.practitioner_id);
  const branch = branches.find((item: any) => item.id === schedule.branch_id);
  const department = departments.find(
    (item: any) => item.id === schedule.department_id,
  );

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="card-title font-bold">Schedule Details</h3>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="primary-action px-4 py-2 text-xs"
            >
              Edit
            </button>
          )}
          <button type="button" onClick={back} className="close-button font-bold">
            Back to Scheduling
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field
          label="Doctor"
          value={
            schedule.practitioner_full_name ||
            doctor?.full_name ||
            publicDisplayValue(schedule.practitioner_id, "Doctor")
          }
        />
        <Field
          label="Doctor Type"
          value={formatPractitionerType(doctor?.practitioner_type)}
        />
        <Field
          label="Branch"
          value={
            schedule.branch_name ||
            branch?.name ||
            publicDisplayValue(schedule.branch_id, "Assigned branch")
          }
        />
        <Field
          label="Department"
          value={schedule.department_name || department?.name || "All Departments"}
        />
        <Field
          label="Days"
          value={formatWeekdaysLabel(schedule.mode, schedule.weekdays)}
        />
        <Field
          label="Timing"
          value={formatDisplayRange(schedule.start_time, schedule.end_time)}
        />
        <Field label="Slot Duration" value={`${schedule.slot_minutes} min`} />
        <Field
          label="Status"
          value={
            <Badge tone={schedule.is_active ? "green" : "red"} className="normal-badge w-[50%]" >
              {schedule.is_active ? "Active" : "Inactive"}
            </Badge>
          }
        />
      </div>
    </Card>
  );
}
