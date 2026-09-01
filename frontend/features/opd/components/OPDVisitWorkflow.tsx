"use client";

import { Check, Circle, UserRound } from "lucide-react";

import { Badge } from "@/app/components/common/ui";
import { PatientFlagBadges } from "@/features/patients/components/PatientFlagBadges";
import { displayPatientGender } from "@/features/patients/helpers";
import { humanizeOptionLabel } from "@/lib/options";
import { isCancelledAppointment, isCompletedAppointment, statusKey } from "@/features/consulation/helpers";

export const visitWorkflowSteps = [
  "Booked",
  "Checked In",
  "Called",
  "Consultation",
  "Complete",
] as const;

export function opdVisitWorkflowIndex(visit: any) {
  if (!visit) return -1;
  if (isCompletedAppointment(visit)) return 4;
  const consultation = statusKey(
    visit.consultationStatus || visit.consultation_status,
  );
  const queue = statusKey(
    visit.queueStatus || visit.queue_status || visit.status,
  );
  if (
    ["draft", "in_progress"].includes(consultation) ||
    queue === "in_consultation"
  )
    return 3;
  if (queue === "called") return 2;
  if (
    [
      "checked_in",
      "waiting",
      "in_queue",
      "requeued",
      "emergency_queue",
      "patient_not_available",
    ].includes(queue)
  )
    return 1;
  return 0;
}

export function OPDVisitWorkflow({ visit, patient }: any) {
  if (!visit) return null;
  const currentIndex = opdVisitWorkflowIndex(visit);
  const cancelled = isCancelledAppointment(visit);
  const patientName =
    patient?.full_name || patient?.name || visit.patient || visit.patient_name;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-100 text-teal-800">
          <UserRound className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-black text-slate-950">
              {patientName || "Selected patient"}
            </h3>
            <PatientFlagBadges patient={patient} />
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">
            {patient?.patient_number || visit.patient_number || "No patient number"}
            {patient?.age_years != null || patient?.age != null
              ? ` · ${patient.age_years ?? patient.age} yrs`
              : ""}
            {patient?.gender
              ? ` · ${displayPatientGender(patient.gender)}`
              : ""}
            {visit.token ? ` · Token ${visit.token}` : ""}
          </p>
        </div>
        <Badge
          tone={cancelled ? "red" : currentIndex === 4 ? "green" : "blue"}
          className="self-start rounded-full px-2.5 py-1 text-[10px] sm:self-center"
        >
          {cancelled
            ? "Cancelled"
            : humanizeOptionLabel(
                visit.consultationStatus ||
                  visit.queueStatus ||
                  visit.status ||
                  "Scheduled",
              )}
        </Badge>
      </div>

      <div className="scrollbar-hidden overflow-x-auto">
      <ol className="flex min-w-[560px] items-center px-4 py-3" aria-label="Visit workflow">
        {visitWorkflowSteps.map((step, index) => {
          const complete = !cancelled && index < currentIndex;
          const current = !cancelled && index === currentIndex;
          return (
            <li key={step} className="flex min-w-0 flex-1 items-center last:flex-none">
              <div
                className="flex items-center gap-1.5"
                aria-current={current ? "step" : undefined}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-black ${
                    complete
                      ? "bg-teal-500 text-white"
                      : current
                        ? "bg-teal-800 text-white ring-4 ring-teal-100"
                        : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {complete ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : current ? (
                    index + 1
                  ) : (
                    <Circle className="h-2.5 w-2.5" />
                  )}
                </span>
                <span
                  className={`whitespace-nowrap text-[10px] font-bold ${
                    complete || current ? "text-slate-800" : "text-slate-400"
                  }`}
                >
                  {step}
                </span>
              </div>
              {index < visitWorkflowSteps.length - 1 && (
                <span
                  className={`mx-2 h-px min-w-4 flex-1 ${
                    index < currentIndex && !cancelled
                      ? "bg-teal-400"
                      : "bg-slate-200"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
      </div>
    </section>
  );
}
