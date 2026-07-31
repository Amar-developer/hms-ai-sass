import { apiFetch, type ApiSession } from "@/lib/api";

export function fetchAppointment(session: ApiSession, appointmentId: string) {
  return apiFetch(`/appointments/${appointmentId}`, session);
}

export function rescheduleAppointment(
  session: ApiSession,
  appointmentId: string,
  payload: { appointment_date: string; appointment_time: string | null },
) {
  return apiFetch(
    `/appointments/${encodeURIComponent(appointmentId)}/reschedule`,
    session,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}
