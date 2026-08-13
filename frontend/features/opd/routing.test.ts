import { describe, expect, it } from "vitest";

import { opdAppointmentPath } from "./routing";

describe("OPD workspace routing", () => {
  it("creates an encoded appointment selection URL", () => {
    expect(opdAppointmentPath("appointment/one two")).toBe(
      "/opd?appointment=appointment%2Fone+two",
    );
  });

  it("falls back to the OPD workspace when no appointment is supplied", () => {
    expect(opdAppointmentPath("")).toBe("/opd");
  });
});
