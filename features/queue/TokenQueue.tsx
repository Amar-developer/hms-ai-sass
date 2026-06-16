"use client";

import { useEffect, useState } from "react";
import {
  ActionButton,
  ActionGroup,
  Badge,
  Card,
  RefreshButton,
  Select,
  StatusToast,
} from "@/components/common/ui";
import { FormField } from "@/components/FormElements";
import { apiFetch, type ApiSession } from "@/lib/api";
import { sortQueue } from "@/lib/hmsLogic";
import { humanizeOptionLabel, publicDisplayValue } from "@/lib/options";

type TokenQueueProps = {
  scopedAppointments: any[];
  appointments: any[];
  setAppointments: (value: any[]) => void;
  apiSession: ApiSession | null;
  loadLiveData: (session: ApiSession) => Promise<void>;
  departmentId: string;
  doctorScope?: any;
  setActive?: (page: string) => void;
};

type QueueAction = "call" | "skip" | "requeue" | "cancel";

function dateKey(value: any) {
  return String(value || "").slice(0, 10);
}

function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function tokenSortValue(row: any) {
  return String(row.token_number || row.token || "").trim();
}

function sortByTokenNumber(rows: any[]) {
  return [...rows].sort((a: any, b: any) =>
    tokenSortValue(a).localeCompare(tokenSortValue(b), undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

function isActiveQueueStatus(value: any) {
  const status = String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
  return ![
    "cancelled",
    "canceled",
    "no_show",
    "consultation_completed",
    "billed",
    "completed",
    "done",
  ].includes(status);
}

function isActiveQueueAppointment(appointment: any) {
  return (
    isActiveQueueStatus(appointment.queueStatus || appointment.queue_status) &&
    isActiveQueueStatus(appointment.status) &&
    isActiveQueueStatus(
      appointment.consultationStatus || appointment.consultation_status,
    ) &&
    String(
      appointment.consultationStatus || appointment.consultation_status || "",
    )
      .trim()
      .toLowerCase() !== "signed"
  );
}

export function TokenQueue({
  scopedAppointments,
  appointments,
  setAppointments,
  apiSession,
  loadLiveData,
  departmentId,
  doctorScope,
  setActive,
}: TokenQueueProps) {
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [displayMode, setDisplayMode] = useState<"reception" | "called_only">(
    "reception",
  );
  const [tokenLanguage, setTokenLanguage] = useState<
    "english" | "tamil" | "both"
  >("english");
  const [displayRows, setDisplayRows] = useState<any[]>([]);
  const today = todayKey();
  const queue = sortByTokenNumber(
    sortQueue(
      scopedAppointments.filter((appointment: any) => {
        if (
          dateKey(
            appointment.appointmentDate || appointment.appointment_date,
          ) !== today
        )
          return false;
        if (!isActiveQueueAppointment(appointment)) return false;
        if (doctorScope?.practitionerId) {
          return (
            appointment.doctorId === doctorScope.practitionerId ||
            appointment.practitioner_id === doctorScope.practitionerId
          );
        }
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
  const visibleDisplayRows = sortByTokenNumber(displayRows)
    .map((row: any) => ({
      ...row,
      appointment: queue.find(
        (appointment: any) => appointment.id === row.appointment_id,
      ),
    }))
    .filter((row: any) => row.appointment);

  useEffect(() => {
    let alive = true;
    async function loadDisplay() {
      if (!apiSession) return;
      try {
        const rows = await apiFetch(
          `/queue/display?display_mode=${displayMode}`,
          apiSession,
        );
        if (alive) setDisplayRows(rows);
      } catch {
        if (alive) setDisplayRows([]);
      }
    }
    loadDisplay();
    return () => {
      alive = false;
    };
  }, [
    apiSession?.token,
    apiSession?.tenantId,
    displayMode,
    scopedAppointments.length,
  ]);

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

  function openPatient(appointment: any) {
    const patientId = appointment?.patientId || appointment?.patient_id;
    if (!patientId) return;
    sessionStorage.setItem("medizinhub.patientId", patientId);
    setActive?.("patients");
  }

  async function transition(appointment: any, action: QueueAction) {
    setBusyId(appointment.id);
    setMessage("");

    try {
      if (apiSession && appointment.queueEntryId) {
        const endpoint =
          action === "call"
            ? `/queue/${appointment.queueEntryId}/call`
            : action === "skip"
              ? `/queue/${appointment.queueEntryId}/mark-not-available`
              : action === "requeue"
                ? `/queue/${appointment.queueEntryId}/requeue`
                : `/queue/${appointment.queueEntryId}/cancel`;
        const body =
          action === "requeue"
            ? {
                reason: "Updated from MedizinHub web app",
                place_at_end: false,
                actor_user_id: apiSession.user?.id,
              }
            : {
                reason: "Updated from MedizinHub web app",
                actor_user_id: apiSession.user?.id,
              };

        await apiFetch(endpoint, apiSession, {
          method: "POST",
          body: JSON.stringify(body),
        });
        await loadLiveData(apiSession);
        setMessage(`Token ${appointment.token} updated in backend.`);
      } else {
        if (action === "call")
          updateAppointment(appointment.id, {
            queueStatus: "Called",
            status: "Scheduled",
          });
        if (action === "skip") {
          updateAppointment(appointment.id, {
            queueStatus: "Not Available",
            status: "Skipped",
          });
        }
        if (action === "requeue") {
          updateAppointment(appointment.id, {
            queueStatus: "Requeued",
            status: "Scheduled",
            priority: 2,
          });
        }
        if (action === "cancel") {
          updateAppointment(appointment.id, {
            queueStatus: "Cancelled",
            status: "Cancelled",
          });
        }
      }
    } catch (err: any) {
      setMessage(err.message || "Queue update failed.");
    } finally {
      setBusyId("");
    }
  }

  async function cancelRemainingTokens() {
    const remaining = queue.filter((appointment: any) =>
      isActiveQueueAppointment(appointment),
    );
    if (remaining.length === 0) {
      setMessage("No active tokens to cancel.");
      return;
    }
    const confirmed = window.confirm(
      `Cancel ${remaining.length} remaining token(s) for today? This will remove unattended tokens from the active queue.`,
    );
    if (!confirmed) return;
    setBusyId("end-of-day");
    setMessage("");
    try {
      if (apiSession) {
        const rowsWithQueue = remaining.filter(
          (appointment: any) => appointment.queueEntryId,
        );
        await Promise.all(
          rowsWithQueue.map((appointment: any) =>
            apiFetch(`/queue/${appointment.queueEntryId}/cancel`, apiSession, {
              method: "POST",
              body: JSON.stringify({
                reason: "End-of-day manual close by reception",
                actor_user_id: apiSession.user?.id,
              }),
            }),
          ),
        );
        await loadLiveData(apiSession);
        setMessage(
          `${rowsWithQueue.length} remaining token(s) cancelled and removed from the active queue.`,
        );
      } else {
        setAppointments(
          appointments.map((appointment: any) =>
            remaining.some((row: any) => row.id === appointment.id)
              ? {
                  ...appointment,
                  queueStatus: "Cancelled",
                  status: "Cancelled",
                }
              : appointment,
          ),
        );
        setMessage(`${remaining.length} remaining token(s) cancelled.`);
      }
    } catch (err: any) {
      setMessage(err.message || "Could not cancel remaining tokens.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div className="flex items-end  gap-2">
          <div>
            <h3 className="card-title font-bold">
              Patient Queue & Token Priority
            </h3>
            <p className="table-data text-slate-500">
              {apiSession
                ? "Reception can manually call, skip, requeue, or close remaining tokens at end of day."
                : "Emergency tokens appear first. Skipped patients can be requeued."}
            </p>
          </div>
          <div className="">
            {apiSession ? (
              <RefreshButton onRefresh={() => loadLiveData(apiSession)} />
            ) : null}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <FormField label="Display Mode">
            <Select
              value={displayMode}
              onChange={(e: any) => setDisplayMode(e.target.value)}
            >
              <option value="reception">Reception Queue</option>
              <option value="called_only">Called Tokens</option>
            </Select>
          </FormField>
          <FormField label="Call Language">
            <Select
              value={tokenLanguage}
              onChange={(e: any) => setTokenLanguage(e.target.value)}
            >
              <option value="english">English</option>
              <option value="tamil">Tamil</option>
              <option value="both">English + Tamil</option>
            </Select>
          </FormField>
          <FormField label="Day Close">
            <button
              type="button"
              onClick={cancelRemainingTokens}
              disabled={busyId === "end-of-day" || queue.length === 0}
              className="close-button border-red-100 bg-white table-xs font-bold text-red-600 hover:bg-red-50 disabled:text-slate-300"
            >
              {busyId === "end-of-day" ? "Closing..." : "Cancel Remaining"}
            </button>
          </FormField>
        </div>
      </div>
      <StatusToast message={message} onClose={() => setMessage("")} />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(visibleDisplayRows.length ? visibleDisplayRows : visibleQueue).map(
          (item: any) => {
            const appointment = item.appointment || item;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openConsultation(appointment)}
                className="rounded-lg bg-slate-900 p-4 text-left text-white transition hover:bg-slate-800"
              >
                <p className="text-xs font-bold uppercase text-slate-300">
                  {humanizeOptionLabel(
                    item.priority || item.tokenType || "normal",
                  )}
                </p>
                <p className="mt-1 text-3xl font-black">
                  {item.token_number || item.token}
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {appointment.patient ||
                    publicDisplayValue(item.patient_id, "Patient")}
                </p>
                <p className="mt-1 truncate text-xs text-slate-300">
                  {appointment.doctor || "Doctor"} ·{" "}
                  {humanizeOptionLabel(appointment.queueStatus || item.status)}
                </p>
                {appointment.roomNumber && (
                  <p className="mt-1 text-xs font-bold text-slate-400">
                    Room {Number(appointment.roomNumber)}
                  </p>
                )}
              </button>
            );
          },
        )}
      </div>
      <div className="mt-4 overflow-auto rounded-lg border">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="p-3">Token</th>
              <th>Patient</th>
              <th>Doctor</th>
              <th>Status</th>
              <th>Queue</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleQueue.map((appointment: any) => (
              <tr
                key={appointment.id}
                onClick={() => openConsultation(appointment)}
                className="cursor-pointer border-t transition hover:bg-slate-50"
              >
                <td className="p-3 font-bold">
                  <button
                    type="button"
                    onClick={() => openConsultation(appointment)}
                    className="rounded-xl border px-3 py-2 font-bold hover:bg-slate-50"
                  >
                    {appointment.token}
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => openConsultation(appointment)}
                    className="text-left font-semibold hover:underline"
                  >
                    {appointment.patient}
                  </button>
                </td>
                <td>{appointment.doctor}</td>
                <td>
                  <Badge className="normal-badge">
                    {humanizeOptionLabel(appointment.status)}
                  </Badge>
                </td>
                <td>
                  <Badge
                    tone={
                      appointment.tokenType === "Emergency" ? "red" : "slate"
                    }
                    className="normal-badge"
                  >
                    {humanizeOptionLabel(appointment.queueStatus)}
                  </Badge>
                </td>
                <td
                  className="px-3 py-3"
                  onClick={(event) => event.stopPropagation()}
                >
                  <ActionGroup>
                    <ActionButton onClick={() => openConsultation(appointment)}>
                      Details
                    </ActionButton>
                    <ActionButton onClick={() => openPatient(appointment)}>
                      Patient
                    </ActionButton>
                    <ActionButton
                      disabled={busyId === appointment.id}
                      onClick={() => {
                        const tamil = `Token ${appointment.token}, maruththuva aalosanai araikku varavum.`;
                        const english = `Token ${appointment.token}, please proceed for consultation.`;
                        setMessage(
                          tokenLanguage === "tamil"
                            ? tamil
                            : tokenLanguage === "both"
                              ? `${english} ${tamil}`
                              : english,
                        );
                        transition(appointment, "call");
                      }}
                    >
                      Call
                    </ActionButton>
                    <ActionButton
                      disabled={busyId === appointment.id}
                      onClick={() => transition(appointment, "skip")}
                    >
                      Skip
                    </ActionButton>
                    <ActionButton
                      tone="primary"
                      disabled={busyId === appointment.id}
                      onClick={() => transition(appointment, "requeue")}
                    >
                      Requeue
                    </ActionButton>
                    <ActionButton
                      tone="danger"
                      disabled={busyId === appointment.id}
                      onClick={() => transition(appointment, "cancel")}
                    >
                      Cancel
                    </ActionButton>
                  </ActionGroup>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
