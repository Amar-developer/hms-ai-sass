import { apiFetch, type ApiSession } from "@/lib/api";

export type IntelligenceDashboardFilters = {
  branchId?: string;
  query?: string;
  fromDate?: string;
  toDate?: string;
  flagKey?: string;
  category?: string;
  engagementStatus?: string;
  limit?: number;
  offset?: number;
};

export type BulkEngagementQueuePayload = {
  flag_key: string | null;
  category: string | null;
  action_key?: string | null;
  limit: number;
  dry_run: boolean;
};

export function fetchIntelligenceDashboard(
  session: ApiSession,
  filters: IntelligenceDashboardFilters = {},
) {
  const params = new URLSearchParams({
    limit: String(filters.limit ?? 20),
    offset: String(filters.offset ?? 0),
  });
  if (filters.branchId) params.set("branch_id", filters.branchId);
  if (filters.query) params.set("q", filters.query);
  if (filters.fromDate) params.set("from_date", filters.fromDate);
  if (filters.toDate) params.set("to_date", filters.toDate);
  if (filters.flagKey) params.set("flag_key", filters.flagKey);
  if (filters.category) params.set("category", filters.category);
  if (filters.engagementStatus) {
    params.set("engagement_status", filters.engagementStatus);
  }
  return apiFetch(`/patient-intelligence/dashboard?${params.toString()}`, session);
}

export function fetchPatientIntelligence(session: ApiSession, patientId: string) {
  return apiFetch(
    `/patient-intelligence/patients/${encodeURIComponent(patientId)}`,
    session,
  );
}

export function fetchIntelligenceSettings(session: ApiSession) {
  return Promise.all([
    apiFetch<any[]>("/patient-intelligence/rules", session),
    apiFetch<any>("/patient-intelligence/configuration-options", session),
    apiFetch<any[]>("/patient-intelligence/content-library", session),
  ]).then(([rules, configuration, content]) => ({
    rules: rules || [],
    configuration: configuration || {},
    content: content || [],
  }));
}

export function saveIntelligenceRule(
  session: ApiSession,
  payload: Record<string, unknown>,
  ruleId?: string,
) {
  return apiFetch(
    ruleId
      ? `/patient-intelligence/rules/${encodeURIComponent(ruleId)}`
      : "/patient-intelligence/rules",
    session,
    {
      method: ruleId ? "PATCH" : "POST",
      body: JSON.stringify(payload),
      omitIdempotencyKey: true,
    },
  );
}

export function deleteIntelligenceRule(session: ApiSession, ruleId: string) {
  return apiFetch(
    `/patient-intelligence/rules/${encodeURIComponent(ruleId)}`,
    session,
    { method: "DELETE" },
  );
}

export function recalculatePatientIntelligence(
  session: ApiSession,
  limit = 500,
) {
  return apiFetch(`/patient-intelligence/adapt-existing-data?limit=${limit}`, session, {
    method: "POST",
  });
}

export function saveIntelligenceContent(
  session: ApiSession,
  payload: Record<string, unknown>,
  contentId?: string,
) {
  return apiFetch(
    contentId
      ? `/patient-intelligence/content-library/${encodeURIComponent(contentId)}`
      : "/patient-intelligence/content-library",
    session,
    {
      method: contentId ? "PATCH" : "POST",
      body: JSON.stringify(payload),
      omitIdempotencyKey: true,
    },
  );
}

export function deleteIntelligenceContent(
  session: ApiSession,
  contentId: string,
) {
  return apiFetch(
    `/patient-intelligence/content-library/${encodeURIComponent(contentId)}`,
    session,
    { method: "DELETE" },
  );
}

export function queueRecommendedEngagementActions(
  session: ApiSession,
  payload: BulkEngagementQueuePayload,
) {
  return apiFetch("/patient-intelligence/engagement-actions/bulk-queue", session, {
    method: "POST",
    body: JSON.stringify(payload),
    omitIdempotencyKey: true,
  });
}

export function sendPatientEngagementAction(
  session: ApiSession,
  actionId: string,
) {
  return apiFetch(
    `/patient-intelligence/engagement-actions/${encodeURIComponent(actionId)}/send`,
    session,
    { method: "POST" },
  );
}

export function updateManualRefillSchedule(
  session: ApiSession,
  patientId: string,
  payload: { expected_refill_on: string | null; notes: string | null },
) {
  return apiFetch(
    `/patient-intelligence/patients/${encodeURIComponent(patientId)}/manual-refill`,
    session,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
}

export function updateManualLabSchedule(
  session: ApiSession,
  patientId: string,
  payload: {
    expected_lab_on: string | null;
    lab_test_name: string | null;
    notes: string | null;
  },
) {
  return apiFetch(
    `/patient-intelligence/patients/${encodeURIComponent(patientId)}/manual-lab`,
    session,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
}
