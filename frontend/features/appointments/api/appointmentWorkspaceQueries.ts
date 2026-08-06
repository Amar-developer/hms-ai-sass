import { apiFetch, type ApiSession } from "@/lib/api";

export const APPOINTMENT_ROWS_STALE_MS = 15_000;
export const QUEUE_ROWS_STALE_MS = 5_000;
export const CONSULTATION_ROWS_STALE_MS = 10_000;
export const SCHEDULE_ROWS_STALE_MS = 30_000;

export function appointmentRowsQueryKey(tenantId?: string) {
  return ["appointment-workspace", tenantId, "appointments"] as const;
}

export function queueRowsQueryKey(tenantId?: string) {
  return ["appointment-workspace", tenantId, "queue"] as const;
}

export function consultationRowsQueryKey(tenantId?: string) {
  return ["appointment-workspace", tenantId, "consultations"] as const;
}

export function scheduleRowsQueryKey(tenantId?: string) {
  return ["appointment-workspace", tenantId, "schedules"] as const;
}

export function fetchAppointmentRows(session: ApiSession) {
  return apiFetch<any[]>("/appointments", session);
}

export function fetchQueueRows(session: ApiSession) {
  return apiFetch<any[]>("/queue?include_completed=true", session);
}

export function fetchConsultationRows(session: ApiSession) {
  return apiFetch<any[]>("/consultations", session);
}

export function fetchScheduleRows(session: ApiSession) {
  return apiFetch<any[]>(
    "/practitioners/schedules?is_active=true",
    session,
  );
}
