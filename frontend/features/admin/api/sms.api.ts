import { apiFetch, type ApiSession } from "@/lib/api";

export type SmsQueueFilters = {
  status?: string;
  flowKey?: string;
  query?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
};

export function fetchSmsSettings(session: ApiSession) {
  return apiFetch("/communications/sms/settings", session);
}

export function updateSmsSettings(
  session: ApiSession,
  payload: Record<string, unknown>,
) {
  return apiFetch("/communications/sms/settings", session, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function fetchSmsReadiness(session: ApiSession) {
  return apiFetch("/communications/sms/readiness", session);
}

export function updateSmsReadiness(
  session: ApiSession,
  payload: Record<string, unknown>,
) {
  return apiFetch("/communications/sms/readiness", session, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function sendSmsTest(
  session: ApiSession,
  payload: Record<string, unknown>,
) {
  return apiFetch("/communications/sms/test", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchSmsQueue(
  session: ApiSession,
  filters: SmsQueueFilters = {},
) {
  const params = new URLSearchParams({
    limit: String(filters.limit ?? 20),
    offset: String(filters.offset ?? 0),
  });
  if (filters.status) params.set("status_filter", filters.status);
  if (filters.flowKey) params.set("flow_key", filters.flowKey);
  if (filters.query?.trim()) params.set("q", filters.query.trim());
  if (filters.fromDate) params.set("from_date", filters.fromDate);
  if (filters.toDate) params.set("to_date", filters.toDate);
  return apiFetch(`/communications/sms/queue?${params.toString()}`, session);
}

export function updateSmsQueueItem(
  session: ApiSession,
  eventId: string,
  action: "retry" | "cancel",
) {
  return apiFetch(
    `/communications/sms/queue/${encodeURIComponent(eventId)}/${action}`,
    session,
    { method: "POST" },
  );
}

export function fetchSmsUsage(session: ApiSession) {
  return apiFetch("/communications/sms/usage", session);
}

export function fetchSmsHealth(session: ApiSession) {
  return apiFetch("/communications/sms/health", session);
}
