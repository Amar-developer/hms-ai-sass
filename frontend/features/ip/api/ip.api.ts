import { apiFetch, apiUpload, type ApiSession } from "@/lib/api";

export function listAdmissions(session: ApiSession) {
  return apiFetch("/ip/admissions", session);
}

export function listTreatments(session: ApiSession, admissionId: string) {
  return apiFetch(`/ip/admissions/${admissionId}/treatments`, session);
}

export function listCharges(session: ApiSession, admissionId: string) {
  return apiFetch(`/ip/admissions/${admissionId}/charges`, session);
}

export function listBillingItems(session: ApiSession, admissionId: string) {
  return apiFetch(`/ip/admissions/${admissionId}/billing-items`, session);
}

export function listDocuments(session: ApiSession, admissionId: string) {
  return apiFetch(`/ip/admissions/${admissionId}/documents`, session);
}

export function listMedicationOrders(session: ApiSession, admissionId: string) {
  return apiFetch(`/ip/admissions/${admissionId}/medication-orders`, session);
}

export function listMedicationAdministrations(
  session: ApiSession,
  admissionId: string,
) {
  return apiFetch(
    `/ip/admissions/${admissionId}/medication-administrations`,
    session,
  );
}

export function getAdmissionInvoice(session: ApiSession, admissionId: string) {
  return apiFetch(`/ip/admissions/${admissionId}/invoice`, session);
}

export function listRooms(
  session: ApiSession,
  filters: { branchId: string; availableFrom: string; availableTo: string },
) {
  const params = new URLSearchParams({
    branch_id: filters.branchId,
    available_from: filters.availableFrom,
    available_to: filters.availableTo,
    include_occupied: "true",
  });
  return apiFetch(`/ip/rooms?${params.toString()}`, session);
}

export function createRoom(session: ApiSession, room: any) {
  return apiFetch("/ip/rooms", session, {
    method: "POST",
    body: JSON.stringify(room),
  });
}

export function listMedicineCatalog(session: ApiSession) {
  return apiFetch("/pharmacy/medicines", session);
}

export function listLabCatalog(session: ApiSession) {
  return apiFetch("/lab/catalog/tests", session);
}

export function createAdmission(session: ApiSession, payload: any) {
  return apiFetch("/ip/admissions", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createAdmissionFromAppointment(
  session: ApiSession,
  appointmentId: string,
  payload: any,
) {
  return apiFetch(
    `/ip/admissions/from-appointment/${appointmentId}`,
    session,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export function uploadAdmissionDocument(
  session: ApiSession,
  admissionId: string,
  file: File,
) {
  const form = new FormData();
  form.append("file", file);
  return apiUpload(`/ip/admissions/${admissionId}/document`, session, form);
}

export function uploadAdmissionDocuments(
  session: ApiSession,
  admissionId: string,
  documentType: string,
  files: File[],
) {
  const form = new FormData();
  form.append("document_type", documentType);
  files.forEach((file) => form.append("files", file));
  return apiUpload(`/ip/admissions/${admissionId}/documents`, session, form);
}

export function createTreatment(
  session: ApiSession,
  admissionId: string,
  payload: any,
) {
  return apiFetch(`/ip/admissions/${admissionId}/treatments`, session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createIpConsultation(
  session: ApiSession,
  admissionId: string,
  payload: any,
) {
  return apiFetch(`/ip/admissions/${admissionId}/consultations`, session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function signIpConsultation(session: ApiSession, consultationId: string) {
  return apiFetch(`/ip/consultations/${consultationId}/sign`, session, {
    method: "POST",
  });
}

export function createConsent(
  session: ApiSession,
  admissionId: string,
  payload: any,
) {
  return apiFetch(`/ip/admissions/${admissionId}/consents`, session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function signConsent(session: ApiSession, consentId: string) {
  return apiFetch(`/ip/consents/${consentId}/sign`, session, {
    method: "POST",
  });
}

export function createDischargeSummary(
  session: ApiSession,
  admissionId: string,
  payload: any,
) {
  return apiFetch(`/ip/admissions/${admissionId}/discharge-summary`, session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function finalizeDischargeSummary(
  session: ApiSession,
  dischargeId: string,
) {
  return apiFetch(`/ip/discharge-summaries/${dischargeId}/finalize`, session, {
    method: "POST",
  });
}

export function createCharge(
  session: ApiSession,
  admissionId: string,
  payload: any,
) {
  return apiFetch(`/ip/admissions/${admissionId}/charges`, session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createBillingItem(
  session: ApiSession,
  admissionId: string,
  payload: any,
) {
  return apiFetch(`/ip/admissions/${admissionId}/billing-items`, session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createMedicationOrder(
  session: ApiSession,
  admissionId: string,
  payload: any,
) {
  return apiFetch(`/ip/admissions/${admissionId}/medication-orders`, session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createMedicationAdministration(
  session: ApiSession,
  admissionId: string,
  orderId: string,
  payload: any,
) {
  return apiFetch(
    `/ip/admissions/${admissionId}/medication-orders/${orderId}/administrations`,
    session,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export function generateAdmissionInvoice(session: ApiSession, admissionId: string) {
  return apiFetch(`/ip/admissions/${admissionId}/invoice`, session, {
    method: "POST",
  });
}
