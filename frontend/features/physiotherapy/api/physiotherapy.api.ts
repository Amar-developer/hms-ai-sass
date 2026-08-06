import { apiFetch, apiUpload, type ApiSession } from "@/lib/api";

export { getPhysiotherapyInvoice, generatePhysiotherapyInvoice } from "@/lib/api";

export function listCases(session: ApiSession) {
  return apiFetch("/physiotherapy/cases", session);
}

export function listEquipment(session: ApiSession) {
  return apiFetch("/physiotherapy/equipment", session);
}

export function listPractitioners(session: ApiSession) {
  return apiFetch("/practitioners", session);
}

export function listDoctorFeeRules(session: ApiSession) {
  return apiFetch("/billing/doctor-fee-rules", session);
}

export function listCaseSessions(session: ApiSession, caseId: string) {
  return apiFetch(`/physiotherapy/cases/${caseId}/sessions`, session);
}

export function createCase(session: ApiSession, payload: any) {
  return apiFetch("/physiotherapy/cases", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createEquipment(session: ApiSession, payload: any) {
  return apiFetch("/physiotherapy/equipment", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createCaseSession(
  session: ApiSession,
  caseId: string,
  payload: any,
) {
  return apiFetch(`/physiotherapy/cases/${caseId}/sessions`, session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function uploadCaseConsent(
  session: ApiSession,
  caseId: string,
  files: File[],
  notes?: string,
) {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  if (notes) form.append("notes", notes);
  return apiUpload(`/physiotherapy/cases/${caseId}/consent`, session, form);
}
