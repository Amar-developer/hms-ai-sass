import { apiFetch, ApiSession } from "@/lib/api";

export async function changePassword(
  session: ApiSession,
  payload: {
    currentPassword: string;
    newPassword: string;
  },
) {
  return apiFetch("/auth/change-password", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
