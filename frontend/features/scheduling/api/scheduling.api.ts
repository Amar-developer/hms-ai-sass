import { apiFetch } from "@/lib/api";

export function getTenants(apiSession: any) {
  return apiFetch("/tenants", apiSession);
}

export function getBranches(tenantId: string, session: any) {
  return apiFetch(`/tenants/${tenantId}/branches`, session);
}

export function getDepartments(tenantId: string, session: any) {
  return apiFetch(`/tenants/${tenantId}/departments`, session);
}

export function getDoctors(session: any) {
  return apiFetch("/practitioners", session);
}

export function getSchedules(session: any) {
  return apiFetch("/practitioners/schedules", session);
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
