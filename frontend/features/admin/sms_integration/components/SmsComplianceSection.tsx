import { ScrollText } from "lucide-react";
import { FormField } from "@/app/components/FormElements";
import { Input } from "@/app/components/common/ui";

import { SmsSettingsDraft } from "../types";
import { SmsCheckbox } from "./SmsCheckbox";

export function SmsComplianceSection({
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
    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <ScrollText className="h-4 w-4 text-slate-500" />
        <h4 className="card-title font-bold text-slate-800">
          Sender header and provider confirmations
        </h4>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <FormField label="Approved Sender ID / Header">
          <Input
            value={draft.defaultSenderId}
            onChange={(event: any) =>
              update("defaultSenderId", event.target.value)
            }
            placeholder="MEDIZN"
          />
        </FormField>
        <FormField label="Throughput Limit (per minute)">
          <Input
            type="number"
            min="1"
            value={draft.throughputLimitPerMinute}
            onChange={(event: any) =>
              update("throughputLimitPerMinute", event.target.value)
            }
            placeholder="e.g. 600"
          />
        </FormField>
        <FormField label="Metadata Retention (days)">
          <Input
            type="number"
            min="1"
            value={draft.retentionDays}
            onChange={(event: any) =>
              update("retentionDays", event.target.value)
            }
            placeholder="e.g. 90"
          />
        </FormField>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        <SmsCheckbox
          label="SMSCountry account confirmed"
          hint="Licensed account details and API version are confirmed."
          checked={draft.accountConfirmed}
          onChange={(checked) => update("accountConfirmed", checked)}
        />
        <SmsCheckbox
          label="DPA confirmed"
          hint="Data processing agreement and retention period are agreed."
          checked={draft.dpaConfirmed}
          onChange={(checked) => update("dpaConfirmed", checked)}
        />
        <SmsCheckbox
          label="Pricing and limits confirmed"
          hint="Pricing, balance behaviour, and throughput limits are documented."
          checked={draft.pricingConfirmed}
          onChange={(checked) => update("pricingConfirmed", checked)}
        />
        <SmsCheckbox
          label="Delivery receipts confirmed"
          hint="Delivery receipt states and their meanings are documented."
          checked={draft.deliveryReceiptsConfirmed}
          onChange={(checked) => update("deliveryReceiptsConfirmed", checked)}
        />
        <SmsCheckbox
          label="Callback contract confirmed"
          hint="Webhook payload format and verification method are agreed."
          checked={draft.callbackContractConfirmed}
          onChange={(checked) => update("callbackContractConfirmed", checked)}
        />
        <SmsCheckbox
          label="Static IP allowlisting confirmed"
          hint="Confirmed whether SMSCountry requires static-IP allowlisting."
          checked={draft.staticIpAllowlistingConfirmed}
          onChange={(checked) =>
            update("staticIpAllowlistingConfirmed", checked)
          }
        />
      </div>

      <div className="mt-4">
        <FormField label="Notes">
          <textarea
            value={draft.notes}
            onChange={(event) => update("notes", event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Provider contacts, ticket references, or open questions."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500"
          />
        </FormField>
      </div>
    </div>
  );
}
