import { humanizeOptionLabel } from "@/lib/options";
import { PatientFlagBadges } from "../patients/components/PatientFlagBadges";
import { Badge } from "@/app/components/common/ui";
import { isStatus } from "./helpers";
import { RowActions } from "../admin/components/RowActions";

type TokenQueueGetColumnsProps = {
  openConsultation: (appointment: any) => void;
  patientMap: Map<string, any>;
  transition: (appointment: any, action: string) => void;
  busyId: string | null;
  openPatient: (appointment: any) => void;
};

export function getTokenQueueColumns({
  openConsultation,
  patientMap,
  transition,
  busyId,
  openPatient,
}: TokenQueueGetColumnsProps) {
  return [
        {
          key: "token",
          header: "Token",
          width: "130px",
          render: (appointment: any) => (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openConsultation(appointment);
              }}
              className="rounded-lg border px-3 py-2 text-xs font-bold hover:bg-slate-50"
            >
              {appointment.token}
            </button>
          ),
          cellClassName: "font-bold",
          disableRowClick: true,
        },

        {
          key: "patient",
          header: "Patient",
          width: "150px",
          render: (appointment: any) => (
            <div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openConsultation(appointment);
                }}
                className="text-left text-xs font-semibold hover:underline"
              >
                {appointment.patient}
              </button>
              <PatientFlagBadges
                patient={patientMap.get(
                  String(appointment.patientId || appointment.patient_id),
                )}
                className="mt-1"
              />
            </div>
          ),
          disableRowClick: true,
        },

        {
          key: "doctor",
          header: "Doctor",
          width: "150px",
          render: (appointment: any) => (
            <span className="text-xs">{appointment.doctor}</span>
          ),
        },

        {
          key: "status",
          header: "Status",
          width: "150px",
          className: "text-center",
          cellClassName: "text-center",
          render: (appointment: any) => (
            <Badge className="normal-badge">
              {humanizeOptionLabel(appointment.status)}
            </Badge>
          ),
        },

        {
          key: "queueStatus",
          header: "Queue",
          width: "150px",
          className: "text-center",
          cellClassName: "text-center",
          render: (appointment: any) => (
            <Badge
              tone={appointment.tokenType === "Emergency" ? "red" : "slate"}
              className="normal-badge"
            >
              {humanizeOptionLabel(appointment.queueStatus)}
            </Badge>
          ),
        },

        {
          key: "actions",
          header: "Actions",
          width: "100px",
          className: "text-center",
          disableRowClick: true,

          render: (appointment: any) => (
            <RowActions
              width="w-24"
              className="right-20 -bottom-7"
              actions={[
                {
                  label: "Details",
                  onClick: () => openConsultation(appointment),
                },
                {
                  label: "Patient",
                  onClick: () => openPatient(appointment),
                },
                {
                  label: "Call",
                  disabled:
                    busyId === appointment.id ||
                    isStatus(appointment, "in_consultation"),
                  onClick: () => transition(appointment, "call"),
                },

                {
                  label: "Skip",
                  disabled:
                    busyId === appointment.id || isStatus(appointment, "skipped"),
                  onClick: () => transition(appointment, "skip"),
                },

                {
                  label: "Requeue",
                  disabled:
                    busyId === appointment.id || isStatus(appointment, "requeued"),
                  onClick: () => transition(appointment, "requeue"),
                },

                {
                  label: "Cancel",
                  danger: true,
                  disabled:
                    busyId === appointment.id || isStatus(appointment, "cancelled"),
                  onClick: () => transition(appointment, "cancel"),
                },
              ]}
            />
          ),
        },
      ];
}
