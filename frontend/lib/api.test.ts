// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LIVE_DATA_CHANGED_EVENT,
  LIVE_DATA_CHANGED_STORAGE_KEY,
  apiFetch,
  apiUpload,
  type ApiSession,
} from "./api";

const session: ApiSession = {
  tenantId: "tenant-one",
  email: "admin@example.test",
  user: { id: "user-one" },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("api live-data synchronization", () => {
  it("bypasses cached reads without publishing a change", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse([{ id: "patient-one" }]));
    const listener = vi.fn();
    window.addEventListener(LIVE_DATA_CHANGED_EVENT, listener);

    await apiFetch("/patients", session);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/patients"),
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(listener).not.toHaveBeenCalled();
    expect(localStorage.getItem(LIVE_DATA_CHANGED_STORAGE_KEY)).toBeNull();
    window.removeEventListener(LIVE_DATA_CHANGED_EVENT, listener);
  });

  it("publishes tenant-scoped changes after a successful write", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ id: "patient-two" }, 201),
    );
    const listener = vi.fn();
    window.addEventListener(LIVE_DATA_CHANGED_EVENT, listener);

    await apiFetch("/patients", session, {
      method: "POST",
      body: JSON.stringify({ full_name: "New Patient" }),
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
      tenantId: "tenant-one",
      path: "/patients",
      method: "POST",
    });
    expect(
      JSON.parse(localStorage.getItem(LIVE_DATA_CHANGED_STORAGE_KEY) || "{}"),
    ).toMatchObject({ tenantId: "tenant-one" });
    window.removeEventListener(LIVE_DATA_CHANGED_EVENT, listener);
  });

  it("does not publish failed writes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "Invalid patient" }, 422),
    );
    const listener = vi.fn();
    window.addEventListener(LIVE_DATA_CHANGED_EVENT, listener);

    await expect(
      apiFetch("/patients", session, { method: "PATCH" }),
    ).rejects.toThrow("Invalid patient");

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(LIVE_DATA_CHANGED_EVENT, listener);
  });

  it("publishes uploads as live-data changes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ id: "file-one" }, 201),
    );
    const listener = vi.fn();
    window.addEventListener(LIVE_DATA_CHANGED_EVENT, listener);

    await apiUpload("/files", session, new FormData());

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
      tenantId: "tenant-one",
      path: "/files",
      method: "POST",
    });
    window.removeEventListener(LIVE_DATA_CHANGED_EVENT, listener);
  });
});
