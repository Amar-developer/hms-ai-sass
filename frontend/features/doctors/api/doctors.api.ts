import { apiFetch, apiUpload, type ApiSession } from "@/lib/api";

export function fetchTenants(session: ApiSession) {
  return apiFetch("/tenants", session);
}

export function fetchTenantUsers(session: ApiSession) {
  return apiFetch("/identity/users", session);
}

export function fetchDoctorFeeRules(session: ApiSession) {
  return apiFetch("/billing/doctor-fee-rules", session);
}

export function createDoctorFeeRule(session: ApiSession, payload: any) {
  return apiFetch("/billing/doctor-fee-rules", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createPractitioner(session: ApiSession, payload: any) {
  return apiFetch("/practitioners", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updatePractitioner(
  session: ApiSession,
  practitionerId: string,
  payload: any,
) {
  return apiFetch(`/practitioners/${practitionerId}`, session, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deletePractitioner(session: ApiSession, practitionerId: string) {
  return apiFetch(`/practitioners/${practitionerId}`, session, {
    method: "DELETE",
  });
}

export function uploadPractitionerSignature(
  session: ApiSession,
  formData: FormData,
) {
  return apiUpload("/files", session, formData);
}
