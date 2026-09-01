// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SmsIntegrationSettings } from "./SmsIntegrationSettings";
import { apiFetch } from "@/lib/api";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

const apiFetchMock = vi.mocked(apiFetch);

const savedSettings = {
  enabled: false,
  sms_country_api_mode: "rest",
  api_url: "https://restapi.smscountry.com/v0.1/Accounts/",
  has_credentials: true,
  credential_last_four: "9821",
  has_webhook_secret: false,
  default_country_code: "+91",
  timeout_seconds: 15,
  max_attempts: 5,
  max_segments_per_message: 3,
  daily_message_limit: null,
  monthly_segment_limit: null,
  patient_notifications_enabled: true,
  staff_notifications_enabled: false,
  default_sender_id: "MEDIZN",
  throughput_limit_per_minute: 600,
  retention_days: 90,
  notes: "",
  account_confirmed: true,
  dpa_confirmed: true,
  pricing_confirmed: true,
  delivery_receipts_confirmed: false,
  callback_contract_confirmed: false,
  static_ip_allowlisting_confirmed: false,
  flows: [
    {
      id: "sms_tpl_patient_registration",
      flow_key: "patient_registered_patient",
      name: "Patient registration",
      language: "en",
      enabled: false,
      classification: "service_implicit",
      consent_basis: "patient_transaction",
      dlt_template_id: "",
      registered_body:
        "Dear {#var#}, your patient registration at MedizinHub has been successfully completed. Your Patient ID is {#var#}. Thank you.",
      variable_keys: ["patient_name", "patient_number"],
      approved_by_provider: false,
    },
    {
      id: "sms_tpl_appointment_booking",
      flow_key: "appointment_booked_patient",
      name: "Appointment booking",
      language: "en",
      enabled: false,
      classification: "service_implicit",
      consent_basis: "patient_transaction",
      dlt_template_id: "",
      registered_body:
        "Dear {#var#}, your appointment with Dr. {#var#} for {#var#} at MedizinHub on {#var#} at {#var#} has been successfully booked. Appointment ID: {#var#}. Thank you.",
      variable_keys: [
        "patient_name",
        "doctor_name",
        "consultation_type",
        "appointment_date",
        "appointment_time",
        "appointment_id",
      ],
      approved_by_provider: false,
    },
  ],
  status: "not_ready",
  passed: 5,
  warnings: 1,
  blockers: 2,
  checks: [
    {
      key: "smscountry_account",
      label: "SMSCountry account",
      status: "pass",
      message: "Licensed SMSCountry account details are confirmed.",
    },
    {
      key: "delivery_receipts",
      label: "Delivery receipts",
      status: "block",
      message:
        "Confirm delivery receipt states and callback verification contract.",
    },
  ],
  updated_at: "2026-08-17T09:00:00+00:00",
};

const apiSession = { tenantId: "tenant-1", token: "t" } as any;

describe("SmsIntegrationSettings", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === "/communications/sms/usage") {
        return {
          plan_name: "Growth",
          monthly_segment_limit: null,
          daily_message_limit: null,
          plan_segment_limit: 1000,
          plan_segment_credits: 0,
          messages_used: 12,
          segments_used: 14,
          messages_used_today: 2,
          segments_remaining: 986,
          limit_reached: false,
          cost_per_segment_paise: 15,
          estimated_cost_paise: 210,
          period_start: "2026-08-01T00:00:00+00:00",
          period_end: "2026-09-01T00:00:00+00:00",
        };
      }
      if (path === "/communications/sms/health") {
        return {
          status: "healthy",
          sent_24h: 4,
          delivered_24h: 3,
          failed_24h: 0,
          failure_rate_24h: 0,
          delivery_rate_24h: 75,
          queued: 1,
          retry_pending: 0,
          stuck_processing: 0,
          awaiting_receipt: 1,
          oldest_queued_age_minutes: 2,
          last_sent_at: "2026-08-17T09:00:00+00:00",
          alerts: [],
        };
      }
      if (path.startsWith("/communications/sms/queue?")) {
        return {
          items: [],
          total: 0,
          limit: 20,
          offset: 0,
          counts: {
            queued: 0,
            processing: 0,
            sent: 0,
            failed: 0,
            cancelled: 0,
          },
        };
      }
      return savedSettings;
    });
  });

  afterEach(cleanup);

  it("loads tenant SMS settings and renders the readiness checks", async () => {
    render(<SmsIntegrationSettings apiSession={apiSession} />);

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/communications/sms/settings",
        expect.objectContaining({ tenantId: "tenant-1" }),
      ),
    );

    expect(await screen.findByText("SMSCountry account")).toBeTruthy();
    expect(screen.getByText("Delivery receipts")).toBeTruthy();
    expect(screen.getByText("Not ready")).toBeTruthy();
    expect(
      screen.getByText("5 passed · 1 warning(s) · 2 blocker(s)"),
    ).toBeTruthy();
  });

  it("renders only the two starter templates", async () => {
    render(<SmsIntegrationSettings apiSession={apiSession} />);
    fireEvent.click(await screen.findByRole("tab", { name: /^Templates/ }));
    expect(
      await screen.findByRole("heading", { name: "Appointment booked" }),
    ).toBeTruthy();
    expect(screen.getAllByText("Patient registration").length).toBeGreaterThan(0);
    const registrationCard = screen
      .getByPlaceholderText("Patient registration template name")
      .closest("article");
    expect(registrationCard?.className).toContain("bg-white");
    expect(registrationCard?.className).toContain("shadow-sm");
    expect(
      screen.queryByRole("heading", { name: "Lab report ready" }),
    ).toBeNull();
    expect(screen.getByText("0 enabled")).toBeTruthy();
  });

  it("renders connection and compliance tabs as white cards", async () => {
    render(<SmsIntegrationSettings apiSession={apiSession} />);

    fireEvent.click(await screen.findByRole("tab", { name: /^API Connection/ }));
    const connectionCard = (
      await screen.findByRole("heading", { name: "SMSCountry connection" })
    ).parentElement?.parentElement;
    expect(connectionCard?.className).toContain("bg-white");
    expect(connectionCard?.className).toContain("shadow-sm");

    fireEvent.click(screen.getByRole("tab", { name: /^Compliance/ }));
    const complianceCard = (
      await screen.findByRole("heading", {
        name: "Sender header and provider confirmations",
      })
    ).parentElement?.parentElement;
    expect(complianceCard?.className).toContain("bg-white");
    expect(complianceCard?.className).toContain("shadow-sm");
  });

  it("blocks saving an enabled workflow that has no approved template", async () => {
    render(<SmsIntegrationSettings apiSession={apiSession} />);
    fireEvent.click(await screen.findByRole("tab", { name: /^Templates/ }));
    const toggle = await screen.findByLabelText(
      "Enable Appointment booked template: Appointment booking",
    );
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: /Save Settings/i }));

    expect(
      await screen.findByText(
        "DLT template ID is required for Appointment booked — Appointment booking.",
      ),
    ).toBeTruthy();
    // Only the initial GET ran - no PUT was attempted.
    expect(
      apiFetchMock.mock.calls.filter((call) => call[2]?.method === "PUT"),
    ).toHaveLength(0);
  });

  it("saves the two starter templates without resending unchanged credentials", async () => {
    render(<SmsIntegrationSettings apiSession={apiSession} />);
    fireEvent.click(await screen.findByRole("tab", { name: /^Templates/ }));
    await screen.findByRole("heading", { name: "Appointment booked" });

    fireEvent.click(screen.getByRole("button", { name: /Save Settings/i }));

    await waitFor(() =>
      expect(apiFetchMock.mock.calls.some((call) => call[2]?.method === "PUT")).toBe(true),
    );
    const [path, , options] = apiFetchMock.mock.calls.find(
      (call) => call[2]?.method === "PUT",
    )!;
    expect(path).toBe("/communications/sms/settings");
    expect(options?.method).toBe("PUT");

    const body = JSON.parse(String(options?.body));
    expect(body.api_key).toBeNull();
    expect(body.api_token).toBeNull();
    expect(body.dlt_entity_id).toBeUndefined();
    expect(body.flows).toHaveLength(2);
    expect(body.flows.map((flow: any) => flow.flow_key)).toEqual([
      "patient_registered_patient",
      "appointment_booked_patient",
    ]);
  });

  it("adds a new template for a workflow and includes it in the save payload", async () => {
    render(<SmsIntegrationSettings apiSession={apiSession} />);
    fireEvent.click(await screen.findByRole("tab", { name: /^Templates/ }));
    await screen.findByRole("heading", { name: "Appointment booked" });

    fireEvent.change(
      screen.getByLabelText("New SMS template workflow"),
      { target: { value: "appointment_booked_patient" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /Add Template/i }));

    const nameInputs = screen.getAllByPlaceholderText(
      "Appointment booked template name",
    );
    expect(nameInputs).toHaveLength(2);
    fireEvent.change(nameInputs[1], { target: { value: "Festive wording" } });

    fireEvent.click(screen.getByRole("button", { name: /Save Settings/i }));

    await waitFor(() =>
      expect(apiFetchMock.mock.calls.some((call) => call[2]?.method === "PUT")).toBe(true),
    );
    const [, , options] = apiFetchMock.mock.calls.find(
      (call) => call[2]?.method === "PUT",
    )!;
    const body = JSON.parse(String(options?.body));
    const added = (body.flows as any[]).find(
      (flow) => flow.name === "Festive wording",
    );
    expect(added).toBeTruthy();
    expect(added.flow_key).toBe("appointment_booked_patient");
  });

  it("deletes a template after confirmation and excludes it from the save payload", async () => {
    apiFetchMock.mockResolvedValue({
      ...savedSettings,
      flows: [
        {
          id: "sms_tpl_existing",
          flow_key: "appointment_booked_patient",
          name: "Existing template",
          enabled: false,
          classification: "service_implicit",
          consent_basis: "patient_transaction",
          dlt_template_id: "1707160000000001",
          registered_body: "Hello {#var#}.",
          variable_keys: ["patient_name"],
          approved_by_provider: true,
        },
      ],
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SmsIntegrationSettings apiSession={apiSession} />);
    fireEvent.click(await screen.findByRole("tab", { name: /^Templates/ }));
    await screen.findByDisplayValue("Existing template");

    const deleteButton = await screen.findByLabelText(
      "Delete Existing template template",
    );
    fireEvent.click(deleteButton);
    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.queryByDisplayValue("Existing template")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Save Settings/i }));
    await waitFor(() =>
      expect(apiFetchMock.mock.calls.some((call) => call[2]?.method === "PUT")).toBe(true),
    );
    const [, , options] = apiFetchMock.mock.calls.find(
      (call) => call[2]?.method === "PUT",
    )!;
    const body = JSON.parse(String(options?.body));
    expect(
      (body.flows as any[]).find((flow) => flow.id === "sms_tpl_existing"),
    ).toBeUndefined();

    confirmSpy.mockRestore();
  });

  it("warns when the integration is enabled before credentials are saved", async () => {
    apiFetchMock.mockResolvedValue({ ...savedSettings, has_credentials: false });
    render(<SmsIntegrationSettings apiSession={apiSession} />);
    await screen.findByText("SMSCountry account");

    fireEvent.click(
      screen.getByRole("switch", { name: "Enable SMS integration" }),
    );

    expect(
      await screen.findByText(/credentials for the selected API mode are required/i),
    ).toBeTruthy();
  });

  it("organizes current SMS operations into workspace tabs", async () => {
    render(<SmsIntegrationSettings apiSession={apiSession} />);

    expect(
      await screen.findByRole("tablist", { name: "SMS workspace sections" }),
    ).toBeTruthy();
    for (const label of [
      "Overview",
      "API Connection",
      "Compliance",
      "Templates",
      "Delivery Queue",
    ]) {
      expect(screen.getByRole("tab", { name: new RegExp(`^${label}`) })).toBeTruthy();
    }
    expect(await screen.findByText("SMS usage")).toBeTruthy();
    expect(await screen.findByText("Delivery health")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Test SMS" })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /^Delivery Queue/ }));
    await waitFor(() =>
      expect(
        apiFetchMock.mock.calls.some((call) =>
          String(call[0]).startsWith("/communications/sms/queue?"),
        ),
      ).toBe(true),
    );
    expect(screen.getByText("SMS delivery queue")).toBeTruthy();
  });

  it("preserves an unsaved connection draft across tabs and parent rerenders", async () => {
    const { rerender } = render(
      <SmsIntegrationSettings apiSession={apiSession} />,
    );
    fireEvent.click(await screen.findByRole("tab", { name: /^API Connection/ }));
    const authKey = await screen.findByPlaceholderText(
      "••••9821 (leave blank to keep)",
    );
    fireEvent.change(authKey, { target: { value: "unsaved-auth-key" } });

    fireEvent.click(screen.getByRole("tab", { name: /^Templates/ }));
    fireEvent.click(screen.getByRole("tab", { name: /^API Connection/ }));
    expect(
      screen.getByPlaceholderText("••••9821 (leave blank to keep)"),
    ).toHaveProperty("value", "unsaved-auth-key");

    rerender(
      <SmsIntegrationSettings apiSession={{ ...apiSession }} />,
    );
    await waitFor(() =>
      expect(
        apiFetchMock.mock.calls.filter(
          ([path]) => path === "/communications/sms/settings",
        ),
      ).toHaveLength(1),
    );
    expect(
      screen.getByPlaceholderText("••••9821 (leave blank to keep)"),
    ).toHaveProperty("value", "unsaved-auth-key");
  });
});
