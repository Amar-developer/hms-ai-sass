
export function displayTime(value: any) {
  const raw = String(value || "").slice(0, 5);
  const [hourText, minuteText = "00"] = raw.split(":");
  const hour = Number(hourText);
  if (Number.isNaN(hour)) return raw || "-";
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minuteText.padStart(2, "0")} ${period}`;
}

export function toneForQueue(status: string) {
  if (["Emergency Queue", "emergency"].includes(status)) return "red";
  if (["Called", "in_consultation"].includes(status)) return "blue";
  if (["Completed", "Done"].includes(status)) return "green";
  return "amber";
}

export function statusKey(value: any) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
}

export function appointmentDateKey(row: any) {
  return String(row.appointmentDate || row.appointment_date || "").slice(0, 10);
}

export function labTestNames(value: string) {
  return value
    .split(/,|\n/)
    .map((item: string) => item.trim())
    .filter(Boolean);
}

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

export function isQueueActionLocked(row: any) {
  const consultation = statusKey(
    row?.consultationStatus || row?.consultation_status,
  );
  return (
    !row ||
    consultation === "signed" ||
    isCompletedAppointment(row) ||
    isCancelledAppointment(row)
  );
}

export function asArray(value: any) {
  return Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
}
