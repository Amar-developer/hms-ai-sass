import { describe, expect, it } from "vitest";

import { filterOPDWorklistRows } from "./OPDPatientWorklist";

const rows = [
  {
    id: "a1",
    patient_id: "p1",
    patient: "Rahul Nair",
    token: "A13",
    queue_status: "waiting",
  },
  {
    id: "a2",
    patient_id: "p2",
    patient: "Meena Rajan",
    token: "A12",
    queue_status: "called",
  },
  {
    id: "a3",
    patient_id: "p3",
    patient: "Priya Menon",
    token: "A10",
    consultation_status: "signed",
  },
  {
    id: "a4",
    patient_id: "p4",
    patient: "Cancelled Visit",
    status: "cancelled",
  },
];

const patients = new Map([
  ["p1", { full_name: "Rahul Nair", mobile: "9876543210" }],
  ["p2", { full_name: "Meena Rajan", patient_number: "MH-200" }],
]);

describe("OPD patient worklist", () => {
  it("keeps waiting and called patients in the active list", () => {
    expect(
      filterOPDWorklistRows(rows, "active", "", patients).map(
        (row) => row.id,
      ),
    ).toEqual(["a1", "a2"]);
  });

  it("groups called and in-consultation visits together", () => {
    expect(
      filterOPDWorklistRows(rows, "called", "", patients).map(
        (row) => row.id,
      ),
    ).toEqual(["a2"]);
  });

  it("searches token and referenced patient details", () => {
    expect(filterOPDWorklistRows(rows, "all", "A13", patients)[0]?.id).toBe(
      "a1",
    );
    expect(
      filterOPDWorklistRows(rows, "all", "MH-200", patients)[0]?.id,
    ).toBe("a2");
    expect(
      filterOPDWorklistRows(rows, "all", "9876543210", patients)[0]?.id,
    ).toBe("a1");
  });
});
