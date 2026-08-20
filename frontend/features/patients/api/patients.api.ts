import { apiFetch, apiUpload, type ApiSession } from "@/lib/api";

export function fetchTenants(session: ApiSession) {
  return apiFetch("/tenants", session);
}

export function fetchPatientsPage(session: ApiSession, params: URLSearchParams) {
  return apiFetch(`/patients/page?${params.toString()}`, session);
}

export function fetchPatientFilterOptions(
  session: ApiSession,
  params: URLSearchParams,
) {
  return apiFetch(`/patients/filter-options?${params.toString()}`, session);
}

export function fetchPatient(session: ApiSession, patientId: string) {
  return apiFetch(`/patients/${patientId}`, session);
}

export function fetchPatientSummary(session: ApiSession, patientId: string) {
  return apiFetch(`/patients/${patientId}/summary`, session);
}

export function fetchPatientConsultations(session: ApiSession, patientId: string) {
  return apiFetch(`/consultations?patient_id=${patientId}&limit=50`, session);
}

export function fetchPatientLabOrders(session: ApiSession, patientId: string) {
  return apiFetch(`/lab/orders?patient_id=${patientId}&limit=50`, session);
}

export function fetchPatientPharmacyIssues(
  session: ApiSession,
  patientId: string,
) {
  return apiFetch(
    `/pharmacy/issues?patient_id=${patientId}&limit=50`,
    session,
  );
}

export function fetchPatientPhysioCases(
  session: ApiSession,
  patientId: string,
  options?: any,
) {
  return apiFetch(
    `/physiotherapy/cases?patient_id=${patientId}&limit=50`,
    session,
    options,
  );
}

export function fetchPatientIpAdmissions(
  session: ApiSession,
  patientId: string,
  options?: any,
) {
  return apiFetch(
    `/ip/admissions?patient_id=${patientId}&limit=50`,
    session,
    options,
  );
}

export function fetchMembershipPlans(session: ApiSession) {
  return apiFetch(
    "/patient-subscriptions/plans?include_inactive=true",
    session,
  );
}

export function fetchMembershipEnrollments(
  session: ApiSession,
  patientId: string,
) {
  return apiFetch(
    `/patient-subscriptions/enrollments?patient_id=${patientId}`,
    session,
  );
}

export function fetchPatientInvoices(session: ApiSession, patientId: string) {
  return apiFetch(`/billing/invoices?patient_id=${patientId}`, session);
}

export function fetchFamilyRelationships(
  session: ApiSession,
  patientId: string,
) {
  return apiFetch(`/patients/${patientId}/family-relationships`, session);
}

export function fetchPatientIntelligence(
  session: ApiSession,
  patientId: string,
) {
  return apiFetch(`/patient-intelligence/patients/${patientId}`, session);
}

export function createPatient(session: ApiSession, payload: any) {
  return apiFetch("/patients", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updatePatient(
  session: ApiSession,
  patientId: string,
  payload: any,
) {
  return apiFetch(`/patients/${patientId}`, session, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deletePatient(session: ApiSession, patientId: string) {
  return apiFetch(`/patients/${patientId}`, session, { method: "DELETE" });
}

export function uploadPatientPhoto(
  session: ApiSession,
  patientId: string,
  formData: FormData,
) {
  return apiUpload(`/patients/${patientId}/photo`, session, formData);
}

export function sendEngagementAction(session: ApiSession, actionId: string) {
  return apiFetch(
    `/patient-intelligence/engagement-actions/${actionId}/send`,
    session,
    { method: "POST" },
  );
}

export function saveManualRefill(
  session: ApiSession,
  patientId: string,
  payload: any,
) {
  return apiFetch(
    `/patient-intelligence/patients/${patientId}/manual-refill`,
    session,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
}

export function saveManualLab(
  session: ApiSession,
  patientId: string,
  payload: any,
) {
  return apiFetch(
    `/patient-intelligence/patients/${patientId}/manual-lab`,
    session,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
}

export function enrollMembership(session: ApiSession, payload: any) {
  return apiFetch("/patient-subscriptions/enrollments", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createFamilyRelationship(
  session: ApiSession,
  patientId: string,
  payload: any,
) {
  return apiFetch(`/patients/${patientId}/family-relationships`, session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteFamilyRelationship(
  session: ApiSession,
  patientId: string,
  relationshipId: string,
) {
  return apiFetch(
    `/patients/${patientId}/family-relationships/${relationshipId}`,
    session,
    { method: "DELETE" },
  );
}
