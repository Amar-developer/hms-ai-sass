import { describe, expect, it } from "vitest";

import { patientSchema } from "./patient.schema";

const validPatient = {
  fullName: "Family Member",
  mobile: "9876543210",
  branchId: "branch_1",
  gender: "unknown",
  dateOfBirth: "",
  ageYears: "20",
  alternateMobile: "",
  email: "",
  area: "",
  bloodGroup: "",
  address: "Chennai",
  status: "active",
  whatsappConsentStatus: "not_recorded" as const,
  whatsappConsentSource: "",
  whatsappPreferredLanguage: "en" as const,
};

describe("patientSchema mobile validation", () => {
  it("allows a patient without a primary mobile to use a secondary mobile", () => {
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
          "Secondary mobile number must be different from the primary mobile number",
      }),
    );
  });
});

describe("patientSchema WhatsApp preference", () => {
  it("keeps the preference source optional for an explicit opt-out", () => {
    const result = patientSchema.safeParse({
      ...validPatient,
      whatsappConsentStatus: "opted_out",
      whatsappConsentSource: "",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a supported preferred message language", () => {
    const result = patientSchema.safeParse({
      ...validPatient,
      whatsappPreferredLanguage: "ta",
    });

    expect(result.success).toBe(true);
  });
});
