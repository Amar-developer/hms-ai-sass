import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import {
  fetchSmsReadiness,
  fetchSmsHealth,
  fetchSmsQueue,
  fetchSmsSettings,
  fetchSmsUsage,
  sendSmsTest,
  updateSmsQueueItem,
  updateSmsReadiness,
  updateSmsSettings,
} from "./sms.api";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

const apiFetchMock = vi.mocked(apiFetch);
const session = { tenantId: "tenant-1" } as any;

describe("SMS API", () => {
  beforeEach(() => apiFetchMock.mockReset());

  it("reads settings and readiness from the communications routes", async () => {
    await fetchSmsSettings(session);
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/communications/sms/settings",
      session,
    );

    await fetchSmsReadiness(session);
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/communications/sms/readiness",
      session,
    );
  });

  it("supports SMS operations and encoded queue actions", async () => {
    await fetchSmsUsage(session);
    expect(apiFetchMock).toHaveBeenLastCalledWith(
      "/communications/sms/usage",
      session,
    );

    await fetchSmsHealth(session);
    expect(apiFetchMock).toHaveBeenLastCalledWith(
      "/communications/sms/health",
      session,
    );

    await fetchSmsQueue(session, {
      status: "failed",
      flowKey: "appointment_booked_patient",
      query: "Anita",
      limit: 10,
      offset: 20,
    });
    expect(apiFetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("/communications/sms/queue?"),
      session,
    );
    const queuePath = String(apiFetchMock.mock.calls.at(-1)?.[0]);
    expect(queuePath).toContain("status_filter=failed");
    expect(queuePath).toContain("flow_key=appointment_booked_patient");
    expect(queuePath).toContain("q=Anita");

    await updateSmsQueueItem(session, "event/1", "retry");
    expect(apiFetchMock).toHaveBeenLastCalledWith(
      "/communications/sms/queue/event%2F1/retry",
      session,
      { method: "POST" },
    );

    await sendSmsTest(session, { mobile: "+919876543210" });
    expect(apiFetchMock).toHaveBeenLastCalledWith(
      "/communications/sms/test",
      session,
      {
        method: "POST",
        body: JSON.stringify({ mobile: "+919876543210" }),
      },
    );
  });

  it("sends updates as PUT with a JSON body", async () => {
    await updateSmsSettings(session, { enabled: true });
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/communications/sms/settings",
      session,
      { method: "PUT", body: JSON.stringify({ enabled: true }) },
    );

    await updateSmsReadiness(session, { account_confirmed: true });
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/communications/sms/readiness",
      session,
      { method: "PUT", body: JSON.stringify({ account_confirmed: true }) },
    );
  });
});
