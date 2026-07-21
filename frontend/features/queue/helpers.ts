export function dateKey(value: any) {
  return String(value || "").slice(0, 10);
}

export function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function tokenSortValue(row: any) {
  return String(row.token_number || row.token || "").trim();
}

export function sortByTokenNumber(rows: any[]) {
  return [...rows].sort((a: any, b: any) =>
    tokenSortValue(a).localeCompare(tokenSortValue(b), undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

export function isActiveQueueStatus(value: any) {
  const status = String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
  return ![
    "cancelled",
    "canceled",
    "no_show",
    "consultation_completed",
    "billed",
    "completed",
    "done",
  ].includes(status);
}

export function isActiveQueueAppointment(appointment: any) {
  return (
    isActiveQueueStatus(appointment.queueStatus || appointment.queue_status) &&
    isActiveQueueStatus(appointment.status) &&
    isActiveQueueStatus(
      appointment.consultationStatus || appointment.consultation_status,
    ) &&
    String(
      appointment.consultationStatus || appointment.consultation_status || "",
    )
      .trim()
      .toLowerCase() !== "signed"
  );
}

export function sortByQueuePosition(rows: any[]) {
  return [...rows].sort((a: any, b: any) => {
    const aPosition = Number(a.queuePosition || a.queue_position || 0);
    const bPosition = Number(b.queuePosition || b.queue_position || 0);
    if (aPosition > 0 && bPosition > 0 && aPosition !== bPosition)
      return aPosition - bPosition;
    if (aPosition > 0 && bPosition <= 0) return -1;
    if (bPosition > 0 && aPosition <= 0) return 1;
    return tokenSortValue(a).localeCompare(tokenSortValue(b), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}
