import { describe, expect, it } from "vitest";

import { initialDraft } from "./constants";
import {
  addTemplateToDraft,
  buildSmsSettingsPayload,
  enableTemplateExclusively,
  readDraft,
  removeTemplateFromDraft,
  setTemplateInDraft,
  setVariableKeysInDraft,
  validateDraft,
} from "./helpers";

const savedSettings = {
  enabled: true,
  sms_country_api_mode: "rest",
  api_url: "https://restapi.smscountry.com/v0.1/Accounts/",
  has_credentials: true,
  credential_last_four: "9821",
  has_webhook_secret: true,
  default_country_code: "+91",
  timeout_seconds: 20,
  max_attempts: 4,
  max_segments_per_message: 2,
  daily_message_limit: 500,
  monthly_segment_limit: null,
  patient_notifications_enabled: true,
  staff_notifications_enabled: false,
  default_sender_id: "MEDIZN",
  throughput_limit_per_minute: 600,
  retention_days: 90,
  notes: "Ticket SC-1042",
  account_confirmed: true,
  dpa_confirmed: true,
  pricing_confirmed: false,
  delivery_receipts_confirmed: false,
  callback_contract_confirmed: false,
  static_ip_allowlisting_confirmed: false,
  flows: [
    {
      id: "sms_tpl_booked_default",
      flow_key: "appointment_booked_patient",
      name: "Default booking SMS",
      enabled: true,
      classification: "transactional",
      consent_basis: "patient_transaction",
      dlt_template_id: "1707160000000000001",
      registered_body: "Dear {#var#}, your token is {#var#}.",
      variable_keys: ["patient_name", "token_number"],
      approved_by_provider: true,
    },
  ],
};

function findTemplateByFlow(draft: ReturnType<typeof readDraft>, flowKey: string) {
  return draft.flows.find((flow) => flow.flowKey === flowKey);
}

describe("SMS settings helpers", () => {
  it("reads only the templates returned by the backend", () => {
    const draft = readDraft(savedSettings);
    expect(draft.flows).toHaveLength(1);

    const booked = findTemplateByFlow(draft, "appointment_booked_patient");
    expect(booked?.id).toBe("sms_tpl_booked_default");
    expect(booked?.enabled).toBe(true);
    expect(booked?.name).toBe("Default booking SMS");
    expect(booked?.dltTemplateId).toBe("1707160000000000001");
    expect(booked?.variableKeys).toEqual(["patient_name", "token_number"]);

    expect(findTemplateByFlow(draft, "patient_registered_patient")).toBeUndefined();
  });

  it("never reads credentials back into the draft", () => {
    const draft = readDraft(savedSettings);
    expect(draft.apiKey).toBe("");
    expect(draft.apiToken).toBe("");
    expect(draft.username).toBe("");
    expect(draft.password).toBe("");
    expect(draft.webhookSecret).toBe("");
  });

  it("sends blank secrets and optional numbers as null so stored values are kept", () => {
    const payload = buildSmsSettingsPayload(readDraft(savedSettings));
    expect(payload.api_key).toBeNull();
    expect(payload.api_token).toBeNull();
    expect(payload.username).toBeNull();
    expect(payload.password).toBeNull();
    expect(payload.webhook_secret).toBeNull();
    expect(payload.monthly_segment_limit).toBeNull();
    expect(payload.daily_message_limit).toBe(500);
    expect(payload.retention_days).toBe(90);
  });

  it("sends a blank API URL as null rather than an empty string", () => {
    const payload = buildSmsSettingsPayload(initialDraft);
    expect(payload.api_url).toBeNull();
  });

  it("round-trips only returned templates", () => {
    const draft = readDraft(savedSettings);
    const payload = buildSmsSettingsPayload(draft);
    const flows = payload.flows as any[];
    // Only the one real, saved template should round-trip.
    expect(flows).toHaveLength(1);
    expect(flows[0].flow_key).toBe("appointment_booked_patient");
  });

  it("parses comma separated variable keys and caps them", () => {
    const template = initialDraft.flows.find(
      (item) => item.flowKey === "appointment_booked_patient",
    )!;
    const draft = setVariableKeysInDraft(
      initialDraft,
      template.id,
      " patient_name , token_number ,, ",
    );
    const updated = draft.flows.find((item) => item.id === template.id);
    expect(updated?.variableKeys).toEqual(["patient_name", "token_number"]);
  });

  it("adds a new template for an event and gives it a unique id", () => {
    const draft = addTemplateToDraft(
      initialDraft,
      "patient_registered_patient",
      "Festive wording",
    );
    const templatesForEvent = draft.flows.filter(
      (flow) => flow.flowKey === "patient_registered_patient",
    );
    // The event already has its default template; adding one leaves both.
    expect(templatesForEvent).toHaveLength(2);
    const added = templatesForEvent.find((item) => item.name === "Festive wording");
    expect(added).toBeTruthy();
    expect(added?.enabled).toBe(false);
    const ids = new Set(draft.flows.map((flow) => flow.id));
    expect(ids.size).toBe(draft.flows.length);
  });

  it("removes a template by id without touching others", () => {
    const withExtra = addTemplateToDraft(
      initialDraft,
      "patient_registered_patient",
      "Festive wording",
    );
    const added = withExtra.flows.find((item) => item.name === "Festive wording")!;
    const draft = removeTemplateFromDraft(withExtra, added.id);
    expect(draft.flows.find((item) => item.id === added.id)).toBeUndefined();
    expect(draft.flows).toHaveLength(withExtra.flows.length - 1);
  });

  it("enabling one template for an event disables every other template for that event", () => {
    const withExtra = addTemplateToDraft(
      initialDraft,
      "appointment_booked_patient",
      "Alternate wording",
    );
    const original = withExtra.flows.find(
      (item) => item.flowKey === "appointment_booked_patient" && item.name === "Appointment booking",
    )!;
    const alternate = withExtra.flows.find(
      (item) => item.name === "Alternate wording",
    )!;
    const enabledOriginal = setTemplateInDraft(withExtra, original.id, {
      enabled: true,
    });
    const switched = enableTemplateExclusively(enabledOriginal, alternate.id);

    const originalAfter = switched.flows.find((item) => item.id === original.id);
    const alternateAfter = switched.flows.find((item) => item.id === alternate.id);
    expect(originalAfter?.enabled).toBe(false);
    expect(alternateAfter?.enabled).toBe(true);
    // The patient-registration starter template must be untouched.
    const registration = switched.flows.find(
      (item) => item.flowKey === "patient_registered_patient",
    );
    expect(registration?.enabled).toBe(false);
  });

  it("rejects an enabled template that has no approved DLT template", () => {
    const template = initialDraft.flows.find(
      (item) => item.flowKey === "appointment_booked_patient",
    )!;
    const draft = setTemplateInDraft(initialDraft, template.id, {
      enabled: true,
    });
    const errors = validateDraft(draft);
    expect(errors).toContain(
      "DLT template ID is required for Appointment booked — Appointment booking.",
    );
    expect(errors).toContain(
      "Provider approval is required for Appointment booked — Appointment booking.",
    );
  });

  it("does not reject custom variable names while saving template settings", () => {
    const template = initialDraft.flows.find(
      (item) => item.flowKey === "patient_registered_patient",
    )!;
    const draft = setTemplateInDraft(initialDraft, template.id, {
      enabled: true,
      dltTemplateId: "1707160000000000001",
      registeredBody: "Dear {#var#}, your Patient ID is {#var#}.",
      variableKeys: ["patient_name", "patient_num"],
      approvedByProvider: true,
    });

    expect(validateDraft(draft)).toEqual([]);
  });

  it("rejects promotional classification and half-filled credential pairs", () => {
    const template = initialDraft.flows.find(
      (item) => item.flowKey === "appointment_booked_patient",
    )!;
    const draft = {
      ...setTemplateInDraft(initialDraft, template.id, {
        enabled: true,
        classification: "promotional" as const,
        dltTemplateId: "1707160000000000001",
        registeredBody: "Offer for {#var#}.",
        approvedByProvider: true,
      }),
      apiKey: "key-value",
      apiToken: "",
      apiUrl: "http://restapi.smscountry.com",
    };
    const errors = validateDraft(draft);
    expect(errors).toContain("SMSCountry API URL must use HTTPS.");
    expect(errors).toContain(
      "Both the REST auth key and token are required.",
    );
    expect(errors).toContain(
      "Promotional SMS is not supported for Appointment booked — Appointment booking in this rollout.",
    );
  });

  it("rejects two enabled templates for the same event", () => {
    const withExtra = addTemplateToDraft(
      initialDraft,
      "appointment_booked_patient",
      "Alternate wording",
    );
    const original = withExtra.flows.find(
      (item) => item.flowKey === "appointment_booked_patient" && item.name === "Appointment booking",
    )!;
    const alternate = withExtra.flows.find(
      (item) => item.name === "Alternate wording",
    )!;
    let draft = setTemplateInDraft(withExtra, original.id, {
      enabled: true,
      dltTemplateId: "1707160000000000001",
      registeredBody: "Dear {#var#}, your token is {#var#}.",
      variableKeys: ["patient_name", "token_number"],
      approvedByProvider: true,
    });
    draft = setTemplateInDraft(draft, alternate.id, {
      enabled: true,
      dltTemplateId: "1707160000000099",
      registeredBody: "Namaste {#var#}.",
      variableKeys: ["patient_name"],
      approvedByProvider: true,
    });

    const errors = validateDraft(draft);
    expect(
      errors.some((error) => error.includes("Only one enabled template")),
    ).toBe(true);
  });

  it("accepts a fully configured enabled template", () => {
    const template = initialDraft.flows.find(
      (item) => item.flowKey === "appointment_booked_patient",
    )!;
    const draft = setTemplateInDraft(initialDraft, template.id, {
      enabled: true,
      dltTemplateId: "1707160000000000001",
      registeredBody: "Dear {#var#}, your token is {#var#}.",
      variableKeys: ["patient_name", "token_number"],
      approvedByProvider: true,
    });
    expect(validateDraft(draft)).toEqual([]);
  });
});
