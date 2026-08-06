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

  // Cancelled
  if (status === "cancelled" || status === "no_show" || queue === "cancelled") {
    return {
      key: "cancelled",
      label: "Cancelled",
      tone: "red" as const,
      order: 6,
    };
  }

  // Completed
  if (
    consult === "signed" ||
    status === "consultation_completed" ||
    status === "billed" ||
    queue === "completed" ||
    queue === "consultation_completed"
  ) {
    return {
      key: "consultation_completed",
      label: "Completed",
      tone: "green" as const,
      order: 5,
    };
  }

  // In Consultation
  if (
    queue === "in_consultation" ||
    consult === "in_consultation" ||
    status === "in_consultation"
  ) {
    return {
      key: "in_consultation",
      label: "In Consultation",
      tone: "blue" as const,
      order: 4,
    };
  }

  // Called
  if (queue === "called" || status === "called") {
    return {
      key: "called",
      label: "Called",
      tone: "amber" as const,
      order: 3,
    };
  }

  // Requeued
  if (queue === "requeued" || status === "requeued") {
    return {
      key: "requeued",
      label: "Requeued",
      tone: "orange" as const,
      order: 2,
    };
  }

  // Waiting (default)
  if (
    queue === "waiting" ||
    status === "waiting" ||
    (!queue && !consult && !status)
  ) {
    return {
      key: "waiting",
      label: "Waiting",
      tone: "slate" as const,
      order: 1,
    };
  }

  // Fallback
  return {
    key: "active",
    label: humanizeOptionLabel(queue || consult || status) || "Active",
    tone: "slate" as const,
    order: 0,
  };
}

export function calculateBMI(weightKg: number, heightCm: number): number {
  if (
    !Number.isFinite(weightKg) ||
    !Number.isFinite(heightCm) ||
    weightKg <= 0 ||
    heightCm <= 0
  ) {
    return 0;
  }

  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);

  return Number(bmi.toFixed(1));
}
