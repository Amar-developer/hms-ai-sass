// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { PatientForm } from "./PatientForms";

const patient = {
  id: "pat_1",
  patient_number: "MHB-PAT-00024",
  full_name: "Moses Kumar",
  mobile: "7339663139",
  branch_id: "branch_1",
  gender: "male",
  age_years: 23,
  address: "Anna Street",
  status: "active",
};

const branches = [{ id: "branch_1", name: "Main Branch" }];

describe("PatientForm mobile number editing", () => {
  it("submits the number the user typed", async () => {
    const onSubmit = vi.fn();
    render(
      <PatientForm
        title="Edit Patient"
        patient={patient}
        branches={branches}
        defaultBranchId="branch_1"
        busy={false}
        error=""
        onSubmit={onSubmit}
        back={() => {}}
      />,
    );

    const fields = screen.getAllByPlaceholderText("Enter patient mobile number");
    // The form must not offer two inputs for one value.
    expect(fields).toHaveLength(1);

    fireEvent.change(fields[0], { target: { value: "9876543210" } });
    fireEvent.click(screen.getByRole("button", { name: /save|update|submit/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].mobile).toBe("9876543210");
  });
});
