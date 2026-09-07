import {
  appointmentDateKey,
  isCancelledAppointment,
  isCompletedAppointment,
} from "@/features/consulation/helpers";

type ConsultationScope = {
  branchId?: string;
  departmentId?: string;
};

export function pendingConsultationCount(
  appointments: any[],
  scope: ConsultationScope,
) {
  return pendingAppointments(appointmentsInScope(appointments, scope)).length;
}

export function appointmentsInScope(
  appointments: any[],
  { branchId = "", departmentId = "" }: ConsultationScope,
) {
  return appointments.filter((appointment) => {
    const appointmentBranchId =
      appointment.branchId || appointment.branch_id || "";
    const appointmentDepartmentId =
      appointment.departmentId || appointment.department_id || "";

    return (
      (!branchId || appointmentBranchId === branchId) &&
      (!departmentId ||
        departmentId === "all" ||
        appointmentDepartmentId === departmentId)
    );
  });
}

export function pendingAppointments(appointments: any[]) {
  return appointments.filter(
    (appointment) =>
      !isCompletedAppointment(appointment) &&
      !isCancelledAppointment(appointment),
  );
}

export function appointmentsForVisitDate(
  appointments: any[],
  selectedDate: string,
) {
  if (!selectedDate) return appointments;
  return appointments.filter(
    (appointment) => appointmentDateKey(appointment) === selectedDate,
  );
}
