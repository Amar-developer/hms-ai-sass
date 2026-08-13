"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
} from "lucide-react";
import {
  Badge,
  Card,
  Input,
  RefreshButton,
  SearchableSelect,
  StatusToast,
} from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { sortQueue } from "@/lib/hmsLogic";
import { humanizeOptionLabel, publicDisplayValue } from "@/lib/options";
import { TokenQueueProps } from "./types";
import {
  dateKey,
  isActiveQueueAppointment,
  isStatus,
  sortByQueuePosition,
  todayKey,
} from "./helpers";
import { Pagination } from "@/app/components/common/Pagination";
import { pageSize } from "@/utils/constants";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import { Skeleton } from "@/app/components/common/loader/Skeleton";
import { useQueueActions, useQueueDisplay } from "./api";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";
import { useAppointmentsQuery } from "@/features/appointments/api/useAppointmentsQuery";
import { call_language_options, display_mode_options } from "./constants";
import { DataTable } from "@/app/components/common/DataTable";
import { PatientFlagBadges } from "@/features/patients/components/PatientFlagBadges";
import { RowActions } from "../admin/components/RowActions";

export function TokenQueue({
  apiSession,
  clinic,
  branchId,
  patients,
  departmentId,
  doctorScope,
  setActive,
}: TokenQueueProps) {
  const {
    appointments,
    scopedAppointments,
    refetch,
    setLocal: setAppointments,
  } = useAppointmentsQuery(apiSession, {
    clinicId: clinic?.id,
    branchId,
    patients,
  });
  const { busyId, transition, cancelRemaining } = useQueueActions(apiSession);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [message, setMessage] = useState("");
  const [displayMode, setDisplayMode] = useState<"reception" | "called_only">(
    "reception",
  );
  const [tokenLanguage, setTokenLanguage] = useState<
    "english" | "tamil" | "both"
  >("english");

  const today = todayKey();
  const [selectedDate, setSelectedDate] = useState(today);
  const [page, setPage] = useState(1);
  const queueRevision = scopedAppointments
    .map(
      (row: any) =>
        `${row.id}:${row.queueStatus || row.queue_status}:${row.queuePosition || row.queue_position || 0}`,
    )
    .join("|");

  const { rows: displayRows, loading: displayLoading } = useQueueDisplay(
    apiSession,
    displayMode,
    queueRevision,
  );
  const selectedDateAppointments = scopedAppointments.filter(
    (appointment: any) => {
        if (
          dateKey(
            appointment.appointmentDate || appointment.appointment_date,
          ) !== selectedDate
        )
          return false;
        if (doctorScope?.practitionerId) {
          return (
            appointment.doctorId === doctorScope.practitionerId ||
            appointment.practitioner_id === doctorScope.practitionerId
          );
        }
        if (
          departmentId &&
          appointment.departmentId !== departmentId &&
          appointment.department_id !== departmentId
        )
          return false;
        return true;
      },
  );
  const queue = sortByQueuePosition(
    sortQueue(selectedDateAppointments.filter(isActiveQueueAppointment)),
  );
  const isCancelled = (appointment: any) =>
    [
      appointment.queueStatus,
      appointment.queue_status,
      appointment.status,
      appointment.consultationStatus,
      appointment.consultation_status,
    ].some((value) =>
      ["cancelled", "canceled", "no_show"].includes(
        String(value || "").trim().toLowerCase().replaceAll(" ", "_"),
      ),
    );
  const dayRows = selectedDateAppointments.filter(
    (appointment: any) => !isCancelled(appointment),
  );
  const waitingCount = queue.filter((appointment: any) =>
    ["waiting", "in_queue", "requeued"].includes(
      String(appointment.queueStatus || appointment.queue_status || "")
        .trim()
        .toLowerCase()
        .replaceAll(" ", "_"),
    ),
  ).length;
  const completedCount = dayRows.filter(
    (appointment: any) => !isActiveQueueAppointment(appointment),
  ).length;
  const patientMap = new Map(
    (patients || []).map((patient: any) => [String(patient.id), patient]),
  );
  const visibleQueue =
    displayMode === "called_only"
      ? queue.filter(
          (appointment: any) =>
            appointment.queueStatus === "called" ||
            appointment.queueStatus === "Called",
        )
      : queue;
  const totalPages = Math.max(1, Math.ceil(visibleQueue.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedQueue = visibleQueue.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const visibleDisplayRows = sortByQueuePosition(displayRows)
    .map((row: any) => ({
      ...row,
      appointment: queue.find(
        (appointment: any) => appointment.id === row.appointment_id,
      ),
    }))
    .filter((row: any) => row.appointment);

  useEffect(() => {
    setPage(1);
  }, [selectedDate, displayMode, departmentId, doctorScope?.practitionerId]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function updateAppointment(id: string, patch: any) {
    setAppointments(
      appointments.map((a: any) => (a.id === id ? { ...a, ...patch } : a)),
    );
  }

  function openConsultation(appointment: any) {
    if (!appointment?.id) return;
    setActive?.({ id: "opd", appointmentId: appointment.id });
  }

  const queueEntryIds = queue
    .filter((x: any) => x.queueEntryId)
    .map((x: any) => x.queueEntryId);

  function openPatient(appointment: any) {
    const patientId = appointment?.patientId || appointment?.patient_id;
    if (!patientId) return;
    sessionStorage.setItem("medizinhub.patientId", patientId);
    setActive?.("patients");
  }

  const queueColumns = [
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
          className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50"
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
      key: "queueStatus",
      header: "Queue Status",
      width: "170px",
      className: "text-center",
      cellClassName: "text-center",
      render: (appointment: any) => (
        <Badge
          tone={
            appointment.tokenType === "Emergency"
              ? "red"
              : isStatus(appointment, "waiting")
                ? "amber"
                : isStatus(appointment, "called") ||
                    isStatus(appointment, "in_consultation")
                  ? "blue"
                  : "slate"
          }
          className="inline-flex rounded-full px-3 py-1.5 text-xs"
        >
          {humanizeOptionLabel(appointment.queueStatus)}
        </Badge>
      ),
    },

    {
      key: "actions",
      header: "Actions",
      width: "190px",
      className: "text-center",
      disableRowClick: true,

      render: (appointment: any) => (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => openConsultation(appointment)}
            className="primary-action h-9 gap-2 px-3 text-xs"
          >
            Open Visit
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <RowActions
            width="w-24"
            portal
            actions={[
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
        </div>
      ),
    },
  ];

  return (
    <Card className="p-4">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 xl:flex-row xl:items-end">
        <div className="flex items-center gap-2">
          <div>
            <h3 className="card-title font-bold">
              Patient Queue & Token Priority
            </h3>
            <p className="card-desc text-xs text-slate-500">
              {apiSession
                ? "Reception can manually call, skip, requeue, or close remaining tokens at end of day."
                : "Emergency tokens appear first. Skipped patients can be requeued."}
            </p>
          </div>
          <div className="flex justify-center  items-center">
            {apiSession ? <RefreshButton onRefresh={() => refetch()} /> : null}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[160px_180px_160px_auto] xl:items-end">
          <FormField label="Date">
            <Input
              type="date"
              value={selectedDate}
              onChange={(event: any) =>
                setSelectedDate(event.target.value || today)
              }
            />
          </FormField>
          <FormField label="Display Mode">
            <SearchableSelect
              value={displayMode}
              onChange={(value: string) =>
                setDisplayMode(value as "reception" | "called_only")
              }
              options={display_mode_options}
              placeholder="Select display mode"
              searchable={false}
            />
          </FormField>
          <FormField label="Call Language">
            <SearchableSelect
              value={tokenLanguage}
              onChange={(value: string) =>
                setTokenLanguage(value as "english" | "tamil" | "both")
              }
              options={call_language_options}
              placeholder="Select language"
              searchable={false}
            />
          </FormField>
          <FormField label="Day Close">
            <button
              type="button"
              onClick={() => setShowCancelModal(true)}
              disabled={busyId === "end-of-day" || queue.length === 0}
              className="danger-action h-10 whitespace-nowrap text-xs"
            >
              <ButtonLoader loading={busyId === "end-of-day"}>
                {busyId === "end-of-day" ? "Closing..." : "Cancel Remaining"}
              </ButtonLoader>
            </button>
          </FormField>
        </div>
      </div>
      <StatusToast message={message} onClose={() => setMessage("")} />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Today", dayRows.length, CalendarDays, "bg-blue-50 text-blue-700"],
          ["Open", queue.length, ClipboardList, "bg-violet-50 text-violet-700"],
          ["Waiting", waitingCount, Clock3, "bg-amber-50 text-amber-700"],
          ["Completed", completedCount, CheckCircle2, "bg-emerald-50 text-emerald-700"],
        ].map(([label, value, Icon, tone]: any) => (
          <div key={label} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}>
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-0.5 text-2xl font-black leading-none text-slate-950">{value}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-black text-slate-950">Live Token Board</h4>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Select a token to open the consultation workspace.
          </p>
        </div>
        <Badge tone="green" className="rounded-full px-3 py-1.5 text-[10px]">
          {visibleQueue.length} active
        </Badge>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {displayLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
          ))}
        {!displayLoading &&
          (visibleDisplayRows.length ? visibleDisplayRows : visibleQueue).map(
            (item: any) => {
              const appointment = item.appointment || item;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openConsultation(appointment)}
                  className="rounded-xl bg-brand p-4 text-left text-brand-fg shadow-sm transition hover:bg-brand-hover"
                >
                  <p className="flex items-center gap-2 text-lg font-black">
                    <span className="shrink-0">{item.token_number || item.token}</span>
                    <span className="text-emerald-200">·</span>
                    <span className="min-w-0 truncate text-sm font-semibold text-white">
                      {appointment.patient ||
                        publicDisplayValue(item.patient_id, "Patient")}
                    </span>
                  </p>
                  <PatientFlagBadges
                    patient={patientMap.get(
                      String(
                        appointment.patientId ||
                          appointment.patient_id ||
                          item.patient_id,
                      ),
                    )}
                    className="mt-1"
                    inverse
                  />

                  <p className="mt-2 truncate text-xs text-emerald-100">
                    {appointment.doctor || "Doctor"} ·{" "}
                    {humanizeOptionLabel(
                      appointment.queueStatus || item.status,
                    )}
                  </p>
                </button>
              );
            },
          )}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-black text-slate-950">Queue List</h4>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Open a visit directly or use more actions to call, skip, requeue, or cancel.
          </p>
        </div>
        <span className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-700">
          {visibleQueue.length} {visibleQueue.length === 1 ? "token" : "tokens"}
        </span>
      </div>
      <div className="mt-3">
        <DataTable
          columns={queueColumns}
          data={pagedQueue}
          onRowClick={openConsultation}
          paginate={false}
        />
      </div>
      <Pagination
        page={safePage}
        totalPages={totalPages}
        total={visibleQueue.length}
        onPage={setPage}
      />
      {showCancelModal && (
        <ConfirmModal
          title="Cancel Remaining tokens ?"
          message={`Cancel ${queue.length} remaining token(s) for ${selectedDate}? This will remove unattended tokens from the active queue.`}
          confirmLabel="cancel tokens"
          reasonLabel="cancellation reson"
          requireReason
          busy={busyId === "end-of-day"}
          onCancel={() => setShowCancelModal(false)}
          onConfirm={async ({ reason }) => {
            try {
              await cancelRemaining(queueEntryIds, reason);
              setShowCancelModal(false);
              setMessage("Remaining tokens cancelled.");
            } catch (error: any) {
              setMessage(
                error?.message || "Failed to cancel remaining tokens.",
              );
            }
          }}
        />
      )}
    </Card>
  );
}
