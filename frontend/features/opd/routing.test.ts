import { describe, expect, it } from "vitest";

import { opdAppointmentPath, opdSectionFromSegment } from "./routing";

describe("OPD workspace routing", () => {
  it("creates an encoded appointment selection URL", () => {
    expect(opdAppointmentPath("appointment/one two")).toBe(
      "/opd?appointment=appointment%2Fone+two",
    );
  });

  it("falls back to the OPD workspace when no appointment is supplied", () => {
    expect(opdAppointmentPath("")).toBe("/opd");
  });

  it("maps consultation-generated lab and prescription tabs", () => {
    expect(opdSectionFromSegment("lab-services")).toBe("lab-services");
    expect(opdSectionFromSegment("prescriptions")).toBe("prescriptions");
  });

  it("supports the billing tab route and legacy invoices route", () => {
    expect(opdSectionFromSegment("billing")).toBe("invoices");
    expect(opdSectionFromSegment("invoices")).toBe("invoices");
  });

  it("supports the payments tab route", () => {
    expect(opdSectionFromSegment("payments")).toBe("payments");
  });
});
