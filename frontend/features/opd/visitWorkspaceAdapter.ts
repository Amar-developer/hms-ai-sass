import { useMemo } from "react";

export type OPDVisitStatus =
  | "scheduled"
  | "waiting"
  | "called"
  | "in_consultation"
  | "completed"
  | "cancelled";

export type OPDVisitRecord = {
  id: string;
  appointmentId: string;
  patientId: string;
  patientName: string;
  patientNumber: string;
  practitionerId: string;
  practitionerName: string;
  branchId: string;
  departmentId: string;
  appointmentDate: string;
  appointmentTime: string;
  visitType: string;
  token: string;
  queueStatus: string;
  consultationId: string;
  consultationStatus: string;
  status: OPDVisitStatus;
  appointment: any;
  patient: any | null;
  consultation: any | null;
};

type BuildOPDVisitsInput = {
  appointments?: any[];
  patients?: any[];
  consultations?: any[];
};

type OPDVisitFilters = {
  branchId?: string;
  departmentId?: string;
  practitionerId?: string;
  date?: string;
};

function normalized(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function recordDate(value: unknown) {
  return String(value || "").slice(0, 10);
}

export function resolveOPDVisitStatus(appointment: any): OPDVisitStatus {
  const appointmentStatus = normalized(
    appointment.status || appointment.appointment_status,
  );
  const queueStatus = normalized(
    appointment.queueStatus || appointment.queue_status,
  );
  const consultationStatus = normalized(
    appointment.consultationStatus || appointment.consultation_status,
  );

  if (
    appointmentStatus === "cancelled" ||
    appointmentStatus === "canceled" ||
    appointmentStatus === "no_show"
  ) {
    return "cancelled";
  }
  if (
    consultationStatus === "signed" ||
    consultationStatus === "completed" ||
    appointmentStatus === "completed" ||
    appointmentStatus === "consultation_completed"
  ) {
    return "completed";
  }
  if (
    consultationStatus === "draft" ||
    consultationStatus === "in_progress" ||
    appointmentStatus === "in_consultation" ||
    queueStatus === "in_consultation"
  ) {
    return "in_consultation";
  }
  if (queueStatus === "called" || appointmentStatus === "called") {
    return "called";
  }
  if (
    ["waiting", "requeued", "checked_in", "priority_waiting"].includes(
      queueStatus,
    ) ||
    ["waiting", "checked_in"].includes(appointmentStatus)
  ) {
    return "waiting";
  }
  return "scheduled";
}

/**
 * Creates one read model for the OPD screen without changing the appointment,
 * queue, patient, or consultation source records. Appointment ID remains the
 * stable workspace key and the original records stay available to existing
 * actions.
 */
export function buildOPDVisits({
  appointments = [],
  patients = [],
  consultations = [],
}: BuildOPDVisitsInput): OPDVisitRecord[] {
  const patientsById = new Map(
    patients.map((patient) => [String(patient.id), patient]),
  );
  const consultationsByAppointmentId = new Map(
    consultations
      .filter((consultation) => consultation.appointment_id)
      .map((consultation) => [
        String(consultation.appointment_id),
        consultation,
      ]),
  );

  return appointments.map((appointment) => {
    const appointmentId = String(appointment.id || "");
    const patientId = String(
      appointment.patientId || appointment.patient_id || "",
    );
    const patient = patientsById.get(patientId) || null;
    const consultation =
      consultationsByAppointmentId.get(appointmentId) || null;
    const consultationId = String(
      appointment.consultationId ||
        appointment.consultation_id ||
        consultation?.id ||
        "",
    );
    const merged = consultation
      ? {
          ...appointment,
          consultationStatus:
            appointment.consultationStatus || consultation.status,
        }
      : appointment;

    return {
      id: appointmentId,
      appointmentId,
      patientId,
      patientName: String(
        patient?.full_name ||
          patient?.name ||
          appointment.patient_name ||
          appointment.patient ||
          "Unknown patient",
      ),
      patientNumber: String(
        patient?.patient_number || appointment.patient_number || "",
      ),
      practitionerId: String(
        appointment.doctorId || appointment.practitioner_id || "",
      ),
      practitionerName: String(
        appointment.doctor || appointment.practitioner_name || "Unassigned",
      ),
      branchId: String(appointment.branchId || appointment.branch_id || ""),
      departmentId: String(
        appointment.departmentId || appointment.department_id || "",
      ),
      appointmentDate: recordDate(
        appointment.appointmentDate || appointment.appointment_date,
      ),
      appointmentTime: String(
        appointment.appointmentTime || appointment.appointment_time || "",
      ),
      visitType: String(
        appointment.visitType ||
          appointment.appointmentType ||
          appointment.appointment_type ||
          "op",
      ),
      token: String(appointment.token || appointment.token_number || ""),
      queueStatus: String(
        appointment.queueStatus || appointment.queue_status || "",
      ),
      consultationId,
      consultationStatus: String(
        appointment.consultationStatus ||
          appointment.consultation_status ||
          consultation?.status ||
          "",
      ),
      status: resolveOPDVisitStatus(merged),
      appointment,
      patient,
      consultation,
    };
  });
}

export function filterOPDVisits(
  visits: OPDVisitRecord[],
  filters: OPDVisitFilters,
) {
  return visits.filter(
    (visit) =>
      (!filters.branchId || visit.branchId === filters.branchId) &&
      (!filters.departmentId ||
        visit.departmentId === filters.departmentId) &&
      (!filters.practitionerId ||
        visit.practitionerId === filters.practitionerId) &&
      (!filters.date || visit.appointmentDate === filters.date),
  );
}

export function useOPDVisits(
  input: BuildOPDVisitsInput,
  filters: OPDVisitFilters = {},
) {
  const visits = useMemo(
    () => buildOPDVisits(input),
    [input.appointments, input.patients, input.consultations],
  );

  return useMemo(
    () => filterOPDVisits(visits, filters),
    [
      visits,
      filters.branchId,
      filters.departmentId,
      filters.practitionerId,
      filters.date,
    ],
  );
}
