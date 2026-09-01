import type {
  EmailSenderMode,
  EmailSettingsDraft,
  EmailSettingsStatus,
} from "./types";

export const initialEmailDraft: EmailSettingsDraft = {
  enabled: false,
  smtpHost: "",
  smtpPort: "587",
  smtpUseTls: true,
  smtpUsername: "",
  smtpPassword: "",
  senderMode: "tenant_admin",
  fromEmail: "",
  fromName: "",
  replyTo: "",
};

export const senderModeOptions: [EmailSenderMode, string, string][] = [
  [
    "tenant_admin",
    "Tenant admin address",
    "Sends as the clinic's admin user. Follows a change of admin automatically.",
  ],
  [
    "custom",
    "A specific address",
    "Sends as the address you enter below, e.g. a shared reports mailbox.",
  ],
  [
    "smtp_default",
    "Platform default",
    "Sends as the address configured in the server environment.",
  ],
];

function text(value: unknown): string {
  return String(value ?? "").trim();
}

export function readEmailDraft(value: any): EmailSettingsDraft {
  if (!value) return initialEmailDraft;
  return {
    enabled: Boolean(value.enabled),
    smtpHost: text(value.smtp_host),
    smtpPort: String(value.smtp_port ?? 587),
    smtpUseTls: value.smtp_use_tls !== false,
    smtpUsername: text(value.smtp_username),
    // Write-only: the backend never returns it, and a blank field is sent as
    // null so the stored password is kept.
    smtpPassword: "",
    senderMode: (value.sender_mode || "tenant_admin") as EmailSenderMode,
    fromEmail: text(value.from_email),
    fromName: text(value.from_name),
    replyTo: text(value.reply_to),
  };
}

export function readEmailStatus(value: any): EmailSettingsStatus {
  return {
    hasPassword: Boolean(value?.has_password),
    passwordLastFour: text(value?.password_last_four),
    effectiveFromEmail: text(value?.effective_from_email),
    effectiveFromName: text(value?.effective_from_name),
    usesPlatformSmtp: Boolean(value?.uses_platform_smtp),
    updatedAt: value?.updated_at || null,
  };
}

/** Mirrors the backend validators so problems show inline, not after a 422. */
export function validateEmailDraft(draft: EmailSettingsDraft): string[] {
  const errors: string[] = [];
  if (draft.enabled && !draft.smtpHost.trim()) {
    errors.push("SMTP host is required when email sending is enabled.");
  }
  const port = Number(draft.smtpPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push("SMTP port must be a number between 1 and 65535.");
  }
  // Port 465 is encrypted from the first byte and has no STARTTLS step, so the
  // two settings have to agree or the server hangs up mid-handshake.
  if (draft.enabled && port === 465 && draft.smtpUseTls) {
    errors.push(
      "Port 465 uses implicit TLS, which has no STARTTLS step — set Use TLS " +
        "to No, or switch to port 587.",
    );
  }
  if (draft.enabled && port === 587 && !draft.smtpUseTls) {
    errors.push(
      "Port 587 requires STARTTLS — set Use TLS to Yes, or switch to port 465.",
    );
  }
  if (draft.senderMode === "custom" && !draft.fromEmail.trim()) {
    errors.push("Enter the sender address, or choose a different sender.");
  }
  for (const [label, value] of [
    ["Sender address", draft.fromEmail],
    ["Reply-to address", draft.replyTo],
  ] as const) {
    if (value.trim() && !value.includes("@")) {
      errors.push(`${label} must be a valid email address.`);
    }
  }
  return errors;
}

export function buildEmailSettingsPayload(
  draft: EmailSettingsDraft,
): Record<string, unknown> {
  return {
    enabled: draft.enabled,
    smtp_host: draft.smtpHost.trim(),
    smtp_port: Number(draft.smtpPort) || 587,
    smtp_use_tls: draft.smtpUseTls,
    smtp_username: draft.smtpUsername.trim(),
    // null keeps the stored password; only a typed value replaces it.
    smtp_password: draft.smtpPassword.trim() || null,
    sender_mode: draft.senderMode,
    from_email: draft.fromEmail.trim(),
    from_name: draft.fromName.trim(),
    reply_to: draft.replyTo.trim(),
  };
}
