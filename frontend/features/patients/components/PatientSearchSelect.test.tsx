// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import { PatientSearchSelect } from "./PatientSearchSelect";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const apiFetchMock = vi.mocked(apiFetch);
const apiSession = {
  tenantId: "tenant-one",
  email: "staff@example.com",
  user: { id: "user-one" },
};

describe("PatientSearchSelect", () => {
  beforeEach(() => apiFetchMock.mockReset());
  afterEach(cleanup);

  it("searches the tenant API and submits the selected patient ID", async () => {
    apiFetchMock.mockResolvedValue([
      {
        id: "patient-44",
        full_name: "Amarnath",
        patient_number: "MHB-PAT-00044",
        mobile: "7339663139",
        status: "active",
      },
    ]);
    const onChange = vi.fn();

    const view = render(
      <PatientSearchSelect
        apiSession={apiSession}
        name="patient_id"
        value=""
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select patient" }));
    fireEvent.change(
      screen.getByPlaceholderText("Search name, patient ID, or mobile"),
      { target: { value: "Amarnath" } },
    );

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(apiFetchMock.mock.calls[0][0]).toContain(
      "/patients?q=Amarnath&active_only=true&limit=20",
    );
    fireEvent.click(await screen.findByRole("button", { name: /Amarnath/i }));

    expect(onChange).toHaveBeenCalledWith("patient-44");
    view.rerender(
      <PatientSearchSelect
        apiSession={apiSession}
        name="patient_id"
        value="patient-44"
        onChange={onChange}
      />,
    );
    expect(
      (view.container.querySelector(
        'input[name="patient_id"]',
      ) as HTMLInputElement)
        .value,
    ).toBe("patient-44");
  });
});
