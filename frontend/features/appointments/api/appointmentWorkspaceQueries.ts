import { apiFetch, type ApiSession } from "@/lib/api";
import type { QueryFilterRow } from "@/utils/queryFilter";
import type { SortState } from "@/utils/types";

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
  // This snapshot feeds the OPD tab counts and consultation worklist. The
  // endpoint defaults to 100 rows, which silently hid older pending visits.
  return apiFetch<any[]>("/appointments?limit=500", session);
}

type ListPageParams = {
  q?: string;
  branchId?: string;
  departmentId?: string;
  practitionerId?: string;
  appointmentDate?: string;
  queryFilters?: QueryFilterRow[];
  sort?: SortState | null;
  offset?: number;
  limit?: number;
};

function appendListPageParams(params: URLSearchParams, input: ListPageParams) {
  if (input.q?.trim()) params.set("q", input.q.trim());
  if (input.branchId && input.branchId !== "all")
    params.set("branch_id", input.branchId);
  if (input.departmentId && input.departmentId !== "all")
    params.set("department_id", input.departmentId);
  if (input.practitionerId && input.practitionerId !== "all")
    params.set("practitioner_id", input.practitionerId);
  if (input.appointmentDate) params.set("appointment_date", input.appointmentDate);
  if (input.queryFilters?.length)
    params.set("filters", JSON.stringify(input.queryFilters));
  if (input.sort) params.set("sort", JSON.stringify(input.sort));
  if (input.offset !== undefined) params.set("offset", String(input.offset));
  if (input.limit !== undefined) params.set("limit", String(input.limit));
}

export function fetchAppointmentPage(
  session: ApiSession,
  input: ListPageParams = {},
) {
  const params = new URLSearchParams();
  appendListPageParams(params, input);
  return apiFetch<{ items: any[]; total: number; limit: number; offset: number }>(
    `/appointments/page?${params.toString()}`,
    session,
  );
}

export function fetchAppointmentFilterOptions(session: ApiSession) {
  return apiFetch<Record<string, { value: string; label: string }[]>>(
    "/appointments/filter-options",
    session,
  );
}

export function fetchQueueRows(session: ApiSession) {
  return apiFetch<any[]>("/queue?include_completed=true", session);
}

export function fetchConsultationRows(session: ApiSession) {
  return apiFetch<any[]>("/consultations", session);
}

export function fetchConsultationPage(
  session: ApiSession,
  input: Omit<ListPageParams, "appointmentDate" | "departmentId"> = {},
) {
  const params = new URLSearchParams();
  if (input.q?.trim()) params.set("q", input.q.trim());
  if (input.branchId && input.branchId !== "all")
    params.set("branch_id", input.branchId);
  if (input.practitionerId && input.practitionerId !== "all")
    params.set("practitioner_id", input.practitionerId);
  if (input.queryFilters?.length)
    params.set("filters", JSON.stringify(input.queryFilters));
  if (input.sort) params.set("sort", JSON.stringify(input.sort));
  if (input.offset !== undefined) params.set("offset", String(input.offset));
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  return apiFetch<{ items: any[]; total: number; limit: number; offset: number }>(
    `/consultations/page?${params.toString()}`,
    session,
  );
}

export function fetchConsultationFilterOptions(session: ApiSession) {
  return apiFetch<Record<string, { value: string; label: string }[]>>(
    "/consultations/filter-options",
    session,
  );
}

export function fetchScheduleRows(session: ApiSession) {
  return apiFetch<any[]>(
    "/practitioners/schedules?is_active=true",
    session,
  );
}
