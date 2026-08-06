import { patientName } from "@/utils/helper";
import { LOCKED_STATUSES } from "./constants";

export {
  addDays,
  dayCount,
  plannedVisitCount,
  plannedVisitDates,
  recurrenceEndDate,
  visitDayModeOptions,
  visitWeekdayOptions,
} from "./calendar";



export function patientCode(p: any) {
  return p?.patientNumber || p?.patient_number || "";
}

export function userName(user: any) {
  return user?.full_name || user?.name || user?.email || user?.mobile || "";
}

// A booking's own assigned_staff_* fields are rarely set in practice — staff
// actually gets assigned per visit log when the service log is recorded.
// Show the most recently logged visit's staff instead of falling back to a
// generic "Staff" placeholder that looks like a real name but isn't one.
export function bookingStaffName(booking: any, staffMap: Map<string, any>) {
  if (booking?.assigned_staff_name) return booking.assigned_staff_name;
  const bookingUser = userName(staffMap?.get(booking?.assigned_staff_user_id));
  if (bookingUser) return bookingUser;
  const logs = [...(booking?.visit_logs || [])].sort(
    (a: any, b: any) =>
      new Date(b.visit_date || 0).getTime() -
      new Date(a.visit_date || 0).getTime(),
  );
  for (const log of logs) {
    if (log.assigned_staff_name) return log.assigned_staff_name;
    const logUser = userName(staffMap?.get(log.assigned_staff_user_id));
    if (logUser) return logUser;
  }
  return "Not assigned yet";
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
