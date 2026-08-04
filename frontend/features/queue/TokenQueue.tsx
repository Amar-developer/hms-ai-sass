"use client";

import { useEffect, useState } from "react";
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
import { RowActions } from "../admin/components/RowActions";
import { DataTable } from "../reports/components/DataTable";
import { useQueueActions, useQueueDisplay } from "./api";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";
import { useAppointmentsQuery } from "@/features/appointments/api/useAppointmentsQuery";
import { call_language_options, display_mode_options } from "./constants";

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
  const queue = sortByQueuePosition(
    sortQueue(
      scopedAppointments.filter((appointment: any) => {
        if (
          dateKey(
            appointment.appointmentDate || appointment.appointment_date,
          ) !== selectedDate
        )
          return false;
        if (!isActiveQueueAppointment(appointment)) return false;
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
      }),
    ),
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
    sessionStorage.setItem(
      "medizinhub.consultationAppointmentId",
      appointment.id,
    );
    const doctorId = appointment.doctorId || appointment.practitioner_id;
    if (doctorId)
      sessionStorage.setItem("medizinhub.consultationDoctorId", doctorId);
    setActive?.("consultation");
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

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div className="flex items-end lg:items-center gap-2">
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
        <div
          className="grid gap-2 md:grid-cols-[1.6fr_1.7fr_1.5fr_2fr]
         lg:grid-cols-[1.6fr_1.7fr_1.5fr_2fr]"
        >
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
              className="cancel-button border-red-100 bg-white table-xs font-bold text-red-600 hover:bg-red-50 disabled:text-slate-300"
            >
              <ButtonLoader loading={busyId === "end-of-day"}>
                {busyId === "end-of-day" ? "Closing..." : "Cancel Remaining"}
              </ButtonLoader>
            </button>
          </FormField>
        </div>
      </div>
      <StatusToast message={message} onClose={() => setMessage("")} />
      <div className="mt-4 grid gap-3 sm:grid-cols-4 lg:grid-cols-5">
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
                  className="rounded-lg bg-slate-900 p-3 text-left text-white transition hover:bg-slate-800"
                >
                  <p className="text-xl font-black flex items-center">
                    {item.token_number || item.token} -
                    <span className="mt-1 text-sm font-semibold text-white mb-1">
                      {appointment.patient ||
                        publicDisplayValue(item.patient_id, "Patient")}
                    </span>
                  </p>

                  <p className="mt-1 truncate text-xs text-slate-300">
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
