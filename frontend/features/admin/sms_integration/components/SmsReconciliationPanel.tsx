import { useCallback, useEffect, useState } from "react";

import { FormField } from "@/app/components/FormElements";
import { Button, Card, Input } from "@/app/components/common/ui";
import {
  createSmsReconciliation,
  fetchSmsReconciliations,
} from "@/features/admin/api/sms.api";
import { SmsReconciliation } from "../types";

function rupees(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(paise / 100);
}

export function SmsReconciliationPanel({
  apiSession,
  tenantId,
  onMessage,
}: {
  apiSession?: any;
  tenantId: string;
  onMessage: (message: string) => void;
}) {
  const [records, setRecords] = useState<SmsReconciliation[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    periodStart: "",
    periodEnd: "",
    providerSegments: "",
    providerAmountRupees: "",
    notes: "",
  });

  const load = useCallback(async () => {
    if (!apiSession || !tenantId) return;
    try {
      const response = await fetchSmsReconciliations({ ...apiSession, tenantId });
      setRecords(Array.isArray(response) ? response : []);
    } catch (error: any) {
      onMessage(error.message || "Could not load SMS reconciliation history.");
    }
  }, [apiSession, onMessage, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!apiSession || !tenantId) return;
    setBusy(true);
    try {
      await createSmsReconciliation(
        { ...apiSession, tenantId },
        {
          period_start: draft.periodStart,
          period_end: draft.periodEnd,
          provider_billed_segments: Number(draft.providerSegments),
          provider_amount_paise: Math.round(
            Number(draft.providerAmountRupees) * 100,
          ),
          notes: draft.notes.trim(),
        },
      );
      setDraft({
        periodStart: "",
        periodEnd: "",
        providerSegments: "",
        providerAmountRupees: "",
        notes: "",
      });
      setExpanded(false);
      onMessage("SMS provider invoice reconciled.");
      await load();
    } catch (error: any) {
      onMessage(error.message || "Could not record SMS reconciliation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 bg-white">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="card-title font-bold text-slate-800">Provider invoice reconciliation</h3>
          <p className="card-desc mt-1 text-slate-500">
            Compare SMSCountry billed segments with the application delivery ledger.
          </p>
        </div>
        <button type="button" className="close-button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Close" : "Record invoice"}
        </button>
      </div>

      {expanded && (
        <form onSubmit={submit} className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-2 xl:grid-cols-5">
          <FormField label="Period start">
            <Input required type="date" value={draft.periodStart} onChange={(event: any) => setDraft((current) => ({ ...current, periodStart: event.target.value }))} />
          </FormField>
          <FormField label="Period end">
            <Input required type="date" value={draft.periodEnd} onChange={(event: any) => setDraft((current) => ({ ...current, periodEnd: event.target.value }))} />
          </FormField>
          <FormField label="Provider segments">
            <Input required min="0" type="number" value={draft.providerSegments} onChange={(event: any) => setDraft((current) => ({ ...current, providerSegments: event.target.value }))} />
          </FormField>
          <FormField label="Provider amount (₹)">
            <Input required min="0" step="0.01" type="number" value={draft.providerAmountRupees} onChange={(event: any) => setDraft((current) => ({ ...current, providerAmountRupees: event.target.value }))} />
          </FormField>
          <div className="flex items-end">
            <Button type="submit" disabled={busy} className="save-button w-full">
              {busy ? "Recording..." : "Record"}
            </Button>
          </div>
          <div className="md:col-span-2 xl:col-span-5">
            <FormField label="Notes">
              <Input maxLength={1000} value={draft.notes} onChange={(event: any) => setDraft((current) => ({ ...current, notes: event.target.value }))} />
            </FormField>
          </div>
        </form>
      )}

      <div className="mt-4 overflow-x-auto">
        {records.length === 0 ? (
          <p className="rounded-lg bg-slate-50 p-4 text-xs text-slate-500">No provider invoices have been reconciled yet.</p>
        ) : (
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Internal</th>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Variance</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{record.period_start} – {record.period_end}</td>
                  <td className="px-3 py-2">{record.internal_segments}</td>
                  <td className="px-3 py-2">{record.provider_billed_segments}</td>
                  <td className={`px-3 py-2 font-bold ${record.variance_segments === 0 ? "text-emerald-700" : "text-amber-700"}`}>{record.variance_segments}</td>
                  <td className="px-3 py-2">{rupees(record.provider_amount_paise)}</td>
                  <td className="max-w-64 truncate px-3 py-2" title={record.notes}>{record.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
