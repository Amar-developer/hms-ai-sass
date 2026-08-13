import { WhatsAppSettingsDraft } from "../../types";
import { WhatsAppSwitch } from "./WhatsAppSwitch";

const RECIPIENT_OPTIONS = [
  {
    key: "patientNotificationsEnabled" as const,
    label: "Patient notifications",
    description: "Appointments, payments, and invoice receipts.",
  },
  {
    key: "doctorNotificationsEnabled" as const,
    label: "Doctor notifications",
    description: "New appointment alerts for assigned doctors.",
  },
];

export function WhatsAppRecipientControls({
  draft,
  update,
}: {
  draft: WhatsAppSettingsDraft;
  update: <K extends keyof WhatsAppSettingsDraft>(
    key: K,
    value: WhatsAppSettingsDraft[K],
  ) => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-slate-200 p-4">
      <h4 className="card-title font-bold text-slate-800">
        Recipient controls
      </h4>
      <p className="mt-1 card-desc text-slate-500">
        A recipient switch disables every notification for that audience.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {RECIPIENT_OPTIONS.map((option) => (
          <div
            key={option.key}
            className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 p-4"
          >
            <div>
              <p className="text-sm font-bold text-slate-800">
                {option.label}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {option.description}
              </p>
            </div>
            <WhatsAppSwitch
              label={option.label}
              checked={draft[option.key]}
              onChange={(checked) => update(option.key, checked)}
              disabled={!draft.enabled}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
