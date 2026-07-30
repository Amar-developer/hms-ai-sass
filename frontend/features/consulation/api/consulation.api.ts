import { apiFetch, type ApiSession } from "@/lib/api";

export function listPractitioners(
  session: ApiSession,
  filters: { branchId?: string; departmentId?: string } = {},
) {
  const params = new URLSearchParams();
  if (filters.branchId) params.set("branch_id", filters.branchId);
  if (filters.departmentId) params.set("department_id", filters.departmentId);
  return apiFetch(
    `/practitioners${params.toString() ? `?${params}` : ""}`,
    session,
  );
}

export function findConsultationByAppointment(
  session: ApiSession,
  appointmentId: string,
) {
  return apiFetch(
    `/consultations?appointment_id=${encodeURIComponent(appointmentId)}`,
    session,
  );
}

export function getConsultation(session: ApiSession, consultationId: string) {
  return apiFetch(`/consultations/${consultationId}`, session);
}

export function getPatient(session: ApiSession, patientId: string) {
  return apiFetch(`/patients/${patientId}`, session);
}

export function listClinicalTemplates(
  session: ApiSession,
  departmentId: string,
) {
  return apiFetch(
    `/consultations/by-department/${encodeURIComponent(departmentId)}/clinical-templates`,
    session,
  );
}

export function listAvailableMedicines(session: ApiSession, search?: string) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  return apiFetch(
    `/pharmacy/catalog/available-medicines${params.toString() ? `?${params}` : ""}`,
    session,
  );
}

export function listAvailableLabTests(
  session: ApiSession,
  filters: { branchId?: string; search?: string } = {},
) {
  const params = new URLSearchParams();
  if (filters.branchId) params.set("branch_id", filters.branchId);
  if (filters.search) params.set("search", filters.search);
  return apiFetch(
    `/lab/catalog/available-tests${params.toString() ? `?${params}` : ""}`,
    session,
  );
}

export function listPopularMedicines(session: ApiSession) {
  return apiFetch("/pharmacy/catalog/popular-medicines", session);
}

export function listPopularLabTests(session: ApiSession) {
  return apiFetch("/lab/catalog/popular-tests", session);
}

export function callQueueToken(
  session: ApiSession,
  queueEntryId: string,
  reason: string,
) {
  return apiFetch(`/queue/${queueEntryId}/call`, session, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function markQueueNotAvailable(
  session: ApiSession,
  queueEntryId: string,
  reason: string,
) {
  return apiFetch(`/queue/${queueEntryId}/mark-not-available`, session, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function requeueQueueToken(
  session: ApiSession,
  queueEntryId: string,
  reason: string,
  placeAtEnd: boolean,
) {
  return apiFetch(`/queue/${queueEntryId}/requeue`, session, {
    method: "POST",
    body: JSON.stringify({ reason, place_at_end: placeAtEnd }),
  });
}

export function cancelQueueToken(
  session: ApiSession,
  queueEntryId: string,
  reason: string,
) {
  return apiFetch(`/queue/${queueEntryId}/cancel`, session, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function startQueueConsultation(
  session: ApiSession,
  queueEntryId: string,
  reason: string,
) {
  return apiFetch(`/queue/${queueEntryId}/start-consultation`, session, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function createConsultation(session: ApiSession, payload: any) {
  return apiFetch("/consultations", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateConsultation(
  session: ApiSession,
  consultationId: string,
  payload: any,
) {
  return apiFetch(`/consultations/${consultationId}`, session, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function signConsultation(
  session: ApiSession,
  consultationId: string,
  signedByUserId?: string,
) {
  return apiFetch(`/consultations/${consultationId}/sign`, session, {
    method: "POST",
    body: JSON.stringify({ signed_by_user_id: signedByUserId }),
  });
}

export function addConsultationAddendum(
  session: ApiSession,
  consultationId: string,
  note: string,
  createdByUserId?: string,
) {
  return apiFetch(`/consultations/${consultationId}/addendums`, session, {
    method: "POST",
    body: JSON.stringify({ note, created_by_user_id: createdByUserId }),
  });
}
