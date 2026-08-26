// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MembershipBenefitUsageModal } from "./MembershipBenefitUsageModal";

describe("MembershipBenefitUsageModal", () => {
  it("enables saving for a two-character reason", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(
      <MembershipBenefitUsageModal
        enrollment={{
          id: "ptsub-1",
          patient_name: "Moses Kumar",
          used_consultations: 1,
          plan: {
            name: "Smart Care Plan",
            free_consultations: 1,
            free_lab_test_quantities: {},
            free_medicine_quantities: {},
          },
        }}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    const saveButton = await screen.findByRole("button", { name: "Save usage" });
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Reason for correction"), {
      target: { value: "hi" },
    });
    expect((saveButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ id: "ptsub-1" }),
        expect.objectContaining({ reason: "hi", used_consultations: 1 }),
      ),
    );
    expect(onClose).toHaveBeenCalled();
  });
});
