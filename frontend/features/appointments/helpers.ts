import { humanizeOptionLabel } from "@/lib/options";

export function formatDisplayTime(value: any) {
  const raw = String(value || "").slice(0, 5);
  const [hourText, minuteText = "00"] = raw.split(":");
  const hour = Number(hourText);
  if (Number.isNaN(hour)) return raw || "-";
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minuteText.padStart(2, "0")} ${period}`;
}

export function parseIntakeVitalsText(vitals: string) {
  const byName: Record<string, string> = {};
  String(vitals || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const [name, ...rest] = item.split("=");
      if (!name?.trim()) return;
      byName[name.trim().toLowerCase()] = rest.join("=").trim();
    });
  return byName;
}




export function appointmentStatusInfo(appointment: any) {
  const consult = String(
    appointment.consultationStatus || appointment.consultation_status || "",
  ).toLowerCase();
  const status = String(appointment.status || "").toLowerCase();
  const queue = String(
    appointment.queueStatus || appointment.queue_status || "",
  ).toLowerCase();
  if (status === "cancelled" || status === "no_show" || queue === "cancelled")
    return {
      key: "cancelled",
      label: "Cancelled",
      tone: "red" as const,
      order: 1,
    };
  if (
    consult === "signed" ||
    status === "consultation_completed" ||
    status === "billed" ||
    queue === "completed" ||
    queue === "consultation_completed"
  )
    return {
      key: "completed",
      label: "Completed",
      tone: "green" as const,
      order: 2,
    };
  return {
    key: "active",
    label: humanizeOptionLabel(queue || consult || status) || "Waiting",
    tone: "slate" as const,
    order: 0,
  };
}
