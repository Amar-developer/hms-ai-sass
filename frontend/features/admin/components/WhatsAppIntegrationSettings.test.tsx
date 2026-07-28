// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WhatsAppIntegrationSettings } from "./WhatsAppIntegrationSettings";
import { apiFetch } from "@/lib/api";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

const apiFetchMock = vi.mocked(apiFetch);

const savedSettings = {
  enabled: false,
  api_url: "https://gateway.example.com/messages",
  public_media_base_url: "https://api.example.com",
  api_key_masked: "••••••••1234",
  has_api_key: true,
  default_country_code: "+91",
  timeout_seconds: 15,
  max_attempts: 5,
  patient_notifications_enabled: true,
  doctor_notifications_enabled: true,
  usage: {
    plan_name: "Growth Clinic",
    monthly_limit: 1000,
    used: 125,
    remaining: 875,
    usage_percentage: 12.5,
    limit_reached: false,
    period_start: "2026-07-01T00:00:00+00:00",
    period_end: "2026-08-01T00:00:00+00:00",
  },
  health: {
    status: "healthy",
    sent_24h: 120,
    failed_24h: 5,
    failure_rate_24h: 4,
    queued: 3,
    retry_pending: 1,
    stuck_processing: 0,
    oldest_queued_age_minutes: 2,
    last_sent_at: "2026-07-24T09:00:00+00:00",
    alerts: [],
  },
  readiness: {
    status: "attention",
    passed: 8,
    warnings: 1,
    blockers: 0,
    checks: [
      {
        key: "integration_enabled",
        label: "Integration enabled",
        status: "pass",
        message: "The tenant integration is enabled.",
      },
      {
        key: "successful_delivery",
        label: "Successful delivery",
        status: "warning",
        message: "Send one test message before rolling out to all recipients.",
      },
    ],
  },
  default_language: "en",
  templates: {
    appointment_booked_patient: "patient_booking",
    appointment_booked_doctor: "doctor_booking",
    invoice_paid_patient: "invoice_paid",
    payment_pending_patient: "payment_pending",
  },
  localized_templates: {
    ta: {
      appointment_booked_patient: "patient_booking_ta",
    },
  },
  flows: {
    appointment_booked_patient: true,
    appointment_booked_doctor: true,
    invoice_paid_patient: true,
    payment_pending_patient: false,
  },
  custom_templates: [],
};

describe("WhatsApp integration settings design", () => {
  beforeEach(() => apiFetchMock.mockReset());
  afterEach(cleanup);

  it("keeps recipient and flow controls unavailable until integration is enabled", () => {
    render(<WhatsAppIntegrationSettings />);

    expect(
      screen.getByRole("switch", { name: "Patient notifications" }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("switch", {
        name: "Patient appointment confirmation",
      }),
    ).toHaveProperty("disabled", true);

    fireEvent.click(
      screen.getByRole("switch", { name: "Enable WhatsApp integration" }),
    );

    expect(
      screen.getByRole("switch", { name: "Patient notifications" }),
    ).toHaveProperty("disabled", false);
    expect(
      screen.getByRole("switch", {
        name: "Patient appointment confirmation",
      }),
    ).toHaveProperty("disabled", false);
  });

  it("keeps connection actions disabled without a saved tenant session", () => {
    render(<WhatsAppIntegrationSettings />);

    expect(screen.getByRole("button", { name: "Send Test Message" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      screen.getByRole("button", { name: "Save WhatsApp Settings" }),
    ).toHaveProperty("disabled", true);
  });

  it("shows the active plan monthly notification usage", async () => {
    apiFetchMock.mockResolvedValueOnce(savedSettings);
    render(
      <WhatsAppIntegrationSettings
        apiSession={{ tenantId: "tenant-1", user: { id: "admin-1" } }}
      />,
    );

    expect(await screen.findByText("125 / 1000")).toBeTruthy();
    expect(screen.getByText(/875 automatic notifications remaining/i)).toBeTruthy();
  });

  it("shows the final rollout acceptance checklist", async () => {
    apiFetchMock.mockResolvedValueOnce(savedSettings);
    render(
      <WhatsAppIntegrationSettings
        apiSession={{ tenantId: "tenant-1", user: { id: "admin-1" } }}
      />,
    );

    expect(await screen.findByText("Final rollout readiness")).toBeTruthy();
    expect(screen.getByText("Needs attention")).toBeTruthy();
    expect(screen.getByText("Successful delivery")).toBeTruthy();
    expect(screen.getByText(/8 passed.*1 warning.*0 blocker/)).toBeTruthy();
  });

  it("shows application delivery health without provider-specific monitoring", async () => {
    apiFetchMock.mockResolvedValueOnce(savedSettings);
    render(
      <WhatsAppIntegrationSettings
        apiSession={{ tenantId: "tenant-1", user: { id: "admin-1" } }}
      />,
    );

    expect(await screen.findByText("Delivery health")).toBeTruthy();
    expect(screen.getByText("120")).toBeTruthy();
    expect(screen.getByText("4%")).toBeTruthy();
  });

  it("manually creates and removes a custom notification template", () => {
    render(<WhatsAppIntegrationSettings />);

    expect(screen.getByText("Patient appointment confirmation")).toBeTruthy();
    expect(screen.getByText("Doctor appointment alert")).toBeTruthy();
    expect(screen.getByText("Paid invoice receipt")).toBeTruthy();
    expect(screen.getByText("Pending payment update")).toBeTruthy();
    expect(screen.queryByText("Patient appointment cancellation")).toBeNull();

    fireEvent.click(
      screen.getByRole("switch", { name: "Enable WhatsApp integration" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add Notification Template" }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "Add Notification Template",
    });
    fireEvent.change(
      within(dialog).getByPlaceholderText("Enter notification template name"),
      { target: { value: "Birthday greeting" } },
    );
    fireEvent.change(
      within(dialog).getByPlaceholderText("Enter approved English identifier"),
      { target: { value: "patient_birthday_en" } },
    );
    fireEvent.change(within(dialog).getByRole("combobox"), {
      target: { value: "user" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add Template" }));

    expect(screen.getByText("Birthday greeting")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", {
      name: "Remove Birthday greeting",
    }));
    expect(screen.queryByText("Birthday greeting")).toBeNull();
  });

  it("persists newly configured notification templates", async () => {
    apiFetchMock.mockResolvedValueOnce({ ...savedSettings, enabled: true });
    render(
      <WhatsAppIntegrationSettings
        apiSession={{ tenantId: "tenant-1", user: { id: "admin-1" } }}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Add Notification Template" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Add Notification Template",
    });
    fireEvent.change(
      within(dialog).getByPlaceholderText("Enter notification template name"),
      { target: { value: "Birthday greeting" } },
    );
    fireEvent.change(
      within(dialog).getByPlaceholderText("Enter approved English identifier"),
      { target: { value: "patient_birthday_en" } },
    );
    fireEvent.change(within(dialog).getByRole("combobox"), {
      target: { value: "user" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add Template" }));

    apiFetchMock.mockResolvedValueOnce({
      ...savedSettings,
      enabled: true,
      custom_templates: [
        {
          id: "custom_birthday_greeting_test",
          name: "Birthday greeting",
          description: "",
          audience: "user",
          enabled: true,
          identifiers: { en: "patient_birthday_en" },
        },
      ],
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save WhatsApp Settings" }),
    );

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    const [, , request] = apiFetchMock.mock.calls[1];
    expect(JSON.parse(String(request?.body)).custom_templates).toEqual([
      expect.objectContaining({
        name: "Birthday greeting",
        audience: "user",
        identifiers: { en: "patient_birthday_en" },
      }),
    ]);
  });

  it("keeps reminder schedules optional and disabled until the reminder flow is enabled", () => {
    render(<WhatsAppIntegrationSettings />);
    fireEvent.click(
      screen.getByRole("switch", { name: "Enable WhatsApp integration" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Show 7 more automatic templates" }),
    );

    const reminder = screen.getByRole("switch", {
      name: "Patient appointment reminder",
    });
    const dayBefore = screen.getByRole("switch", { name: "24 hours before" });
    expect(dayBefore).toHaveProperty("disabled", true);

    fireEvent.click(reminder);

    expect(dayBefore).toHaveProperty("disabled", false);
    fireEvent.click(dayBefore);
    expect(dayBefore.getAttribute("aria-checked")).toBe("true");
  });

  it("warns when enabled flows are missing identifiers in an alternate language", async () => {
    apiFetchMock.mockResolvedValueOnce({ ...savedSettings, enabled: true });
    render(
      <WhatsAppIntegrationSettings
        apiSession={{ tenantId: "tenant-1", user: { id: "admin-1" } }}
      />,
    );

    const languageEditor = await screen.findByDisplayValue(
      "English (tenant default)",
    );
    fireEvent.change(languageEditor, { target: { value: "ta" } });

    expect(
      screen.getByText(/2 enabled templates are missing for this language/i),
    ).toBeTruthy();
    expect(
      screen.getByDisplayValue("patient_booking_ta"),
    ).toBeTruthy();
  });

  it("sends a real test request with ordered approved-template values", async () => {
    apiFetchMock.mockResolvedValueOnce({ ...savedSettings, enabled: true });
    render(
      <WhatsAppIntegrationSettings
        apiSession={{ tenantId: "tenant-1", user: { id: "admin-1" } }}
      />,
    );

    const openButton = await screen.findByRole("button", { name: "Send Test Message" });
    await waitFor(() => expect(openButton).toHaveProperty("disabled", false));
    fireEvent.click(openButton);

    const dialog = screen.getByRole("dialog", { name: "Send test template message" });
    fireEvent.change(within(dialog).getByPlaceholderText("+91 98765 43210"), {
      target: { value: "98765 43210" },
    });
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      status: "sent",
      message: "Test message sent successfully.",
      external_message_id: "msg-123",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send Test Message" }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    const [path, , request] = apiFetchMock.mock.calls[1];
    expect(path).toBe("/communications/whatsapp/test");
    expect(JSON.parse(String(request?.body))).toMatchObject({
      mobile: "98765 43210",
      recipient_name: "Test Patient",
      flow_key: "appointment_booked_patient",
      language: "en",
      template_parameters: ["Test Patient", "25 July 2026", "10:30 AM"],
    });
    expect(await screen.findByText("Ready")).toBeTruthy();
    expect(
      screen.getByText(
        "A successful test or automatic delivery has been recorded.",
      ),
    ).toBeTruthy();
  });

  it("keeps the API key field at the standard input height", () => {
    render(<WhatsAppIntegrationSettings />);

    const apiKey = screen.getByPlaceholderText("Enter the API key");
    expect(apiKey.className).toContain("py-2");
    expect(apiKey.className).toContain("lg:py-2.5");
    expect(apiKey.className).toContain("pr-11");
  });

  it("loads masked settings and sends a replacement key only when entered", async () => {
    apiFetchMock.mockResolvedValueOnce(savedSettings);
    render(
      <WhatsAppIntegrationSettings
        apiSession={{ tenantId: "tenant-1", user: { id: "admin-1" } }}
      />,
    );

    const apiKey = await screen.findByPlaceholderText(
      "••••••••1234 (leave blank to keep)",
    );
    fireEvent.change(apiKey, { target: { value: "replacement-key-5678" } });
    apiFetchMock.mockResolvedValueOnce({
      ...savedSettings,
      api_key_masked: "••••••••5678",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save WhatsApp Settings" }),
    );

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    const [, , request] = apiFetchMock.mock.calls[1];
    expect(JSON.parse(String(request?.body)).api_key).toBe(
      "replacement-key-5678",
    );
    expect(
      await screen.findByPlaceholderText("••••••••5678 (leave blank to keep)"),
    ).toHaveProperty("value", "");
  });
});
