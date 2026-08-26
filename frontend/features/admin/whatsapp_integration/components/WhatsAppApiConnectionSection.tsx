import { Eye, EyeOff, Link2, ShieldCheck } from "lucide-react";
import { FormField } from "@/app/components/FormElements";
import { Input } from "@/app/components/common/ui";
import { WhatsAppSettingsDraft } from "../../types";

export function WhatsAppApiConnectionSection({
  draft,
  update,
  showApiKey,
  setShowApiKey,
  hasApiKey,
  maskedApiKey,
}: {
  draft: WhatsAppSettingsDraft;
  update: <K extends keyof WhatsAppSettingsDraft>(
    key: K,
    value: WhatsAppSettingsDraft[K],
  ) => void;
  showApiKey: boolean;
  setShowApiKey: (updater: (visible: boolean) => boolean) => void;
  hasApiKey: boolean;
  maskedApiKey: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Link2 className="h-4 w-4 text-slate-500" />
        <h4 className="card-title font-bold text-slate-800">API connection</h4>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="md:col-span-2 xl:col-span-3">
          <FormField label="API URL">
            <Input
              type="url"
              value={draft.apiUrl}
              onChange={(event: any) => update("apiUrl", event.target.value)}
              placeholder="https://api.example.com/messages"
              autoComplete="url"
            />
          </FormField>
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
        <div className="md:col-span-2 xl:col-span-4">
          <FormField label="Public Receipt Base URL">
            <Input
              type="url"
              value={draft.publicMediaBaseUrl}
              onChange={(event: any) =>
                update("publicMediaBaseUrl", event.target.value)
              }
              placeholder="https://api.yourdomain.com"
              autoComplete="url"
            />
          </FormField>
          <p className="mt-1 text-xs text-slate-500">
            Public HTTPS origin used for short-lived signed invoice receipt
            links. Required when paid invoice delivery is enabled.
          </p>
        </div>
        <div className="md:col-span-2 xl:col-span-4">
          <FormField label="Doctor Application URL (Optional)">
            <Input
              type="url"
              value={draft.appointmentViewUrl}
              onChange={(event: any) =>
                update("appointmentViewUrl", event.target.value)
              }
              placeholder="https://app.yourdomain.com"
              autoComplete="url"
            />
          </FormField>
          <p className="mt-1 text-xs text-slate-500">
            Public SPA root or login page sent as value {"{{6}}"}. The doctor
            can sign in and open Appointments from the application menu.
          </p>
        </div>
        <div className="md:col-span-2">
          <FormField label="API Key">
            <div className="relative">
              <Input
                type={showApiKey ? "text" : "password"}
                value={draft.apiKey}
                onChange={(event: any) => update("apiKey", event.target.value)}
                placeholder={
                  hasApiKey
                    ? `${maskedApiKey} (leave blank to keep)`
                    : "Enter the API key"
                }
                autoComplete="new-password"
                className="rounded-lg px-2 py-2 pr-11 text-xs placeholder:text-xs lg:py-2.5 lg:pr-11 lg:text-xs"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((visible) => !visible)}
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 transition hover:text-slate-700"
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </FormField>
        </div>
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
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
        <span>
          {hasApiKey
            ? `${maskedApiKey} is saved. Leave this field blank to keep the existing key, or enter a new key to replace it.`
            : "The API key will be encrypted and masked after saving. It will never appear in notification logs or browser responses."}
        </span>
      </div>
    </div>
  );
}
