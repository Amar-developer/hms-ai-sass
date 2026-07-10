"use client";

import { useEffect, useState } from "react";
import {
  ActionButton,
  ActionGroup,
  Badge,
  Card,
  Input,
  RefreshButton,
  SearchableSelect,
  Select,
  StatusToast,
} from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { apiFetch, type ApiSession } from "@/lib/api";
import { sortQueue } from "@/lib/hmsLogic";
import { humanizeOptionLabel, publicDisplayValue } from "@/lib/options";
import { QueueAction, TokenQueueProps } from "./types";
import { dateKey, isActiveQueueAppointment, sortByTokenNumber, todayKey } from "./helpers";





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
  const [selectedDate, setSelectedDate] = useState(today);
  const queue = sortByTokenNumber(
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
    apiSession?.email,
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
      `Cancel ${remaining.length} remaining token(s) for ${selectedDate}? This will remove unattended tokens from the active queue.`,
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
          <div className="flex justify-center items-center">
            {apiSession ? (
              <RefreshButton onRefresh={() => loadLiveData(apiSession)} />
            ) : null}
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-[1.6fr_1.7fr_1.5fr_2fr]
         lg:grid-cols-[1.6fr_1.7fr_1.5fr_2fr]">
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
              options={[
                { value: "reception", label: "Reception Queue" },
                { value: "called_only", label: "Called Tokens" },
              ]}
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
              options={[
                { value: "english", label: "English" },
                { value: "tamil", label: "Tamil" },
                { value: "both", label: "English + Tamil" },
              ]}
              placeholder="Select language"
              searchable={false}
            />
          </FormField>
          <FormField label="Day Close">
            <button
              type="button"
              onClick={cancelRemainingTokens}
              disabled={busyId === "end-of-day" || queue.length === 0}
              className="cancel-button border-red-100 bg-white table-xs font-bold text-red-600 hover:bg-red-50 disabled:text-slate-300"
            >
              {busyId === "end-of-day" ? "Closing..." : "Cancel Remaining"}
            </button>
          </FormField>
        </div>
      </div>
      <StatusToast message={message} onClose={() => setMessage("")} />
      <div className="mt-4 grid gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {(visibleDisplayRows.length ? visibleDisplayRows : visibleQueue).map(
          (item: any) => {
            const appointment = item.appointment || item;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openConsultation(appointment)}
                className="rounded-lg bg-slate-900 p-3 text-left text-white transition hover:bg-slate-800"
              >
                {/* <p className="text-xs font-bold uppercase text-slate-300">
                  {humanizeOptionLabel(
                    item.priority || item.tokenType || "normal",
                  )}
                </p> */}
                <p className="text-xl font-black flex items-center">
                  {item.token_number || item.token} -
                  <span className="mt-1 text-sm font-semibold text-white mb-1">
                    {appointment.patient ||
                      publicDisplayValue(item.patient_id, "Patient")}
                  </span>
                </p>

                <p className="mt-1 truncate text-xs text-slate-300">
                  {appointment.doctor || "Doctor"} ·{" "}
                  {humanizeOptionLabel(appointment.queueStatus || item.status)}
                </p>
                {/* {appointment.roomNumber && (
                  <p className="mt-1 text-xs font-bold text-slate-400">
                    Room {Number(appointment.roomNumber)}
                  </p>
                )} */}
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
              <th className="text-center">Status</th>
              <th className="text-center">Queue</th>
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
                    className="rounded-lg border px-3 py-2 text-xs font-bold hover:bg-slate-50"
                  >
                    {appointment.token}
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => openConsultation(appointment)}
                    className="text-left font-semibold text-xs hover:underline"
                  >
                    {appointment.patient}
                  </button>
                </td>
                <td className="text-xs">{appointment.doctor}</td>
                <td className="px-2">
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
                  className="px-3 py-3 w-48"
                  onClick={(event) => event.stopPropagation()}
                >
                  <ActionGroup className="justify-end">
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
