// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchAvailableMedicines } from "./pharmacy.api";
import { useAvailableMedicines } from "./useAvailableMedicines";

vi.mock("./pharmacy.api", () => ({
  fetchAvailableMedicines: vi.fn(),
}));

const fetchAvailableMedicinesMock = vi.mocked(fetchAvailableMedicines);
const session = {
  tenantId: "tenant-one",
  email: "staff@example.test",
  user: { id: "user-one" },
};

function Probe({ search }: { search: string }) {
  const { availableMedicines } = useAvailableMedicines(
    session,
    "branch-one",
    search,
  );
  return <span>{availableMedicines.length}</span>;
}

describe("useAvailableMedicines", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchAvailableMedicinesMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("waits for a meaningful search instead of loading the external catalogue on mount", async () => {
    fetchAvailableMedicinesMock.mockResolvedValue([]);
    const view = render(<Probe search="" />);

    await act(async () => vi.advanceTimersByTime(500));
    expect(fetchAvailableMedicinesMock).not.toHaveBeenCalled();

    view.rerender(<Probe search="do" />);
    await act(async () => vi.advanceTimersByTime(250));

    expect(fetchAvailableMedicinesMock).toHaveBeenCalledTimes(1);
    expect(fetchAvailableMedicinesMock.mock.calls[0][1]).toContain("search=do");
  });

  it("aborts an obsolete lookup when the search changes", async () => {
    fetchAvailableMedicinesMock.mockImplementation(
      () => new Promise(() => undefined),
    );
    const view = render(<Probe search="do" />);
    await act(async () => vi.advanceTimersByTime(250));

    const firstSignal = fetchAvailableMedicinesMock.mock.calls[0][2];
    expect(firstSignal?.aborted).toBe(false);

    view.rerender(<Probe search="dolo" />);
    expect(firstSignal?.aborted).toBe(true);
  });
});
