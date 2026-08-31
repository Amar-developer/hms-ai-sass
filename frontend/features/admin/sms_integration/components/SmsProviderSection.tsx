import { Eye, EyeOff, Link2, ShieldCheck } from "lucide-react";
import { FormField } from "@/app/components/FormElements";
import { Input, Select } from "@/app/components/common/ui";

import { apiModeOptions } from "../constants";
import { SmsSettingsDraft } from "../types";

function SecretInput({
  value,
  onChange,
  placeholder,
  visible,
  toggleVisible,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  visible: boolean;
  toggleVisible: () => void;
  label: string;
}) {
  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event: any) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="new-password"
        className="rounded-lg px-2 py-2 pr-11 text-xs placeholder:text-xs lg:py-2.5 lg:pr-11 lg:text-xs"
      />
      <button
        type="button"
        onClick={toggleVisible}
        aria-label={visible ? `Hide ${label}` : `Show ${label}`}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 transition hover:text-slate-700"
      >
        {visible ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

export function SmsProviderSection({
  draft,
  update,
  showSecrets,
  setShowSecrets,
  hasCredentials,
  credentialLastFour,
  hasWebhookSecret,
}: {
  draft: SmsSettingsDraft;
  update: <K extends keyof SmsSettingsDraft>(
    key: K,
    value: SmsSettingsDraft[K],
  ) => void;
  showSecrets: boolean;
  setShowSecrets: (updater: (visible: boolean) => boolean) => void;
  hasCredentials: boolean;
  credentialLastFour: string;
  hasWebhookSecret: boolean;
}) {
  const keepHint = (saved: boolean) =>
    saved ? "Leave blank to keep the saved value" : "";

  return (
    <div className="mt-5 rounded-xl border border-slate-200 p-4">
      <div className="mb-4 flex items-center gap-2">
        <Link2 className="h-4 w-4 text-slate-500" />
        <h4 className="card-title font-bold text-slate-800">
          SMSCountry connection
        </h4>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="md:col-span-2">
          <FormField label="API Mode">
            <Select
              value={draft.apiMode}
              onChange={(event: any) => update("apiMode", event.target.value)}
            >
              {apiModeOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <div className="md:col-span-2">
          <FormField label="API URL">
            <Input
              type="url"
              value={draft.apiUrl}
              onChange={(event: any) => update("apiUrl", event.target.value)}
              placeholder="https://restapi.smscountry.com/v0.1/Accounts/"
              autoComplete="url"
            />
          </FormField>
        </div>

        {draft.apiMode !== "http_legacy" && (
          <>
            <div className="md:col-span-2">
              <FormField label="REST Auth Key">
                <SecretInput
                  label="auth key"
                  value={draft.apiKey}
                  onChange={(value) => update("apiKey", value)}
                  placeholder={
                    hasCredentials
                      ? `••••${credentialLastFour} (leave blank to keep)`
                      : "Enter the SMSCountry auth key"
                  }
                  visible={showSecrets}
                  toggleVisible={() => setShowSecrets((visible) => !visible)}
                />
              </FormField>
            </div>
            <div className="md:col-span-2">
              <FormField label="REST Auth Token">
                <SecretInput
                  label="auth token"
                  value={draft.apiToken}
                  onChange={(value) => update("apiToken", value)}
                  placeholder={
                    hasCredentials
                      ? "Leave blank to keep the saved token"
                      : "Enter the SMSCountry auth token"
                  }
                  visible={showSecrets}
                  toggleVisible={() => setShowSecrets((visible) => !visible)}
                />
              </FormField>
            </div>
          </>
        )}

        {draft.apiMode !== "rest" && (
          <>
            <div className="md:col-span-2">
              <FormField label="Legacy Username">
                <SecretInput
                  label="username"
                  value={draft.username}
                  onChange={(value) => update("username", value)}
                  placeholder={
                    hasCredentials
                      ? "Leave blank to keep the saved username"
                      : "Enter the legacy HTTP API username"
                  }
                  visible={showSecrets}
                  toggleVisible={() => setShowSecrets((visible) => !visible)}
                />
              </FormField>
            </div>
            <div className="md:col-span-2">
              <FormField label="Legacy Password">
                <SecretInput
                  label="password"
                  value={draft.password}
                  onChange={(value) => update("password", value)}
                  placeholder={
                    hasCredentials
                      ? "Leave blank to keep the saved password"
                      : "Enter the legacy HTTP API password"
                  }
                  visible={showSecrets}
                  toggleVisible={() => setShowSecrets((visible) => !visible)}
                />
              </FormField>
            </div>
          </>
        )}

        <div className="md:col-span-2">
          <FormField label="Delivery Receipt Webhook Secret">
            <SecretInput
              label="webhook secret"
              value={draft.webhookSecret}
              onChange={(value) => update("webhookSecret", value)}
              placeholder={
                hasWebhookSecret
                  ? "Leave blank to keep the saved secret"
                  : "Minimum 8 characters"
              }
              visible={showSecrets}
              toggleVisible={() => setShowSecrets((visible) => !visible)}
            />
          </FormField>
          <p className="mt-1 text-xs text-slate-500">
            Used to verify delivery receipt callbacks from SMSCountry.
            {hasWebhookSecret ? ` ${keepHint(true)}.` : ""}
          </p>
        </div>

        <FormField label="Default Country Code">
          <Input
            value={draft.defaultCountryCode}
            onChange={(event: any) =>
              update("defaultCountryCode", event.target.value)
            }
            placeholder="+91"
            inputMode="tel"
          />
        </FormField>
        <FormField label="Request Timeout (seconds)">
          <Input
            type="number"
            min="5"
            max="60"
            value={draft.timeoutSeconds}
            onChange={(event: any) =>
              update("timeoutSeconds", Number(event.target.value || 15))
            }
          />
        </FormField>
        <FormField label="Maximum Attempts">
          <Input
            type="number"
            min="1"
            max="10"
            value={draft.maxAttempts}
            onChange={(event: any) =>
              update("maxAttempts", Number(event.target.value || 5))
            }
          />
        </FormField>
        <FormField label="Max Segments Per Message">
          <Input
            type="number"
            min="1"
            max="8"
            value={draft.maxSegmentsPerMessage}
            onChange={(event: any) =>
              update("maxSegmentsPerMessage", Number(event.target.value || 3))
            }
          />
        </FormField>
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
        <span>
          {hasCredentials
            ? `Credentials ending ${credentialLastFour} are saved and encrypted. Leave a field blank to keep it, or enter a new value to replace it.`
            : "Credentials are encrypted at rest and are never returned to the browser or written to notification logs."}
        </span>
      </div>
    </div>
  );
}
