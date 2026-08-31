export type EmailSenderMode = "tenant_admin" | "custom" | "smtp_default";

export type EmailSettingsDraft = {
  enabled: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpUseTls: boolean;
  smtpUsername: string;
  /** Write-only: blank means "keep the stored password". */
  smtpPassword: string;
  senderMode: EmailSenderMode;
  fromEmail: string;
  fromName: string;
  replyTo: string;
};

export type EmailSettingsStatus = {
  hasPassword: boolean;
  passwordLastFour: string;
  effectiveFromEmail: string;
  effectiveFromName: string;
  usesPlatformSmtp: boolean;
  updatedAt: string | null;
};
