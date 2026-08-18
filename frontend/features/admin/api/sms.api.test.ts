import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import {
  fetchSmsReadiness,
  fetchSmsSettings,
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
