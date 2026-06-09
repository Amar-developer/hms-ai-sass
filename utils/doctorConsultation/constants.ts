import { statusKey } from "./helpers";

export function isWaitingAppointment(row: any) {
  const status = statusKey(row.status);
  const queue = statusKey(row.queueStatus || row.queue_status);
  return (
    [
      "scheduled",
      "confirmed",
      "checked_in",
      "waiting",
      "called",
      "patient_not_available",
      "requeued",
      "in_consultation",
      "in_queue",
      "emergency_queue",
    ].includes(status) ||
    [
      "scheduled",
      "confirmed",
      "checked_in",
      "waiting",
      "called",
      "patient_not_available",
      "requeued",
      "in_consultation",
      "in_queue",
      "emergency_queue",
    ].includes(queue)
  );
}


export function isCompletedAppointment(row: any) {
  const status = statusKey(row.status);
  const queue = statusKey(row.queueStatus || row.queue_status);
  const consultation = statusKey(
    row.consultationStatus || row.consultation_status,
  );
  return (
    [
      "consultation_completed",
      "billed",
      "consultation_done",
      "seen",
      "completed",
      "done",
    ].includes(status) ||
    [
      "consultation_completed",
      "billed",
      "consultation_done",
      "seen",
      "completed",
      "done",
    ].includes(queue) ||
    consultation === "signed"
  );
}

export function isCancelledAppointment(row: any) {
  const status = statusKey(row.status);
  const queue = statusKey(row.queueStatus || row.queue_status);
  return (
    ["cancelled", "canceled", "no_show"].includes(status) ||
    ["cancelled", "canceled", "no_show"].includes(queue)
  );
}