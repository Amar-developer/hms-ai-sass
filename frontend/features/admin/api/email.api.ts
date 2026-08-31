import { apiFetch, type ApiSession } from "@/lib/api";

export function fetchEmailSettings(session: ApiSession) {
  return apiFetch("/communications/email/settings", session);
}

export function updateEmailSettings(
  session: ApiSession,
  payload: Record<string, unknown>,
) {
  return apiFetch("/communications/email/settings", session, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function sendEmailTest(session: ApiSession, recipient: string) {
  return apiFetch("/communications/email/test", session, {
    method: "POST",
    body: JSON.stringify({ recipient }),
  });
}
