// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./consulation.api", () => ({
  getPatient: vi.fn(),
  listAvailableMedicines: vi.fn(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 10));
    return [{ id: "med-1", item_name: "DOLO 650 MG TABLET" }];
  }),
  listAvailableLabTests: vi.fn(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 10));
    return [{ id: "lab-1", item_name: "Complete Blood Count" }];
  }),
}));

import { useConsultationWorkspaceData } from "./useConsultationWorkspaceData";

function InlineEmptyCatalogProbe() {
  const { availableMedicineCatalog, availableLabCatalog } =
    useConsultationWorkspaceData({
      apiSession: null,
      patient: null,
      medicineCatalog: [],
      labCatalog: [],
      medicineSearch: "",
      labSearch: "",
    });
  return (
    <span>{`${availableMedicineCatalog.length}:${availableLabCatalog.length}`}</span>
  );
}

function InlineSessionSearchProbe() {
  const { availableMedicineCatalog, availableLabCatalog } =
    useConsultationWorkspaceData({
      // Deliberately recreate the session object on every render. Loading and
      // result updates must not restart and cancel the active catalog request.
      apiSession: {
        tenantId: "tenant-1",
        email: "doctor@example.test",
        accessToken: "token-1",
        user: { id: "user-1" },
      },
      patient: null,
      medicineCatalog: [],
      labCatalog: [],
      medicineSearch: "dolo",
      labSearch: "blood",
    });
  return (
    <span>{`${availableMedicineCatalog[0]?.item_name || ""}|${availableLabCatalog[0]?.item_name || ""}`}</span>
  );
}

describe("useConsultationWorkspaceData", () => {
  afterEach(cleanup);

  it("does not loop when a caller supplies inline empty catalog arrays", () => {
    render(<InlineEmptyCatalogProbe />);
    expect(screen.getByText("0:0")).toBeTruthy();
  });


  it("retains live medicine and lab suggestions when the session object is recreated", async () => {
    render(<InlineSessionSearchProbe />);

    await waitFor(
      () =>
        expect(
          screen.getByText("DOLO 650 MG TABLET|Complete Blood Count"),
        ).toBeTruthy(),
      { timeout: 1_500 },
    );
  });
});
