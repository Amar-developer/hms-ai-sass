import { describe, expect, it } from "vitest";

import {
  buildOPDVisits,
  filterOPDVisits,
  resolveOPDVisitStatus,
} from "./visitWorkspaceAdapter";

describe("OPD visit workspace adapter", () => {
  it("joins patient and consultation data without replacing source records", () => {
    const appointment = {
      id: "appt-1",
      patient_id: "patient-1",
      practitioner_id: "doctor-1",
      appointment_date: "2026-08-13T09:30:00Z",
      queue_status: "called",
    };
    const patient = {
      id: "patient-1",
      full_name: "Rahul Nair",
      patient_number: "MH-10428",
    };
    const consultation = {
      id: "consult-1",
      appointment_id: "appt-1",
      status: "draft",
    };

    const [visit] = buildOPDVisits({
      appointments: [appointment],
      patients: [patient],
      consultations: [consultation],
    });

    expect(visit).toMatchObject({
      appointmentId: "appt-1",
      patientId: "patient-1",
      patientName: "Rahul Nair",
      patientNumber: "MH-10428",
      practitionerId: "doctor-1",
      consultationId: "consult-1",
      status: "in_consultation",
    });
    expect(visit.appointment).toBe(appointment);
    expect(visit.patient).toBe(patient);
    expect(visit.consultation).toBe(consultation);
  });

  it("uses a consistent workflow status precedence", () => {
    expect(resolveOPDVisitStatus({ queue_status: "waiting" })).toBe("waiting");
    expect(resolveOPDVisitStatus({ queue_status: "called" })).toBe("called");
    expect(resolveOPDVisitStatus({ consultation_status: "draft" })).toBe(
      "in_consultation",
    );
    expect(resolveOPDVisitStatus({ consultation_status: "signed" })).toBe(
      "completed",
    );
    expect(
      resolveOPDVisitStatus({
        status: "cancelled",
        consultation_status: "signed",
      }),
    ).toBe("cancelled");
  });

  it("filters the unified list by workspace context", () => {
    const visits = buildOPDVisits({
      appointments: [
        {
          id: "a1",
          branch_id: "b1",
          department_id: "d1",
          practitioner_id: "p1",
          appointment_date: "2026-08-13",
        },
        {
          id: "a2",
          branch_id: "b1",
          department_id: "d2",
          practitioner_id: "p2",
          appointment_date: "2026-08-14",
        },
      ],
    });

    expect(filterOPDVisits(visits, { departmentId: "d1" })).toHaveLength(1);
    expect(
      filterOPDVisits(visits, {
        branchId: "b1",
        practitionerId: "p2",
        date: "2026-08-14",
      })[0]?.appointmentId,
    ).toBe("a2");
  });
});
