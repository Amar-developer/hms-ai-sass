// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import { BookingForm } from "./HomeCareForms";

const patient = {
  id: "patient-one",
  name: "Alice Patient",
  patientNumber: "MH-0001",
  mobile: "9876543210",
  status: "Active",
  area: "Chennai",
};

function bookingFormProps(patients = [patient]) {
  return {
    patients,
    services: [],
    visitServices: [],
    serviceLoadError: "",
    editing: null,
    branchId: "branch-one",
    busy: false,
    patientCreateBusy: false,
    lineItems: [
      {
        service_id: "",
        description: "Nursing support",
        quantity: "2",
        unit_amount: "500",
      },
    ],
    setLineItems: vi.fn(),
    onCreatePatient: vi.fn(),
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  };
}

describe("Home Care booking form draft persistence", () => {
  it("keeps the selected patient when refreshed patient data arrives", async () => {
    const props = bookingFormProps();
    const { rerender } = render(<BookingForm {...props} />);

    fireEvent.change(
      screen.getByPlaceholderText("Search patient name or mobile number"),
      { target: { value: "Alice" } },
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Alice Patient/i }),
    );

    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();

    // Focus/tab refreshes replace the patients array even when its records are
    // unchanged. This must refresh the selected row rather than reset it.
    rerender(
      <BookingForm
        {...props}
        patients={[{ ...patient, area: "Updated Chennai" }]}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Change" })).toBeTruthy(),
    );
    expect(screen.getByText("Alice Patient")).toBeTruthy();
    expect(screen.getByText(/MH-0001/)).toBeTruthy();
  });
});
