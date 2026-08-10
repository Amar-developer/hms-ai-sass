// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PatientFlagBadges } from "./PatientFlagBadges";

describe("PatientFlagBadges", () => {
  afterEach(cleanup);

  it("uses stable unique tier colors and hides operational flags", () => {
    render(
      <PatientFlagBadges
        maxVisible={3}
        flags={[
          { flag_key: "PREMIUM_PATIENT", category: "value", label: "Premium", background_color: "#ede9fe", text_color: "#5b21b6", border_color: "#c4b5fd", priority: 10 },
          { flag_key: "GOLD_PATIENT", category: "value", label: "Gold", background_color: "#fef3c7", text_color: "#92400e", border_color: "#fcd34d", priority: 20 },
          { flag_key: "SILVER_PATIENT", category: "value", label: "Silver", background_color: "#f1f5f9", text_color: "#334155", border_color: "#cbd5e1", priority: 30 },
          { flag_key: "REFILL_DUE", category: "care_operational" },
        ]}
      />,
    );

    expect(screen.getByText("Premium").getAttribute("style")).toContain("rgb(237, 233, 254)");
    expect(screen.getByText("Gold").getAttribute("style")).toContain("rgb(254, 243, 199)");
    expect(screen.getByText("Silver").getAttribute("style")).toContain("rgb(241, 245, 249)");
    expect(screen.queryByText("Refill Due")).toBeNull();
    expect(screen.queryByText("+1")).toBeNull();
  });
});
