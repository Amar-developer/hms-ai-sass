import { describe, expect, it } from "vitest";

import { patientSchema } from "./patient.schema";

const validPatient = {
  fullName: "Family Member",
  mobile: "9876543210",
  guardianName: "",
  guardianMobile: "",
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
  smsConsentStatus: "not_recorded" as const,
  smsConsentSource: "",
  smsPreferredLanguage: "en" as const,
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

  it("allows a patient without their own mobile to use guardian mobile", () => {
    const result = patientSchema.safeParse({
      ...validPatient,
      mobile: "",
      alternateMobile: "",
      guardianName: "Parent Patient",
      guardianMobile: "9876543210",
    });

    expect(result.success).toBe(true);
  });

  it("requires primary, secondary, or guardian mobile", () => {
    const result = patientSchema.safeParse({
      ...validPatient,
      mobile: "",
      alternateMobile: "",
      guardianMobile: "",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        path: ["mobile"],
        message:
          "Primary, secondary, or guardian mobile number is required",
      }),
    );
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

describe("patientSchema SMS preference", () => {
  it("requires a source when SMS consent is recorded", () => {
    const result = patientSchema.safeParse({
      ...validPatient,
      smsConsentStatus: "opted_in",
      smsConsentSource: "",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        path: ["smsConsentSource"],
        message: "Preference source is required when SMS consent is recorded",
      }),
    );
  });

  it("accepts recorded SMS consent and a preferred language", () => {
    const result = patientSchema.safeParse({
      ...validPatient,
      smsConsentStatus: "opted_out",
      smsConsentSource: "patient_verbal",
      smsPreferredLanguage: "ta",
    });

    expect(result.success).toBe(true);
  });
});
