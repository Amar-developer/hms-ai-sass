import {
  Card,
  Input,
  Field,
  Select,
  Button,
  Badge,
  ActionButton,
  ActionGroup,
} from "../common/ui";
import { useState } from "react";
import { FormField } from "../FormElements";
import {
  assetUrl,
  listValue,
  settingLabel,
  settingValueLabel,
} from "@/utils/tenantAdmin/helpers";
import { MultiCheckSelect } from "./Shared";
import { humanizeOptionLabel, paymentMethodOptions } from "@/lib/options";
import { defaultNumberingEntities } from "@/utils/tenantAdmin/constants";

export function SettingsPanel(props: any) {
  const {
    settings,
    invoicePrefix,
    setInvoicePrefix,
    numberingRules,
    setNumberingRules,
    invoiceLogoUrl,
    setInvoiceLogoUrl,
    tenantLogoUrl,
    uploadInvoiceLogo,
    requeueAfter,
    setRequeueAfter,
    noShowAfter,
    setNoShowAfter,
    slotIntervalsEnabled,
    setSlotIntervalsEnabled,
    slotIntervalMinutes,
    setSlotIntervalMinutes,
    payments,
    setPayments,
    providers,
    setProviders,
    busy,
    saveSettings,
    reportEnabled,
    setReportEnabled,
    reportRecipients,
    setReportRecipients,
    reportCc,
    setReportCc,
    reportSendDay,
    setReportSendDay,
    reportFilters,
    setReportFilters,
    reportJobs,
    reportBusy,
    saveReportSettings,
    sendMonthlyReportNow,
    resendMonthlyReport,
    downloadMonthlyReport,
  } = props;
  const [invoiceLogoFile, setInvoiceLogoFile] = useState<File | null>(null);
  const effectiveInvoiceLogoUrl = invoiceLogoUrl || tenantLogoUrl || "";
  const toggleReportFilter = (key: string) => (event: any) =>
    setReportFilters({ ...reportFilters, [key]: event.target.checked });
  const setRule = (key: string, value: any) =>
    setNumberingRules({ ...numberingRules, [key]: value });
  const setEntity = (key: string, value: string) =>
    setNumberingRules({
      ...numberingRules,
      entities: {
        ...(numberingRules.entities || {}),
        [key]: value.toUpperCase(),
      },
    });
  return (
    <div className="space-y-5">
      <Card>
        <h3 className="text-lg font-bold">Tenant & Branch Settings</h3>
        <p className="text-sm text-slate-500">
          Configuration affects invoice numbering, queue behavior, appointment
          slots, payments, and communications for this tenant.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FormField label="Document Prefix">
            <Input
              value={numberingRules.prefix || invoicePrefix}
              onChange={(e: any) => {
                setInvoicePrefix(e.target.value);
                setRule("prefix", e.target.value.toUpperCase());
              }}
              placeholder="SUN"
            />
          </FormField>
          <FormField label="Number Digits">
            <Input
              type="number"
              min="1"
              max="12"
              value={numberingRules.digits || 5}
              onChange={(e: any) =>
                setRule("digits", Number(e.target.value || 5))
              }
            />
          </FormField>
          <div className="md:col-span-2 xl:col-span-4">
            <Field label="Invoice Logo">
              <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 lg:grid-cols-[160px_minmax(0,1fr)]">
                <div className="grid h-32 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-3">
                  {effectiveInvoiceLogoUrl ? (
                    <img
                      src={assetUrl(effectiveInvoiceLogoUrl)}
                      alt="Invoice logo"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-center text-xs font-semibold text-slate-400">
                      No logo selected
                    </span>
                  )}
                </div>
                <div className="grid content-start gap-3">
                  <Input
                    value={invoiceLogoUrl}
                    onChange={(e: any) => setInvoiceLogoUrl(e.target.value)}
                    placeholder={tenantLogoUrl || "/uploads/logo.jpg"}
                  />
                  <div className="flex flex-wrap gap-2">
                    {tenantLogoUrl && (
                      <button
                        type="button"
                        onClick={() => setInvoiceLogoUrl(tenantLogoUrl)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold hover:bg-slate-50"
                      >
                        Use Tenant Logo
                      </button>
                    )}
                    <label className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold hover:bg-slate-50">
                      Choose Logo
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(event: any) =>
                          setInvoiceLogoFile(event.target.files?.[0] || null)
                        }
                      />
                    </label>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!invoiceLogoFile) return;
                        await uploadInvoiceLogo(invoiceLogoFile);
                        setInvoiceLogoFile(null);
                      }}
                      disabled={!invoiceLogoFile || busy}
                      className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
                    >
                      {busy ? "Uploading..." : "Upload Logo"}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">
                    {invoiceLogoFile
                      ? invoiceLogoFile.name
                      : "Shown on invoice print and PDF output."}
                  </p>
                </div>
              </div>
            </Field>
          </div>
          <Field label="Requeue After">
            <Input
              type="number"
              value={requeueAfter}
              onChange={(e: any) => setRequeueAfter(Number(e.target.value))}
            />
          </Field>
          <FormField label="No-show Calls">
            <Input
              type="number"
              value={noShowAfter}
              onChange={(e: any) => setNoShowAfter(Number(e.target.value))}
            />
          </FormField>
          <FormField label="Slot Display">
            <Select
              value={slotIntervalsEnabled ? "intervals" : "sessions"}
              onChange={(e: any) =>
                setSlotIntervalsEnabled(e.target.value === "intervals")
              }
            >
              <option value="sessions">Consultation timings only</option>
              <option value="intervals">Detailed interval slots</option>
            </Select>
          </FormField>
          <FormField label="Interval Minutes">
            <Input
              type="number"
              min="5"
              step="5"
              value={slotIntervalMinutes}
              onChange={(e: any) =>
                setSlotIntervalMinutes(Number(e.target.value))
              }
              disabled={!slotIntervalsEnabled}
            />
          </FormField>
          <div className="md:col-span-2 xl:col-span-4">
            <Field label="Payment Methods">
              <MultiCheckSelect
                options={paymentMethodOptions}
                selected={listValue(payments)}
                onChange={(values: string[]) => setPayments(values.join(","))}
                allLabel="All payment methods"
              />
            </Field>
          </div>
          <Field label="Communication">
            <Input
              value={providers}
              onChange={(e: any) => setProviders(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {Object.entries(
            numberingRules.entities || defaultNumberingEntities,
          ).map(([key, value]: any) => (
            <FormField key={key} label={`${humanizeOptionLabel(key)} Code`}>
              <Input
                value={value}
                onChange={(e: any) => setEntity(key, e.target.value)}
              />
            </FormField>
          ))}
        </div>
        <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
          Example:{" "}
          {(numberingRules.prefix || invoicePrefix || "SUN").toUpperCase()}-
          {numberingRules.entities?.patient || "PAT"}-
          {String(1).padStart(Number(numberingRules.digits || 5), "0")}
        </div>
        <Button onClick={saveSettings} disabled={busy} className="mt-4 text-xs lg:text-sm py-2 px-2 lg:py-3 lg:px-4">
          Save Settings
        </Button>
        <div className="mt-5 grid gap-2 md:grid-cols-2">
          {settings.slice(0, 10).map((setting: any) => (
            <div
              key={setting.id}
              className="rounded-2xl bg-slate-50 p-3 text-sm"
            >
              <b>{settingLabel(setting.key)}</b>
              <p className="break-words text-slate-500">
                {settingValueLabel(setting.value)}
              </p>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <h3 className="text-lg font-bold">Monthly Email Reports</h3>
            <p className="text-sm text-slate-500">
              Send last month revenue, doctor settlement, medical department
              revenue, and paid invoice profit as an Excel-compatible
              spreadsheet through the Redis report worker.
            </p>
          </div>
          <Badge tone={reportEnabled ? "green" : "slate"}>
            {reportEnabled ? "Automatic" : "Manual"}
          </Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FormField label="Target Emails">
            <Input
              value={reportRecipients}
              onChange={(e: any) => setReportRecipients(e.target.value)}
              placeholder="owner@clinic.com, accounts@clinic.com"
            />
          </FormField>
          <FormField label="CC Emails">
            <Input
              value={reportCc}
              onChange={(e: any) => setReportCc(e.target.value)}
              placeholder="Optional"
            />
          </FormField>
          <FormField label="Send Day">
            <Input
              type="number"
              min="1"
              max="28"
              value={reportSendDay}
              onChange={(e: any) => setReportSendDay(Number(e.target.value))}
            />
          </FormField>
          <FormField label="Auto Send">
            <Select
              value={reportEnabled ? "enabled" : "disabled"}
              onChange={(e: any) =>
                setReportEnabled(e.target.value === "enabled")
              }
            >
              <option value="disabled">Manual only</option>
              <option value="enabled">Every month</option>
            </Select>
          </FormField>
        </div>
        <div className="mt-4 grid gap-2 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["overall", "Overall summary"],
            ["doctor", "Doctor revenue"],
            ["department", "Medical department revenue"],
            ["invoice", "Paid invoice details"],
          ].map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-2 text-sm font-bold text-slate-700"
            >
              <input
                type="checkbox"
                checked={Boolean(reportFilters?.[key])}
                onChange={toggleReportFilter(key)}
              />
              {label}
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={saveReportSettings}
            disabled={reportBusy === "save"}
          >
            {reportBusy === "save" ? "Saving..." : "Save Report Settings"}
          </Button>
          <button
            type="button"
            onClick={sendMonthlyReportNow}
            disabled={reportBusy === "send"}
            className="rounded-2xl border px-4 py-3 text-sm font-bold text-slate-700 disabled:text-slate-300"
          >
            {reportBusy === "send" ? "Queueing..." : "Send Last Month Now"}
          </button>
        </div>
        <div className="mt-5 overflow-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Job</th>
                <th>Status</th>
                <th>Period</th>
                <th>Recipients</th>
                <th>Result</th>
                <th className="pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {reportJobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-slate-500">
                    No monthly report jobs yet.
                  </td>
                </tr>
              )}
              {reportJobs.map((job: any, index: number) => (
                <tr key={job.id}>
                  <td className="px-4 py-4">
                    <b>Report {index + 1}</b>
                    <p className="text-xs text-slate-500">
                      {new Date(job.created_at).toLocaleString()}
                    </p>
                  </td>
                  <td>
                    <Badge
                      tone={
                        job.status === "sent"
                          ? "green"
                          : job.status === "failed"
                            ? "red"
                            : job.status === "running"
                              ? "blue"
                              : "amber"
                      }
                    >
                      {humanizeOptionLabel(job.status)}
                    </Badge>
                  </td>
                  <td>
                    {job.period_start} to {job.period_end}
                  </td>
                  <td>{(job.recipients || []).join(", ")}</td>
                  <td className="pr-4 text-slate-500">
                    {job.failure_reason || job.attachment_filename || "-"}
                  </td>
                  <td className="pr-4">
                    <ActionGroup className="justify-start">
                      <ActionButton
                        onClick={() => resendMonthlyReport(job)}
                        disabled={reportBusy === `resend-${job.id}`}
                      >
                        {reportBusy === `resend-${job.id}`
                          ? "Sending..."
                          : "Resend"}
                      </ActionButton>
                      <ActionButton
                        onClick={() => downloadMonthlyReport(job)}
                        disabled={reportBusy === `download-${job.id}`}
                      >
                        {reportBusy === `download-${job.id}`
                          ? "Downloading..."
                          : "Download"}
                      </ActionButton>
                    </ActionGroup>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
