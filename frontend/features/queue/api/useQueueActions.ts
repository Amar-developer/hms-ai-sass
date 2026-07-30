import { useState } from "react";
import { updateQueueStatus, cancelRemainingQueueTokens } from "./queue.api";

import type { ApiSession } from "@/lib/api";

export function useQueueActions(session?: ApiSession) {
  const [busyId, setBusyId] = useState("");

  async function transition(appointment: any, action: any) {
    if (!session) return;

    setBusyId(appointment.id);

    try {
      await updateQueueStatus(session, appointment.queueEntryId, action, {
        reason: "Updated from MedizinHub web app",
        actor_user_id: session.user?.id,
      });
    } finally {
      setBusyId("");
    }
  }
  async function cancelRemaining(queueEntryIds: string[], reason: string) {
    if (!session) return;

    setBusyId("end-of-day");

    try {
      await cancelRemainingQueueTokens(
        session,
        queueEntryIds,
        reason,
        session.user?.id,
      );
    } finally {
      setBusyId("");
    }
  }

  return {
    busyId,
    transition,
    cancelRemaining,
  };
}
