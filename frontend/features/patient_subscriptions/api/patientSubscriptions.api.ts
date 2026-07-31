import { apiFetch, type ApiSession } from "@/lib/api";

export function listPlans(session: ApiSession) {
  return apiFetch(
    "/patient-subscriptions/plans?include_inactive=true",
    session,
  );
}

export function listEnrollments(session: ApiSession) {
  return apiFetch("/patient-subscriptions/enrollments", session);
}

export function listLabTests(session: ApiSession) {
  return apiFetch("/lab/catalog/tests", session);
}

export function listMedicines(session: ApiSession, branchId?: string) {
  return apiFetch(
    `/pharmacy/medicines?branch_id=${encodeURIComponent(branchId || "")}`,
    session,
  );
}

export function listDepartments(session: ApiSession, tenantId: string) {
  return apiFetch(`/tenants/${tenantId}/departments`, session);
}

export function createLabTest(session: ApiSession, payload: any) {
  return apiFetch("/lab/catalog/tests", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createMedicine(session: ApiSession, payload: any) {
  return apiFetch("/pharmacy/medicines", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createPlan(session: ApiSession, payload: any) {
  return apiFetch("/patient-subscriptions/plans", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updatePlan(session: ApiSession, planId: string, payload: any) {
  return apiFetch(`/patient-subscriptions/plans/${planId}`, session, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deletePlan(session: ApiSession, planId: string) {
  return apiFetch(`/patient-subscriptions/plans/${planId}`, session, {
    method: "DELETE",
  });
}

export function createEnrollment(session: ApiSession, payload: any) {
  return apiFetch("/patient-subscriptions/enrollments", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateEnrollment(
  session: ApiSession,
  enrollmentId: string,
  payload: any,
) {
  return apiFetch(
    `/patient-subscriptions/enrollments/${enrollmentId}`,
    session,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}
