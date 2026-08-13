import { Badge } from "@/app/components/common/ui";
import { CopyIdButton } from "@/app/components/common/CopyIdButton";
import { RowActions } from "@/features/admin/components/RowActions";
import { publicDisplayValue } from "@/lib/options";
import { displayDate } from "@/utils/helper";
import type { Column } from "@/utils/types";
import { appointmentStatusInfo, formatDisplayTime } from "./helpers";
import { PatientFlagBadges } from "@/features/patients/components/PatientFlagBadges";

export function getAppointmentColumns({
  canCopyIds,
  patientMap,
  departmentOptions,
  canRescheduleAppointments,
  openReschedule,
  openPatient,
  printTokenSlipForRow,
}: {
  canCopyIds: boolean;
  patientMap: Map<string, any>;
  departmentOptions: any[];
  canRescheduleAppointments: boolean;
  openReschedule: (appointment: any) => void;
  openPatient: (appointment: any) => void;
  printTokenSlipForRow: (appointment: any) => void;
}): Column<any>[] {
  return [
    {
      key: "patient",
      header: "Patient",
      width:'160px',
      render: (appointment: any) => (
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold break-all">
              {appointment.patient}
            </p>
            <CopyIdButton
              value={appointment.id}
              label="Appointment ID"
              allowed={canCopyIds}
            />
          </div>
          <PatientFlagBadges
            patient={patientMap.get(appointment.patientId)}
            className="mt-1"
          />
        </div>
      ),
    },
    {
      key: "token",
      header: "Token",
      width:'80px',
      render: (appointment: any) => (
        <p className="text-sm text-slate-500">
          {appointment.token || publicDisplayValue(appointment.id, "-")}
        </p>
      ),
    },
    {
      key: "mobile",
      header: "Mobile",
      width:'120px',
      render: (appointment: any) => (
        <span className="text-sm">
          {patientMap.get(appointment.patientId)?.mobile || "-"}
        </span>
      ),
    },
    {
      key: "department",
      header: "Department",
      width:'160px',
      render: (appointment: any) => (
        <span className="text-sm">
          {departmentOptions.find(
            (d: any) => d.id === appointment.departmentId,
          )?.name || publicDisplayValue(appointment.departmentId)}
        </span>
      ),
    },
    {
      key: "doctor",
      header: "Doctor",
      width:'140px',
      render: (appointment: any) => (
        <span className="text-sm">
          {appointment.doctor ||
            publicDisplayValue(appointment.doctorId, "Doctor")}
        </span>
      ),
    },
    {
      key: "date",
      header: "Date",
      width:"180px",
      render: (appointment: any) => (
        <span className="text-sm">
          {appointment.appointmentDate || "-"}
          {appointment.appointmentTime || appointment.appointment_time
            ? ` ${formatDisplayTime(
                appointment.appointmentTime || appointment.appointment_time,
              )}`
            : ""}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "text-center",
      width:'140px',
      cellClassName: "text-center",
      render: (appointment: any) => (
        <Badge
          tone={appointmentStatusInfo(appointment).tone}
          className="normal-badge text-xs"
        >
          {appointmentStatusInfo(appointment).label}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      width:'100px',
      cellClassName: "text-right",
      disableRowClick: true,
      render: (appointment: any) => (
        <div className="flex items-center justify-end">
          <RowActions
            actions={[
              {
                label: "Reschedule",
                onClick: () => openReschedule(appointment),
                hidden:
                  !canRescheduleAppointments ||
                  appointmentStatusInfo(appointment).key !== "active" ||
                  [
                    appointment.status,
                    appointment.queueStatus,
                    appointment.consultationStatus,
                  ]
                    .map((value) => String(value || "").trim().toLowerCase())
                    .includes("in_consultation"),
              },
              {
                label: "Patient Details",
                onClick: () => openPatient(appointment),
              },
              {
                label: "Print Token",
                onClick: () => printTokenSlipForRow(appointment),
              },
            ]}
            className="right-8 -bottom-5"
            width="w-36"
          />
        </div>
      ),
    },
  ];
}

export function getPlatformColumns({
  canCopyIds,
}: {
  canCopyIds: boolean;
}): Column<any>[] {
  return [
    {
      key: "tenant",
      header: "Tenant",
      render: (row: any) => (
        <div>
          <b className="table-data">{row.tenant_name}</b>
          <p className="text-sm lg:text-xs text-slate-500">
            {row.branch_name}
          </p>
        </div>
      ),
    },
    {
      key: "patient",
      header: "Patient",
      render: (row: any) => (
        <div className="flex items-center gap-2">
          <b className="table-data">{row.patient_name}</b>
          <CopyIdButton
            value={row.id}
            label="Appointment ID"
            allowed={canCopyIds}
          />
        </div>
      ),
    },
    {
      key: "token",
      header: "Token",
      render: (row: any) => (
        <p className="text-xs text-slate-500">{row.token_number || "-"}</p>
      ),
    },
    {
      key: "mobile",
      header: "Mobile",
      render: (row: any) => (
        <span className="table-data">{row.patient_mobile || "-"}</span>
      ),
    },
    {
      key: "department",
      header: "Department",
      render: (row: any) => (
        <span className="table-data">{row.department_name || "-"}</span>
      ),
    },
    {
      key: "doctor",
      header: "Doctor",
      render: (row: any) => (
        <span className="table-data">{row.practitioner_name || "-"}</span>
      ),
    },
    {
      key: "date",
      header: "Date",
      render: (row: any) => (
        <span className="table-data">
          {displayDate(row.appointment_date)}
          {row.appointment_time
            ? ` ${formatDisplayTime(row.appointment_time)}`
            : ""}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "text-center",
      cellClassName: "text-center",
      render: (row: any) => (
        <Badge tone={appointmentStatusInfo(row).tone} className="normal-badge">
          {appointmentStatusInfo(row).label}
        </Badge>
      ),
    },
  ];
}
