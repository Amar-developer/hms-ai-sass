import { displayDate as formatDisplayDate } from "@/utils/helper";

export function displayTime(value: any) {
  const raw = String(value || "").slice(0, 5);
  const [hourText, minuteText = "00"] = raw.split(":");
  const hour = Number(hourText);
  if (Number.isNaN(hour)) return raw || "-";
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minuteText.padStart(2, "0")} ${period}`;
}

export function displayDate(value: any) {
  return value ? formatDisplayDate(value, String(value)) : "Today";
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

export function asArray(value: any) {
  return Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
}

export function splitRows(value: string) {
  return value
    .split("\n")
    .map((line: string) => line.trim())
    .filter(Boolean);
}

export function appendLine(value: string, line: string) {
  return [...splitRows(value), line].join("\n");
}
export function labTestNames(value: string) {
  return value
    .split(/,|\n/)
    .map((item: string) => item.trim())
    .filter(Boolean);
}
