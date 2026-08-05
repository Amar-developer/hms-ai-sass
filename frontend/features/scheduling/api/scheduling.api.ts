import { apiFetch } from "@/lib/api";

export function getTenants(apiSession: any) {
  return apiFetch("/tenants", apiSession);
}

export function getDoctors(session: any) {
  return apiFetch("/practitioners", session);
}

export function getSchedules(session: any) {
  return apiFetch("/practitioners/schedules", session);
}

/** One row per editable schedule, each with its timings under `slots`. */
export function getGroupedSchedules(session: any) {
  return apiFetch("/practitioners/schedules/grouped", session);
}

export function createSchedule(
  practitionerId: string,
  payload: any,
  session: any,
) {
  return apiFetch(`/practitioners/${practitionerId}/schedules`, session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateSchedule(id: string, payload: any, session: any) {
  return apiFetch(`/practitioners/schedules/${id}`, session, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteSchedule(id: string, session: any) {
  return apiFetch(`/practitioners/schedules/${id}`, session, {
    method: "DELETE",
  });
}
