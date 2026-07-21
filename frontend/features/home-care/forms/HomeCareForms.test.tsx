// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BookingForm } from "./HomeCareForms";
import { mapPatient } from "@/lib/liveData";

const patient = mapPatient({
  id: "patient-one",
  full_name: "Alice Patient",
  patient_number: "MH-0001",
  mobile: "9876543210",
  status: "Active",
  area: "Chennai",
  address: "Anna Street",
});

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
  afterEach(cleanup);

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
    expect(
      (screen.getByPlaceholderText(
        "Patient address or manual location",
      ) as HTMLTextAreaElement).value,
    ).toBe("Anna Street, Chennai");

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

  it("clears the previous location when the next patient has no address", async () => {
    const patientWithoutAddress = mapPatient({
      id: "patient-two",
      full_name: "Bob Patient",
      patient_number: "MH-0002",
      mobile: "9999999999",
      status: "Active",
    });
    render(
      <BookingForm
        {...bookingFormProps([patient, patientWithoutAddress])}
      />,
    );

    const search = screen.getByPlaceholderText(
      "Search patient name or mobile number",
    );
    fireEvent.change(search, { target: { value: "Alice" } });
    fireEvent.click(
      await screen.findByRole("button", { name: /Alice Patient/i }),
    );
    expect(
      (screen.getByPlaceholderText(
        "Patient address or manual location",
      ) as HTMLTextAreaElement).value,
    ).toBe("Anna Street, Chennai");

    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.change(
      screen.getByPlaceholderText("Search patient name or mobile number"),
      { target: { value: "Bob" } },
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Bob Patient/i }),
    );

    expect(
      (screen.getByPlaceholderText(
        "Patient address or manual location",
      ) as HTMLTextAreaElement).value,
    ).toBe("");
  });
});
