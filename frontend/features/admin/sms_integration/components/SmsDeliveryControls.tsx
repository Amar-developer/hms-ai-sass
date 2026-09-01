import { Gauge } from "lucide-react";
import { FormField } from "@/app/components/FormElements";
import { Input } from "@/app/components/common/ui";

import { SmsSettingsDraft } from "../types";
import { SmsCheckbox } from "./SmsCheckbox";

export function SmsDeliveryControls({
  draft,
  update,
}: {
  draft: SmsSettingsDraft;
  update: <K extends keyof SmsSettingsDraft>(
    key: K,
    value: SmsSettingsDraft[K],
  ) => void;
}) {
  return (
    <div className="mt-5 rounded-xl border border-slate-200 p-4">
      <div className="mb-4 flex items-center gap-2">
        <Gauge className="h-4 w-4 text-slate-500" />
        <h4 className="card-title font-bold text-slate-800">
          Recipients and volume limits
        </h4>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <SmsCheckbox
          label="Send to patients"
          hint="Patient-facing SMS workflows are allowed for this tenant."
          checked={draft.patientNotificationsEnabled}
          onChange={(checked) => update("patientNotificationsEnabled", checked)}
        />
        <SmsCheckbox
          label="Send to staff"
          hint="Internal staff notifications are allowed for this tenant."
          checked={draft.staffNotificationsEnabled}
          onChange={(checked) => update("staffNotificationsEnabled", checked)}
        />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <FormField label="Daily Message Limit">
          <Input
            type="number"
            min="1"
            value={draft.dailyMessageLimit}
            onChange={(event: any) =>
              update("dailyMessageLimit", event.target.value)
            }
            placeholder="Leave blank for no limit"
          />
        </FormField>
        <FormField label="Monthly Segment Limit">
          <Input
            type="number"
            min="1"
            value={draft.monthlySegmentLimit}
            onChange={(event: any) =>
              update("monthlySegmentLimit", event.target.value)
            }
            placeholder="Leave blank for no limit"
          />
        </FormField>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        A message longer than the segment cap is billed as multiple segments.
        Limits are counted per tenant.
      </p>
    </div>
  );
}
