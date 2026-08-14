import type { OPDSection } from "./OPDWorkspace";

export function opdAppointmentPath(appointmentId: unknown) {
  const id = String(appointmentId || "").trim();
  if (!id) return "/opd";
  return `/opd?${new URLSearchParams({ appointment: id }).toString()}`;
}

export function opdSectionFromSegment(segment: unknown): OPDSection {
  switch (String(segment || "")) {
    case "new":
      return "new";
    case "appointments":
      return "appointments";
    case "schedule":
      return "schedule";
    case "lab-services":
      return "lab-services";
    case "prescriptions":
      return "prescriptions";
    case "billing":
    case "invoices":
      return "invoices";
    case "payments":
      return "payments";
    case "templates":
      return "templates";
    default:
      return "consultation";
  }
}
