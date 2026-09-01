import { useEffect, useState } from "react";
import { Mail, Send, ShieldCheck } from "lucide-react";

import { FormField } from "@/app/components/FormElements";
import {
  Badge,
  Button,
  Input,
  Select,
  StatusToast,
} from "@/app/components/common/ui";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import { OverlayLoader } from "@/app/components/common/loader/OverlayLoader";
import {
  fetchEmailSettings,
  sendEmailTest,
  updateEmailSettings,
} from "@/features/admin/api/email.api";
import { SecretInput } from "../components/SecretInput";
import { SmsSwitch } from "../sms_integration/components/SmsSwitch";
import {
  buildEmailSettingsPayload,
  initialEmailDraft,
  readEmailDraft,
  readEmailStatus,
  senderModeOptions,
  validateEmailDraft,
} from "./helpers";
import type { EmailSettingsDraft, EmailSettingsStatus } from "./types";

const emptyStatus: EmailSettingsStatus = {
  hasPassword: false,
  passwordLastFour: "",
  effectiveFromEmail: "",
  effectiveFromName: "",
  usesPlatformSmtp: true,
  updatedAt: null,
};

export function EmailIntegrationSettings({
  apiSession,
  tenantId,
}: {
  apiSession?: any;
  tenantId?: string;
} = {}) {
  const [draft, setDraft] = useState<EmailSettingsDraft>(initialEmailDraft);
  const [status, setStatus] = useState<EmailSettingsStatus>(emptyStatus);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [testRecipient, setTestRecipient] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const effectiveTenantId = tenantId || apiSession?.tenantId || "";

  useEffect(() => {
    let active = true;
    if (!apiSession || !effectiveTenantId) {
      setDraft(initialEmailDraft);
      setStatus(emptyStatus);
      setInitialLoading(false);
      return () => {
        active = false;
      };
    }
    const scopedSession = { ...apiSession, tenantId: effectiveTenantId };
    setInitialLoading(true);
    setMessage("");
    void fetchEmailSettings(scopedSession)
      .then((value: any) => {
        if (!active) return;
        setDraft(readEmailDraft(value));
        setStatus(readEmailStatus(value));
      })
      .catch((error: any) => {
        if (active) {
          setMessage(error.message || "Could not load email settings.");
        }
      })
      .finally(() => {
        if (active) setInitialLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    apiSession?.email,
    apiSession?.tenantId,
    apiSession?.token,
    effectiveTenantId,
  ]);

  const update = <K extends keyof EmailSettingsDraft>(
    key: K,
    value: EmailSettingsDraft[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  async function saveSettings() {
    const validationErrors = validateEmailDraft(draft);
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;
    if (!apiSession || !effectiveTenantId) return;
    setBusy(true);
    setMessage("");
    try {
      const saved = await updateEmailSettings(
        { ...apiSession, tenantId: effectiveTenantId },
        buildEmailSettingsPayload(draft),
      );
      setDraft(readEmailDraft(saved));
      setStatus(readEmailStatus(saved));
      setMessage("Email settings saved.");
    } catch (error: any) {
      setMessage(error.message || "Could not save email settings.");
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    if (!apiSession || !effectiveTenantId || !testRecipient.trim()) return;
    setTestBusy(true);
    setMessage("");
    try {
      const result = await sendEmailTest(
        { ...apiSession, tenantId: effectiveTenantId },
        testRecipient.trim(),
      );
      setMessage(
        result?.success
          ? `${result.message} Sent from ${result.sent_from}.`
          : result?.message || "The test email could not be sent.",
      );
    } catch (error: any) {
      setMessage(error.message || "The test email could not be sent.");
    } finally {
      setTestBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <section className="relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {initialLoading && <OverlayLoader />}
        <StatusToast message={message} onClose={() => setMessage("")} />
        <div className="flex flex-col gap-3 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
              <Mail className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-950">
                Email Settings
              </h2>
              <p className="text-xs font-medium text-slate-500">
                SMTP server and sender identity for monthly reports, invoices,
                and document delivery.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={draft.enabled ? "green" : "slate"}
              className="normal-label"
            >
              {draft.enabled ? "Own SMTP" : "Platform SMTP"}
            </Badge>
            <SmsSwitch
              label="Use this tenant's own SMTP server"
              checked={draft.enabled}
              onChange={(checked) => update("enabled", checked)}
            />
            <span className="hidden h-6 w-px bg-slate-200 sm:block" />
            <Button
              type="button"
              onClick={saveSettings}
              disabled={busy || !apiSession || !effectiveTenantId}
              className="save-button"
            >
              <ButtonLoader loading={busy}>
                {busy ? "Saving..." : "Save Settings"}
              </ButtonLoader>
            </Button>
          </div>
        </div>
      </section>

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-black text-slate-900">
          <Send className="h-4 w-4 text-emerald-700" /> Sender identity
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Who outgoing mail appears to come from.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <FormField label="Send As">
            <Select
              value={draft.senderMode}
              onChange={(event: any) =>
                update("senderMode", event.target.value)
              }
            >
              {senderModeOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[11px] text-slate-500">
              {
                senderModeOptions.find(
                  ([value]) => value === draft.senderMode,
                )?.[2]
              }
            </p>
          </FormField>
          <FormField
            label={
              draft.senderMode === "custom"
                ? "Sender Address (required)"
                : "Sender Address"
            }
          >
            <Input
              type="text"
              value={draft.fromEmail}
              onChange={(event: any) => update("fromEmail", event.target.value)}
              placeholder="reports@yourclinic.com"
              disabled={draft.senderMode !== "custom"}
              autoComplete="off"
            />
          </FormField>
          <FormField label="Sender Display Name">
            <Input
              type="text"
              value={draft.fromName}
              onChange={(event: any) => update("fromName", event.target.value)}
              placeholder="Defaults to the clinic name"
              autoComplete="off"
            />
          </FormField>
          <FormField label="Reply-To Address">
            <Input
              type="text"
              value={draft.replyTo}
              onChange={(event: any) => update("replyTo", event.target.value)}
              placeholder="Defaults to the tenant admin"
              autoComplete="off"
            />
          </FormField>
        </div>
        {status.effectiveFromEmail && (
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            Mail currently sends as{" "}
            <strong>
              {status.effectiveFromName} &lt;{status.effectiveFromEmail}&gt;
            </strong>
            .
          </p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-black text-slate-900">
          <ShieldCheck className="h-4 w-4 text-emerald-700" /> SMTP server
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Leave the toggle off to send through the server configured in the
          deployment environment.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <FormField label="SMTP Host">
            <Input
              type="text"
              value={draft.smtpHost}
              onChange={(event: any) => update("smtpHost", event.target.value)}
              placeholder="smtp.yourprovider.com"
              autoComplete="off"
            />
          </FormField>
          <FormField label="SMTP Port">
            <Input
              type="text"
              inputMode="numeric"
              value={draft.smtpPort}
              onChange={(event: any) =>
                update("smtpPort", event.target.value.replace(/\D/g, ""))
              }
              placeholder="587"
            />
          </FormField>
          <FormField label="Use TLS">
            <Select
              value={draft.smtpUseTls ? "yes" : "no"}
              onChange={(event: any) =>
                update("smtpUseTls", event.target.value === "yes")
              }
            >
              <option value="yes">Yes (STARTTLS)</option>
              <option value="no">No</option>
            </Select>
            <p className="mt-1 text-[11px] text-slate-500">
              Port 587 needs STARTTLS. Port 465 is encrypted from the start —
              set this to No.
            </p>
          </FormField>
          <FormField label="SMTP Username">
            <Input
              type="text"
              value={draft.smtpUsername}
              onChange={(event: any) =>
                update("smtpUsername", event.target.value)
              }
              autoComplete="off"
            />
          </FormField>
          <FormField label="SMTP Password">
            <SecretInput
              label="SMTP password"
              value={draft.smtpPassword}
              onChange={(value) => update("smtpPassword", value)}
              visible={showPassword}
              toggleVisible={() => setShowPassword((current) => !current)}
              placeholder={
                status.hasPassword
                  ? `••••${status.passwordLastFour} (leave blank to keep)`
                  : "Enter the SMTP password"
              }
            />
          </FormField>
        </div>
        {status.hasPassword && (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            A password ending {status.passwordLastFour} is saved and encrypted.
            Leave the field blank to keep it, or enter a new value to replace
            it.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-black text-slate-900">Send a test email</h3>
        <p className="mt-1 text-xs text-slate-500">
          Uses the saved settings, so a passing test proves the server,
          credentials and sender address all work. Save your changes first.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <FormField label="Send To">
              <Input
                type="text"
                value={testRecipient}
                onChange={(event: any) => setTestRecipient(event.target.value)}
                placeholder="you@yourclinic.com"
                autoComplete="off"
              />
            </FormField>
          </div>
          <Button
            type="button"
            onClick={runTest}
            disabled={
              testBusy ||
              !apiSession ||
              !effectiveTenantId ||
              !testRecipient.trim()
            }
            className="flex items-center gap-2 px-3 py-2 text-xs disabled:opacity-50"
          >
            <ButtonLoader loading={testBusy}>
              {testBusy ? "Sending..." : "Send Test Email"}
            </ButtonLoader>
          </Button>
        </div>
      </section>
    </div>
  );
}
