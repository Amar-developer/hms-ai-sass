import { describe, expect, it } from "vitest";

import {
  getAppointmentQueryFields,
  getAppointmentTableSchema,
  resolveAppointmentDepartmentId,
} from "./filterSchema";

describe("appointment department filters", () => {
  it("uses the backend department_id field in the filter builder", () => {
    const schema = getAppointmentTableSchema();
    expect(schema.filters[0]?.key).toBe("department_id");
  });

  it("keeps department IDs as values and names as labels", () => {
    const fields = getAppointmentQueryFields({
      rows: [],
      filterOptions: {
        department_id: [
          { value: "department-general", label: "General Physician" },
        ],
      },
    });

    expect(fields.find((field) => field.key === "department_id")?.options).toEqual(
      [{ value: "department-general", label: "General Physician" }],
    );
  });

  it("uses the OPD header department unless a list filter overrides it", () => {
    expect(resolveAppointmentDepartmentId("header-department", "all")).toBe(
      "header-department",
    );
    expect(
      resolveAppointmentDepartmentId(
        "header-department",
        "filtered-department",
      ),
    ).toBe("filtered-department");
  });
});
