// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import { WhatsAppDeliveryQueue } from "./WhatsAppDeliveryQueue";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

const apiFetchMock = vi.mocked(apiFetch);

const queueResponse = {
  items: [
    {
      id: "notification-1",
      flow_key: "invoice_paid_patient",
      recipient_name: "Test Patient",
      recipient_masked: "••••3210",
      status: "failed",
      resource_type: "invoice",
      resource_reference: "INV-001",
      attempt_count: 5,
      max_attempts: 5,
      failure_reason: "The template message request was rejected.",
      created_at: "2026-07-24T10:00:00Z",
      sent_at: null,
      next_attempt_at: null,
    },
  ],
  total: 1,
  limit: 20,
  offset: 0,
  counts: { queued: 0, processing: 0, sent: 0, failed: 1, cancelled: 0 },
  today: { sent: 3, failed: 1, patient_recipients: 2 },
};

describe("WhatsApp delivery queue", () => {
  beforeEach(() => apiFetchMock.mockReset());
  afterEach(cleanup);

  it("loads masked delivery rows only after the operator expands it", async () => {
    apiFetchMock.mockResolvedValue(queueResponse);
    render(
      <WhatsAppDeliveryQueue
        apiSession={{ tenantId: "tenant-1" }}
        tenantId="tenant-1"
        onMessage={vi.fn()}
      />,
    );

    expect(apiFetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Delivery queue/i }));

    expect(await screen.findByText("Test Patient")).toBeTruthy();
    expect(screen.getByText("••••3210")).toBeTruthy();
    expect(screen.getByText("Messages sent today")).toBeTruthy();
    expect(screen.getByText("Patients messaged today")).toBeTruthy();
    expect(screen.queryByText("9876543210")).toBeNull();
    expect(apiFetchMock.mock.calls[0][0]).toContain("/communications/whatsapp/queue?");
  });

  it("retries a failed delivery and refreshes the list", async () => {
    const onMessage = vi.fn();
    apiFetchMock
      .mockResolvedValueOnce(queueResponse)
      .mockResolvedValueOnce({ ...queueResponse.items[0], status: "queued" })
      .mockResolvedValueOnce({ ...queueResponse, items: [] });
    render(
      <WhatsAppDeliveryQueue
        apiSession={{ tenantId: "tenant-1" }}
        tenantId="tenant-1"
        onMessage={onMessage}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Delivery queue/i }));
    const row = await screen.findByRole("row", { name: /Test Patient/i });
    fireEvent.click(within(row).getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/communications/whatsapp/queue/notification-1/retry",
        expect.objectContaining({ tenantId: "tenant-1" }),
        { method: "POST" },
      ),
    );
    expect(onMessage).toHaveBeenCalledWith("Notification queued for retry.");
  });
});
