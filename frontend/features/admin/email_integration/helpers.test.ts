import { describe, expect, it } from "vitest";

import {
  buildEmailSettingsPayload,
  initialEmailDraft,
  readEmailDraft,
  readEmailStatus,
  validateEmailDraft,
} from "./helpers";

const saved = {
  enabled: true,
  smtp_host: "smtp.clinic.test",
  smtp_port: 2525,
  smtp_use_tls: false,
  smtp_username: "clinic-user",
  has_password: true,
  password_last_four: "9876",
  sender_mode: "custom",
  from_email: "reports@clinic.test",
  from_name: "Clinic Reports",
  reply_to: "admin@clinic.test",
  effective_from_email: "reports@clinic.test",
  effective_from_name: "Clinic Reports",
  uses_platform_smtp: false,
  updated_at: "2026-08-31T00:00:00+00:00",
};

describe("email settings helpers", () => {
  it("never reads the password back into the draft", () => {
    const draft = readEmailDraft(saved);
    expect(draft.smtpPassword).toBe("");
    expect(draft.smtpHost).toBe("smtp.clinic.test");
    expect(draft.smtpPort).toBe("2525");
    expect(draft.smtpUseTls).toBe(false);
  });

  it("sends a blank password as null so the stored one is kept", () => {
    const payload = buildEmailSettingsPayload(readEmailDraft(saved));
    expect(payload.smtp_password).toBeNull();

    const changed = buildEmailSettingsPayload({
      ...readEmailDraft(saved),
      smtpPassword: "new-secret",
    });
    expect(changed.smtp_password).toBe("new-secret");
  });

  it("surfaces the effective sender for display", () => {
    expect(readEmailStatus(saved).effectiveFromEmail).toBe(
      "reports@clinic.test",
    );
    expect(readEmailStatus(saved).usesPlatformSmtp).toBe(false);
  });

  it("requires a host only when the tenant sends through its own server", () => {
    expect(validateEmailDraft(initialEmailDraft)).toEqual([]);
    expect(
      validateEmailDraft({ ...initialEmailDraft, enabled: true }),
    ).toContain("SMTP host is required when email sending is enabled.");
  });

  it("requires an address when the sender is a specific address", () => {
    const errors = validateEmailDraft({
      ...initialEmailDraft,
      senderMode: "custom",
      fromEmail: "",
    });
    expect(errors).toContain(
      "Enter the sender address, or choose a different sender.",
    );
  });

  it("rejects a malformed address and an out-of-range port", () => {
    const errors = validateEmailDraft({
      ...initialEmailDraft,
      fromEmail: "not-an-address",
      smtpPort: "70000",
    });
    expect(errors).toContain("Sender address must be a valid email address.");
    expect(errors).toContain(
      "SMTP port must be a number between 1 and 65535.",
    );
  });
});

describe("port and TLS agreement", () => {
  it("rejects port 465 with STARTTLS enabled", () => {
    const errors = validateEmailDraft({
      ...initialEmailDraft,
      enabled: true,
      smtpHost: "smtp.test",
      smtpPort: "465",
      smtpUseTls: true,
    });
    expect(errors.some((error) => error.includes("implicit TLS"))).toBe(true);
  });

  it("rejects port 587 without STARTTLS", () => {
    const errors = validateEmailDraft({
      ...initialEmailDraft,
      enabled: true,
      smtpHost: "smtp.test",
      smtpPort: "587",
      smtpUseTls: false,
    });
    expect(errors.some((error) => error.includes("requires STARTTLS"))).toBe(
      true,
    );
  });

  it("accepts the two valid combinations", () => {
    for (const [smtpPort, smtpUseTls] of [
      ["587", true],
      ["465", false],
    ] as const) {
      expect(
        validateEmailDraft({
          ...initialEmailDraft,
          enabled: true,
          smtpHost: "smtp.test",
          smtpPort,
          smtpUseTls,
        }),
      ).toEqual([]);
    }
  });
});
