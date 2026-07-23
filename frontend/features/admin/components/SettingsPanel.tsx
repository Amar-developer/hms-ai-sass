import {
  Card,
  Input,
  Field,
  Select,
  Button,
  Badge,
  ActionButton,
  ActionGroup,
} from "@/app/components/common/ui";
import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { FormField } from "@/app/components/FormElements";
import { listValue, settingLabel, settingValueLabel } from "../helpers";
import { MultiCheckSelect } from "./MultiCheckSelect";
import { humanizeOptionLabel, paymentMethodOptions } from "@/lib/options";
import { defaultNumberingEntities } from "../constants";
import { displayDateTime } from "@/utils/helper";
import { Pagination } from "@/app/components/common/Pagination";
import { pageSize } from "@/utils/constants";
import { resolveInvoiceLogoAsset } from "@/lib/imageAssets";
import { RowActions } from "./RowActions";

export function SettingsPanel(props: any) {
  const {
    settings,
    invoicePrefix,
    setInvoicePrefix,
    numberingRules,
    setNumberingRules,
    invoiceLogoUrl,
    setInvoiceLogoUrl,
    bankDetails,
    setBankDetails,
    tenantLogoUrl,
    files,
    apiSession,
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
  const [reportPage, setReportPage] = useState(1);
  const reportTotalPages = Math.max(1, Math.ceil(reportJobs.length / pageSize));
  const safeReportPage = Math.min(reportPage, reportTotalPages);
  const pagedReportJobs = reportJobs.slice(
    (safeReportPage - 1) * pageSize,
    safeReportPage * pageSize,
  );

  useEffect(() => {
    if (reportPage !== safeReportPage) setReportPage(safeReportPage);
  }, [reportPage, safeReportPage]);
  const [invoiceLogoFile, setInvoiceLogoFile] = useState<File | null>(null);
  const effectiveInvoiceLogoUrl = invoiceLogoUrl || tenantLogoUrl || "";
  const [resolvedInvoiceLogoUrl, setResolvedInvoiceLogoUrl] = useState("");

  useEffect(() => {
    let disposed = false;
    let release: () => void = () => undefined;
    setResolvedInvoiceLogoUrl("");
    if (!apiSession) return;
    void resolveInvoiceLogoAsset(
      effectiveInvoiceLogoUrl,
      files || [],
      apiSession,
    ).then((asset) => {
      if (disposed) {
        asset.release();
        return;
      }
      release = asset.release;
      setResolvedInvoiceLogoUrl(asset.url);
    });
    return () => {
      disposed = true;
      release();
    };
  }, [apiSession, effectiveInvoiceLogoUrl, files]);
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
  const setBankDetail = (key: string, value: string) =>
    setBankDetails({ ...bankDetails, [key]: value });

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="card-title font-bold">Tenant & Branch Settings</h3>
        <p className="card-desc text-slate-500">
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
          <div className="md:col-span-2">
            <Field label="Invoice Logo">
              <div className="flex items-center gap-3">
                <label
                  title="Click to change logo"
                  className="group relative grid h-20 w-20 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 transition hover:border-slate-300 hover:bg-slate-100"
                >
                  {invoiceLogoFile ? (
                    <img
                      src={URL.createObjectURL(invoiceLogoFile)}
                      alt="Selected logo"
                      className="h-full w-full object-contain p-1.5"
                    />
                  ) : resolvedInvoiceLogoUrl ? (
                    <img
                      src={resolvedInvoiceLogoUrl}
                      alt="Invoice logo"
                      className="h-full w-full object-contain p-1.5"
                    />
                  ) : (
                    <span className="text-center text-[10px] font-semibold text-slate-400">
                      No logo
                    </span>
                  )}
                  <span className="absolute inset-0 hidden place-items-center bg-slate-900/40 group-hover:grid">
                    <Camera className="h-5 w-5 text-white" />
                  </span>
                  <span className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-slate-900 text-white shadow ring-2 ring-white">
                    <Camera className="h-3.5 w-3.5" />
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event: any) =>
                      setInvoiceLogoFile(event.target.files?.[0] || null)
                    }
                  />
                </label>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {invoiceLogoFile ? (
                    <>
                      <span className="truncate text-xs font-medium text-slate-700">
                        {invoiceLogoFile.name}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            if (!invoiceLogoFile) return;
                            await uploadInvoiceLogo(invoiceLogoFile);
                            setInvoiceLogoFile(null);
                          }}
                          disabled={busy}
                          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
                        >
                          {busy ? "Uploading..." : "Upload"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setInvoiceLogoFile(null)}
                          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {tenantLogoUrl && (
                        <button
                          type="button"
                          onClick={() => setInvoiceLogoUrl(tenantLogoUrl)}
                          className="self-start rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold hover:bg-slate-50"
                        >
                          Use Tenant Logo
                        </button>
                      )}
                      <span className="text-[11px] text-slate-500">
                        Shown on the printable invoice.
                      </span>
                    </>
                  )}
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
        <div className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          Example:{" "}
          {(numberingRules.prefix || invoicePrefix || "SUN").toUpperCase()}-
          {numberingRules.entities?.patient || "PAT"}-
          {String(1).padStart(Number(numberingRules.digits || 5), "0")}
        </div>
        <Button
          onClick={saveSettings}
          disabled={busy}
          className="mt-4 px-2 py-2 rounded-lg text-xs lg:text-sm"
        >
          Save Settings
        </Button>
        <div className="mt-5 grid gap-2 md:grid-cols-2">
          {settings.slice(0, 10).map((setting: any) => (
            <div
              key={setting.id}
              className="rounded-lg bg-slate-50 p-3 text-sm"
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
        <h3 className="card-title font-bold">Accounts & Bank Details</h3>
        <p className="card-desc text-slate-500">
          Maintain tenant bank account details shown on printable invoices.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <FormField label="Account Name">
            <Input
              value={bankDetails.account_name || ""}
              onChange={(e: any) =>
                setBankDetail("account_name", e.target.value)
              }
              placeholder="Tenant legal account name"
            />
          </FormField>
          <FormField label="Bank Branch">
            <Input
              value={bankDetails.branch_name || ""}
              onChange={(e: any) =>
                setBankDetail("branch_name", e.target.value)
              }
              placeholder="Branch"
            />
          </FormField>
          <FormField label="Account Number">
            <Input
              value={bankDetails.account_number || ""}
              onChange={(e: any) =>
                setBankDetail("account_number", e.target.value)
              }
              placeholder="Account number"
            />
          </FormField>
          <FormField label="IFSC">
            <Input
              value={bankDetails.ifsc || ""}
              onChange={(e: any) =>
                setBankDetail("ifsc", e.target.value.toUpperCase())
              }
              placeholder="IFSC"
            />
          </FormField>
          <FormField label="UPI ID">
            <Input
              value={bankDetails.upi_id || ""}
              onChange={(e: any) => setBankDetail("upi_id", e.target.value)}
              placeholder="name@bank"
            />
          </FormField>
          <FormField label="GSTIN">
            <Input
              value={bankDetails.gstin || ""}
              onChange={(e: any) =>
                setBankDetail("gstin", e.target.value.toUpperCase())
              }
              placeholder="Tenant GSTIN"
            />
          </FormField>
        </div>
        <div className="mt-5 flex justify-end">
          <Button
            onClick={saveSettings}
            disabled={busy}
            className="px-4 py-2 text-xs lg:px-5 lg:py-2.5 lg:text-sm"
          >
            {busy ? "Saving..." : "Save Accounts"}
          </Button>
        </div>
      </Card>
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <h3 className="card-title font-bold">Monthly Email Reports</h3>
            <p className="card-desc text-slate-500">
              Send last month revenue, doctor settlement, medical department
              revenue, and paid invoice profit as an Excel-compatible
              spreadsheet through the Redis report worker.
            </p>
          </div>
          <Badge
            tone={reportEnabled ? "green" : "slate"}
            className="rounded-lg py-2 px-2 w-[20%] lg:w-[15%]"
          >
            {reportEnabled ? "Automatic" : "Manual"}
          </Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FormField label="Target Emails">
            <Input
              value={reportRecipients}
              onChange={(e: any) => setReportRecipients(e.target.value)}
              placeholder="owner@clinic.com, accounts@clinic.com"
              className="search-filter"
            />
          </FormField>
          <FormField label="CC Emails">
            <Input
              value={reportCc}
              onChange={(e: any) => setReportCc(e.target.value)}
              placeholder="Optional"
              className="search-filter"
            />
          </FormField>
          <FormField label="Send Day">
            <Input
              type="number"
              min="1"
              max="28"
              value={reportSendDay}
              onChange={(e: any) => setReportSendDay(Number(e.target.value))}
              className="search-filter"
            />
          </FormField>
          <FormField label="Auto Send">
            <Select
              value={reportEnabled ? "enabled" : "disabled"}
              onChange={(e: any) =>
                setReportEnabled(e.target.value === "enabled")
              }
              className="select-filter"
            >
              <option value="disabled">Manual only</option>
              <option value="enabled">Every month</option>
            </Select>
          </FormField>
        </div>
        <div className="mt-4 grid gap-2 rounded-lg bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["overall", "Overall summary"],
            ["doctor", "Doctor revenue"],
            ["department", "Medical department revenue"],
            ["invoice", "Paid invoice details"],
          ].map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-2 text-xs font-bold text-slate-700"
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
            className="save-button"
          >
            {reportBusy === "save" ? "Saving..." : "Save Report Settings"}
          </Button>
          <button
            type="button"
            onClick={sendMonthlyReportNow}
            disabled={reportBusy === "send"}
            className="close-button font-bold text-slate-700 disabled:text-slate-300"
          >
            {reportBusy === "send" ? "Queueing..." : "Send Last Month Now"}
          </button>
        </div>
        <div className="mt-5 overflow-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Job</th>
                <th className="">Time</th>
                <th className="w-[100px]">Status</th>
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
              {pagedReportJobs.map((job: any, index: number) => (
                <tr key={job.id}>
                  <td className="px-4 py-4 text-sm">
                    <b>Report {(safeReportPage - 1) * pageSize + index + 1}</b>
                  </td>
                  <td>
                    <p className="text-xs text-slate-500">
                      {displayDateTime(job.created_at)}
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
                      className="table-status w-[60%] text-xs"
                    >
                      {humanizeOptionLabel(job.status)}
                    </Badge>
                  </td>
                  <td className="text-xs">
                    {job.period_start} to {job.period_end}
                  </td>
                  <td className="text-xs truncate">
                    {(job.recipients || []).join(", ")}
                  </td>
                  <td className="pr-4 text-xs text-slate-500">
                    <div
                      className="truncate w-[100px]"
                      title={job.failure_reason || job.attachment_filename}
                    >
                      {job.failure_reason || job.attachment_filename || "-"}
                    </div>
                  </td>
                  <td>
                    <RowActions
                      actions={[
                        {
                          label:
                            reportBusy === `resend-${job.id}`
                              ? "Sending..."
                              : "Resend",
                          onClick: () => resendMonthlyReport(job),
                          disabled: reportBusy === `resend-${job.id}`,
                        },
                        {
                          label:
                            reportBusy === `download-${job.id}`
                              ? "Downloading..."
                              : "Download",
                          onClick: () => downloadMonthlyReport(job),
                          disabled: reportBusy === `download-${job.id}`,
                        },
                      ]}
                      className="right-24 -bottom-3"
                      width="w-24"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={safeReportPage}
          totalPages={reportTotalPages}
          total={reportJobs.length}
          onPage={setReportPage}
        />
      </Card>
    </div>
  );
}
