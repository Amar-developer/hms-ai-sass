import { describe, expect, it } from "vitest";

import { patientSchema } from "./patient.schema";

const validPatient = {
  fullName: "Family Member",
  mobile: "9876543210",
  branchId: "branch_1",
  gender: "unknown",
  dateOfBirth: "",
  ageYears: "20",
  guardianName: "",
  guardianMobile: "",
  alternateMobile: "",
  email: "",
  area: "",
  bloodGroup: "",
  address: "Chennai",
  status: "active",
};

describe("patientSchema mobile validation", () => {
  it("allows a patient without a primary mobile to use a shared alternate", () => {
    const result = patientSchema.safeParse({
      ...validPatient,
      mobile: "",
      alternateMobile: "9876543210",
    });

    expect(result.success).toBe(true);
  });

  it("rejects the same number as primary and alternate", () => {
    const result = patientSchema.safeParse({
      ...validPatient,
      alternateMobile: validPatient.mobile,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        path: ["alternateMobile"],
        message:
          "Alternate phone number must be different from the primary mobile number",
      }),
    );
  });
});
