import { apiFetch, type ApiSession } from "@/lib/api";

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
