import { apiFetch, type ApiSession } from "@/lib/api";

export type WhatsAppQueueFilters = {
  status?: string;
  flowKey?: string;
  query?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
};

export function fetchWhatsAppSettings(session: ApiSession) {
  return apiFetch("/communications/whatsapp/settings", session);
}

export function updateWhatsAppSettings(
  session: ApiSession,
  payload: Record<string, unknown>,
) {
  return apiFetch("/communications/whatsapp/settings", session, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function sendWhatsAppTest(
  session: ApiSession,
  payload: Record<string, unknown>,
) {
  return apiFetch("/communications/whatsapp/test", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchWhatsAppQueue(
  session: ApiSession,
  filters: WhatsAppQueueFilters = {},
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
  return apiFetch(`/communications/whatsapp/queue?${params.toString()}`, session);
}

export function updateWhatsAppQueueItem(
  session: ApiSession,
  eventId: string,
  action: "retry" | "cancel",
) {
  return apiFetch(
    `/communications/whatsapp/queue/${encodeURIComponent(eventId)}/${action}`,
    session,
    { method: "POST" },
  );
}
