import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import {
  fetchWhatsAppQueue,
  sendWhatsAppTest,
  updateWhatsAppQueueItem,
} from "./whatsapp.api";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

const apiFetchMock = vi.mocked(apiFetch);
const session = { tenantId: "tenant-1" } as any;

describe("WhatsApp API", () => {
  beforeEach(() => apiFetchMock.mockReset());

  it("maps queue filters to the backend contract", async () => {
    apiFetchMock.mockResolvedValue({ items: [] });

    await fetchWhatsAppQueue(session, {
      status: "failed",
      flowKey: "health_tip_patient",
      query: "  PAT-10  ",
      fromDate: "2026-08-01",
      toDate: "2026-08-13",
      offset: 20,
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/communications/whatsapp/queue?limit=20&offset=20&status_filter=failed&flow_key=health_tip_patient&q=PAT-10&from_date=2026-08-01&to_date=2026-08-13",
      session,
    );
  });

  it("encodes queue ids and posts supported actions", async () => {
    await updateWhatsAppQueueItem(session, "event/one", "retry");
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/communications/whatsapp/queue/event%2Fone/retry",
      session,
      { method: "POST" },
    );
  });

  it("serializes test-message payloads", async () => {
    const payload = { mobile: "919999999999", flow_key: "health_tip_patient" };
    await sendWhatsAppTest(session, payload);
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/communications/whatsapp/test",
      session,
      { method: "POST", body: JSON.stringify(payload) },
    );
  });
});
