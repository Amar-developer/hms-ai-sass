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
  dlt_entity_id: "110100001234567890",
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
  flows: [],
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
    apiFetchMock.mockResolvedValue(savedSettings);
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

  it("renders every P0 workflow even when the tenant has saved none", async () => {
    render(<SmsIntegrationSettings apiSession={apiSession} />);

    expect(await screen.findByText("Appointment booked")).toBeTruthy();
    expect(screen.getByText("Lab report ready")).toBeTruthy();
    expect(screen.getByText("Queue token alert")).toBeTruthy();
    expect(screen.getByText("0 / 8 enabled")).toBeTruthy();
  });

  it("blocks saving an enabled workflow that has no approved template", async () => {
    render(<SmsIntegrationSettings apiSession={apiSession} />);

    const toggle = await screen.findByLabelText(
      "Enable Appointment booked template",
    );
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: /Save SMS Settings/i }));

    expect(
      await screen.findByText("DLT template ID is required for Appointment booked."),
    ).toBeTruthy();
    // Only the initial GET ran - no PUT was attempted.
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("saves the settings without resending unchanged credentials, dropping untouched blank templates", async () => {
    render(<SmsIntegrationSettings apiSession={apiSession} />);
    await screen.findByText("Appointment booked");

    fireEvent.click(screen.getByRole("button", { name: /Save SMS Settings/i }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    const [path, , options] = apiFetchMock.mock.calls[1];
    expect(path).toBe("/communications/sms/settings");
    expect(options?.method).toBe("PUT");

    const body = JSON.parse(String(options?.body));
    expect(body.api_key).toBeNull();
    expect(body.api_token).toBeNull();
    expect(body.dlt_entity_id).toBe("110100001234567890");
    // None of the 8 per-event placeholders were touched, so none are saved.
    expect(body.flows).toHaveLength(0);
  });

  it("adds a new template for a workflow and includes it in the save payload", async () => {
    render(<SmsIntegrationSettings apiSession={apiSession} />);
    await screen.findByText("Appointment booked");

    const addButtons = screen.getAllByRole("button", { name: /Add Template/i });
    fireEvent.click(addButtons[0]);

    const nameInputs = screen.getAllByPlaceholderText(
      "Appointment booked template name",
    );
    expect(nameInputs).toHaveLength(2);
    fireEvent.change(nameInputs[1], { target: { value: "Festive wording" } });

    fireEvent.click(screen.getByRole("button", { name: /Save SMS Settings/i }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    const [, , options] = apiFetchMock.mock.calls[1];
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
    await screen.findByDisplayValue("Existing template");

    const deleteButton = await screen.findByLabelText(
      "Delete Existing template template",
    );
    fireEvent.click(deleteButton);
    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.queryByDisplayValue("Existing template")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Save SMS Settings/i }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    const [, , options] = apiFetchMock.mock.calls[1];
    const body = JSON.parse(String(options?.body));
    expect(
      (body.flows as any[]).find((flow) => flow.id === "sms_tpl_existing"),
    ).toBeUndefined();

    confirmSpy.mockRestore();
  });

  it("warns when the integration is enabled before credentials are saved", async () => {
    apiFetchMock.mockResolvedValue({ ...savedSettings, has_credentials: false });
    render(<SmsIntegrationSettings apiSession={apiSession} />);
    await screen.findByText("Appointment booked");

    fireEvent.click(
      screen.getByRole("switch", { name: "Enable SMS integration" }),
    );

    expect(
      await screen.findByText(/credentials for the selected API mode are required/i),
    ).toBeTruthy();
  });
});
