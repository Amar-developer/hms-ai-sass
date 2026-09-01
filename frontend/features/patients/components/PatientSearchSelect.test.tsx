// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LIVE_DATA_CHANGED_EVENT, apiFetch } from "@/lib/api";
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
        intelligence_flags: [
          { flag_key: "PREMIUM_PATIENT", category: "value", severity: "high", label: "Premium", background_color: "#ede9fe", text_color: "#5b21b6", border_color: "#c4b5fd", priority: 10 },
          { flag_key: "ACTIVE_PATIENT", category: "engagement", severity: "positive" },
        ],
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
    const resultOption = await screen.findByRole("button", { name: /Amarnath/i });
    expect(screen.getByText("Premium")).toBeTruthy();
    expect(screen.queryByText("Active")).toBeNull();
    fireEvent.click(resultOption);

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

  it("invalidates cached search results after a patient is created", async () => {
    apiFetchMock
      .mockResolvedValueOnce([
        {
          id: "patient-old",
          full_name: "Search Refresh Old",
          patient_number: "MHB-PAT-00045",
          status: "active",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "patient-new",
          full_name: "Search Refresh New",
          patient_number: "MHB-PAT-00046",
          status: "active",
        },
      ]);

    render(
      <PatientSearchSelect apiSession={apiSession} value="" onChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Select patient" }));
    fireEvent.change(
      screen.getByPlaceholderText("Search name, patient ID, or mobile"),
      { target: { value: "Search Refresh" } },
    );
    await screen.findByRole("button", { name: /Search Refresh Old/i });

    window.dispatchEvent(
      new CustomEvent(LIVE_DATA_CHANGED_EVENT, {
        detail: { tenantId: "tenant-one", path: "/patients" },
      }),
    );

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole("button", { name: /Search Refresh New/i }),
    ).toBeTruthy();
  });
});
