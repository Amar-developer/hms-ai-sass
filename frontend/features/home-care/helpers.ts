import { patientName } from "@/utils/helper";
import { LOCKED_STATUSES } from "./constants";



export function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function recurrenceEndDate(startDate: string, recurrence: string) {
  if (!startDate) return "";
  if (recurrence === "custom") return "";
  if (recurrence === "one_week") return addDays(startDate, 6);
  if (recurrence === "monthly") {
    const date = new Date(`${startDate}T00:00:00`);
    date.setMonth(date.getMonth() + 1);
    date.setDate(date.getDate() - 1);
    return date.toISOString().slice(0, 10);
  }
  return startDate;
}

export function dayCount(start: string, end: string) {
  if (!start) return 1;
  const startTime = new Date(`${start}T00:00:00`).getTime();
  const endTime = new Date(`${end || start}T00:00:00`).getTime();
  const diff = Math.round((endTime - startTime) / 86400000) + 1;
  return diff > 0 ? diff : 1;
}

export function patientCode(p: any) {
  return p?.patientNumber || p?.patient_number || "";
}

export function userName(user: any) {
  return (
    user?.full_name || user?.name || user?.email || user?.mobile || "Staff"
  );
}

export function userTypeKey(user: any) {
  const value = [
    user?.user_type,
    ...(Array.isArray(user?.roles) ? user.roles : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (value.includes("lab")) return "lab_technician";
  if (value.includes("physio")) return "physiotherapist";
  if (value.includes("doctor")) return "doctor";
  if (value.includes("nurse")) return "nurse";
  if (value.includes("reception")) return "receptionist";
  return "staff";
}

export function patientSearchLabel(patient: any) {
  if (!patient) return "";
  const detail = patientCode(patient) || patient.mobile || "";
  return detail ? `${patientName(patient)} · ${detail}` : patientName(patient);
}

export function bookingTotal(booking: any) {
  if (Array.isArray(booking?.visit_logs)) {
    return booking.visit_logs
      .filter((row: any) => row.status === "completed")
      .reduce((sum: number, row: any) => sum + Number(row.unit_amount || 0), 0);
  }
  const completedVisits = (booking?.visit_logs || []).filter(
    (row: any) => row.status === "completed",
  );
  if (completedVisits.length) {
    return completedVisits.reduce(
      (sum: number, row: any) => sum + Number(row.unit_amount || 0),
      0,
    );
  }
  return (booking?.services || []).reduce(
    (sum: number, row: any) => sum + Number(row.total_amount || 0),
    0,
  );
}


export function isBookingLocked(booking: any) {
  return LOCKED_STATUSES.includes(String(booking?.status || "").toLowerCase());
}

export function mergeServices(...groups: any[][]) {
  return Array.from(
    groups
      .flat()
      .reduce((map: Map<string, any>, service: any) => {
        if (service?.id) map.set(service.id, service);
        return map;
      }, new Map<string, any>())
      .values(),
  ).sort((a: any, b: any) =>
    String(a.name || "").localeCompare(String(b.name || "")),
  );
}

export function serviceRowsFromResponse(response: any) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

export function patientLocation(patient: any) {
  return [
    patient?.address,
    patient?.area,
    patient?.city,
    patient?.district,
    patient?.state,
    patient?.pincode,
    patient?.pin_code,
  ]
    .filter(Boolean)
    .join(", ");
}
