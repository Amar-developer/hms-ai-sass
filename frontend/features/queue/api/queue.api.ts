import { apiFetch, type ApiSession } from "@/lib/api";
import { QueueAction } from "../types";

export function fetchDisplayMode(session: ApiSession, displayMode: string) {
  return apiFetch(`/queue/display?display_mode=${displayMode}`, session);
}

export function updateQueueStatus(
  session: ApiSession,
  queueEntryId: string,
  action: "call" | "skip" | "requeue" | "cancel",
  payload?: Record<string, unknown>,
) {
  const endpoint =
    action === "call"
      ? `/queue/${queueEntryId}/call`
      : action === "skip"
        ? `/queue/${queueEntryId}/mark-not-available`
        : action === "requeue"
          ? `/queue/${queueEntryId}/requeue`
          : `/queue/${queueEntryId}/cancel`;

  return apiFetch(endpoint, session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelRemainingQueueTokens(
  session: ApiSession,
  queueEntryIds: string[],
  reason: string,
  actorUserId?: string,
) {
  const results = await Promise.allSettled(
    queueEntryIds.map((id) =>
      apiFetch(`/queue/${id}/cancel`, session, {
        method: "POST",
        body: JSON.stringify({
          reason: reason || "End-of-day manual close by reception",
          actor_user_id: actorUserId,
        }),
      }),
    ),
  );
  const failed = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failed.length) {
    throw new Error(
      `${failed.length} of ${queueEntryIds.length} token(s) could not be cancelled: ${
        failed[0].reason?.message || failed[0].reason
      }`,
    );
  }
  return results;
}
