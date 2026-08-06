// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LIVE_DATA_CHANGED_EVENT,
  LIVE_DATA_CHANGED_STORAGE_KEY,
  RequestTimeoutError,
  apiFetch,
  apiUpload,
  fetchWithTimeout,
  uploadAssetUrl,
  type ApiSession,
} from "./api";
import { mapWithConcurrency } from "./concurrency";

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
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("request timeouts", () => {
  it("aborts a request that exceeds its deadline", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
    );

    const request = fetchWithTimeout("/slow", {}, 50);
    const assertion = expect(request).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });
});

describe("bounded API fan-out", () => {
  it("never runs more than the requested number of record tasks", async () => {
    let active = 0;
    let peak = 0;
    const rows = await mapWithConcurrency(
      Array.from({ length: 20 }, (_, index) => index),
      async (index) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => globalThis.setTimeout(resolve, 1));
        active -= 1;
        return index * 2;
      },
      3,
    );

    expect(peak).toBe(3);
    expect(rows).toHaveLength(20);
    expect(rows[19]).toBe(38);
  });
});

describe("uploaded asset URL resolution", () => {
  it("points stored upload paths at the backend host", () => {
    expect(uploadAssetUrl("/uploads/report.pdf")).toBe(
      "http://127.0.0.1:8000/uploads/report.pdf",
    );
    expect(uploadAssetUrl("uploads/report.pdf")).toBe(
      "http://127.0.0.1:8000/uploads/report.pdf",
    );
  });

  it("preserves absolute and empty values", () => {
    expect(uploadAssetUrl("https://files.example.test/report.pdf")).toBe(
      "https://files.example.test/report.pdf",
    );
    expect(uploadAssetUrl(null)).toBe("");
  });
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
