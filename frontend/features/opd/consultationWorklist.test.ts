import { describe, expect, it } from "vitest";

import {
  appointmentsInScope,
  appointmentsForVisitDate,
  pendingAppointments,
  pendingConsultationCount,
} from "./consultationWorklist";

const appointments = [
  {
    id: "waiting-match",
    branch_id: "branch-1",
    department_id: "department-1",
    appointment_date: "2026-09-02",
    queue_status: "waiting",
  },
  {
    id: "called-match",
    branchId: "branch-1",
    departmentId: "department-1",
    appointmentDate: "2026-09-01",
    queueStatus: "called",
  },
  {
    id: "completed",
    branch_id: "branch-1",
    department_id: "department-1",
    appointment_date: "2026-09-02",
    consultation_status: "signed",
  },
  {
    id: "cancelled",
    branch_id: "branch-1",
    department_id: "department-1",
    appointment_date: "2026-09-02",
    status: "cancelled",
  },
  {
    id: "another-department",
    branch_id: "branch-1",
    department_id: "department-2",
    appointment_date: "2026-09-02",
    queue_status: "waiting",
  },
  {
    id: "another-branch",
    branch_id: "branch-2",
    department_id: "department-1",
    appointment_date: "2026-09-02",
    queue_status: "waiting",
  },
];

describe("consultation worklist scope", () => {
  it("scopes appointments to the selected branch and department", () => {
    expect(
      appointmentsInScope(appointments, {
        branchId: "branch-1",
        departmentId: "department-1",
      }).map((row) => row.id),
    ).toEqual(["waiting-match", "called-match", "completed", "cancelled"]);
  });

  it("shows every department in the selected branch for All Departments", () => {
    expect(
      appointmentsInScope(appointments, {
        branchId: "branch-1",
        departmentId: "all",
      }).map((row) => row.id),
    ).toEqual([
      "waiting-match",
      "called-match",
      "completed",
      "cancelled",
      "another-department",
    ]);
  });

  it("counts only incomplete consultations in the selected branch and department", () => {
    expect(
      pendingConsultationCount(appointments, {
        branchId: "branch-1",
        departmentId: "department-1",
      }),
    ).toBe(2);
  });

  it("shows every visit date when the date filter is empty", () => {
    expect(
      appointmentsForVisitDate(appointments, "").map((row) => row.id),
    ).toEqual(appointments.map((row) => row.id));
  });

  it("filters by the exact visit date when a date is selected", () => {
    expect(
      appointmentsForVisitDate(appointments, "2026-09-01").map(
        (row) => row.id,
      ),
    ).toEqual(["called-match"]);
  });

  it("drops completed and cancelled visits from the pending list", () => {
    expect(pendingAppointments(appointments).map((row) => row.id)).toEqual([
      "waiting-match",
      "called-match",
      "another-department",
      "another-branch",
    ]);
  });

  it("keeps every pending date when no visit date is selected", () => {
    expect(
      pendingAppointments(appointmentsForVisitDate(appointments, "")).map(
        (row) => row.id,
      ),
    ).toEqual([
      "waiting-match",
      "called-match",
      "another-department",
      "another-branch",
    ]);
  });
});
