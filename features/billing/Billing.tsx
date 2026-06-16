"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionButton,
  ActionGroup,
  Badge,
  Button,
  Card,
  Input,
  RefreshButton,
  Select,
  StatusToast,
} from "@/components/common/ui";
import { DateField, SelectField, TextField } from "@/components/FormElements";
import { apiBlob, apiFetch } from "@/lib/api";
import { paymentMethodOptions } from "@/lib/options";
import { Pagination } from "@/components/common/Pagination";
import { formatInvoiceDate, invoiceDateKey, invoicePaidStatus, invoiceSource, invoiceSourceKey, money } from "@/utils/billing/helpers";
import { pageSize } from "@/utils/constants";
import { InvoiceDetailPage } from "@/components/billing/Shared";


export function Billing({apiSession,loadLiveData,appointments,patients,liveInvoices}:any){
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');
  const [amounts,setAmounts]=useState<Record<string,string>>({});
  const [methods,setMethods]=useState<Record<string,string>>({});
  const [enabledPaymentMethods,setEnabledPaymentMethods]=useState<string[]>(paymentMethodOptions.map((option)=>option.value));
  const [references,setReferences]=useState<Record<string,string>>({});
  const [dueReport,setDueReport]=useState<any>(null);
  const [revenueReport,setRevenueReport]=useState<any>(null);
  const [settlement,setSettlement]=useState<any>(null);
  const [detail,setDetail]=useState<any>(null);
  const [supplierOptions,setSupplierOptions]=useState<Record<string,any[]>>({});
  const [detailLoading,setDetailLoading]=useState('');
  const [filters,setFilters]=useState({
    query:'',
    source:'all',
    paidStatus:'all',
    fromDate:'',
    toDate:'',
  });
  const [page, setPage] = useState(1);

  const patientMap = useMemo(
    () => new Map(patients.map((p: any) => [p.id, p])),
    [patients],
  );
  useEffect(() => {
    let alive = true;
    apiFetch(
      "/settings/resolve?module=payment&key=payment.methods_enabled",
      apiSession,
    )
      .then((row: any) => {
        const values = Array.isArray(row?.value) ? row.value : [];
        const allowed = new Set<string>(
          paymentMethodOptions.map((option) => option.value),
        );
        const filtered = values.filter((value: string) => allowed.has(value));
        if (alive && filtered.length) setEnabledPaymentMethods(filtered);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [apiSession]);
  const invoicePaymentOptions = useMemo(() => {
    const selected = new Set(enabledPaymentMethods);
    const rows = paymentMethodOptions.filter((option) =>
      selected.has(option.value),
    );
    return rows.length ? rows : paymentMethodOptions;
  }, [enabledPaymentMethods]);
  const defaultPaymentMethod = invoicePaymentOptions[0]?.value || "cash";
  const invoices = useMemo(
    () =>
      [...(liveInvoices || [])].sort(
        (a: any, b: any) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime(),
      ),
    [liveInvoices],
  );
  const sourceOptions = useMemo(() => {
    const seen = new Set<string>();
    return invoices
      .map((invoice: any) => ({
        key: invoiceSourceKey(invoice),
        ...invoiceSource(invoice),
      }))
      .filter((source: any) => {
        if (seen.has(source.key)) return false;
        seen.add(source.key);
        return true;
      });
  }, [invoices]);
  const filteredInvoices = useMemo(
    () =>
      invoices.filter((invoice: any) => {
        const source = invoiceSource(invoice);
        const patient: any = patientMap.get(invoice.patient_id);
        const haystack = [
          invoice.invoice_number,
          invoice.patient_name,
          invoice.patient_mobile,
          patient?.name,
          patient?.full_name,
          patient?.patient_number,
          patient?.mobile,
          patient?.alternate_mobile,
          patient?.guardian_mobile,
          patient?.guardianMobile,
          source.label,
          invoice.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const query = filters.query.trim().toLowerCase();
        if (query && !haystack.includes(query)) return false;
        if (
          filters.source !== "all" &&
          invoiceSourceKey(invoice) !== filters.source
        )
          return false;
        if (filters.paidStatus === "due") {
          if (Number(invoice.balance_amount || 0) <= 0) return false;
        } else if (
          filters.paidStatus !== "all" &&
          invoicePaidStatus(invoice) !== filters.paidStatus
        )
          return false;
        const dateKey = invoiceDateKey(invoice);
        if (filters.fromDate && (!dateKey || dateKey < filters.fromDate))
          return false;
        if (filters.toDate && (!dateKey || dateKey > filters.toDate))
          return false;
        return true;
      }),
    [filters, invoices, patientMap],
  );
  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const invoicePageRows = filteredInvoices.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const invoicedConsultations = new Set(
    invoices.map((i: any) => i.consultation_id).filter(Boolean),
  );
  const invoicedAppointments = new Set(
    invoices
      .filter((i: any) => i.consultation_id)
      .map((i: any) => i.appointment_id)
      .filter(Boolean),
  );
  const signedReady = appointments.filter((a: any) => {
    const status = String(
      a.consultationStatus || a.consultation_status || "",
    ).toLowerCase();
    const consultationId = a.consultationId || a.consultation_id;
    return (
      consultationId &&
      status === "signed" &&
      !invoicedConsultations.has(consultationId) &&
      !invoicedAppointments.has(a.id)
    );
  });
  const payableSettlement = Number(
    settlement?.payable_settlement_amount ??
      settlement?.doctor_share_paid_basis ??
      settlement?.settlement_amount ??
      0,
  );
  const finalizedSettlement = Number(
    settlement?.finalized_settlement_amount ?? 0,
  );
  const canFinalizeSettlement = Boolean(
    settlement?.can_finalize ?? payableSettlement > 0,
  );

  useEffect(() => {
    if (apiSession) loadReports();
  }, [apiSession?.token, apiSession?.tenantId, invoices.length]);
  useEffect(() => {
    setPage(1);
  }, [
    filters.query,
    filters.source,
    filters.paidStatus,
    filters.fromDate,
    filters.toDate,
  ]);
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);
  useEffect(() => {
    if (!apiSession || typeof window === "undefined") return;
    const invoiceId = window.sessionStorage.getItem(
      "medizinhub.billingInvoiceId",
    );
    if (!invoiceId) return;
    window.sessionStorage.removeItem("medizinhub.billingInvoiceId");
    openInvoiceDetail({ id: invoiceId });
  }, [apiSession?.token, apiSession?.tenantId]);

  function updateFilter(key: string, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setFilters({
      query: "",
      source: "all",
      paidStatus: "all",
      fromDate: "",
      toDate: "",
    });
  }

  async function loadReports() {
    if (!apiSession) return;
    try {
      const [due, revenue, summary] = await Promise.all([
        apiFetch("/billing/reports/due-collection", apiSession),
        apiFetch("/billing/reports/revenue?group_by=doctor", apiSession),
        apiFetch("/billing/doctor-settlements/summary", apiSession),
      ]);
      setDueReport(due);
      setRevenueReport(revenue);
      setSettlement(summary);
    } catch {}
  }

  async function refreshBillingData() {
    if (!apiSession) return;
    setMessage("");
    try {
      await loadLiveData(apiSession);
      await loadReports();
      setMessage("Invoices refreshed.");
    } catch (err: any) {
      setMessage(err.message || "Could not refresh invoices.");
    }
  }

  async function generateInvoice(a: any) {
    if (!apiSession) return;
    setBusy(a.id);
    setMessage("");
    try {
      const row = await apiFetch(
        "/billing/invoices/from-consultation",
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            consultation_id: a.consultationId,
            discount_amount: 0,
            created_by_user_id: apiSession.user?.id,
          }),
        },
      );
      await loadLiveData(apiSession);
      await loadReports();
      setDetail(row);
      setMessage(
        `Invoice ${row.invoice?.invoice_number || ""} generated for ${a.patient}.`,
      );
    } catch (err: any) {
      setMessage(err.message || "Could not generate invoice.");
    } finally {
      setBusy("");
    }
  }

  async function refreshConsultationInvoice(invoice: any) {
    if (!apiSession || !invoice.consultation_id) return;
    setBusy(`refresh-${invoice.id}`);
    setMessage("");
    try {
      await apiFetch("/billing/invoices/from-consultation", apiSession, {
        method: "POST",
        body: JSON.stringify({
          consultation_id: invoice.consultation_id,
          discount_amount: invoice.discount_amount || 0,
          created_by_user_id: apiSession.user?.id,
        }),
      });
      await loadLiveData(apiSession);
      await loadReports();
      setMessage(`Invoice refreshed for ${invoice.invoice_number}.`);
    } catch (err: any) {
      setMessage(err.message || "Could not refresh invoice items.");
    } finally {
      setBusy("");
    }
  }

  async function openInvoiceDetail(invoice: any) {
    if (!apiSession) return;
    setDetailLoading(invoice.id);
    setMessage("");
    try {
      const row = await apiFetch(`/billing/invoices/${invoice.id}`, apiSession);
      setDetail(row);
      await loadInvoiceSupplierOptions(row);
    }catch(err:any){setMessage(err.message||'Could not load invoice details.')}
    finally{setDetailLoading('')}
  }

  async function loadInvoiceSupplierOptions(row:any){
    if(!apiSession||!row?.invoice?.lab_order_id){setSupplierOptions({});return}
    const optionRows=await Promise.all(
      (row.items||[]).map((item:any)=>
        apiFetch(`/billing/invoices/${row.invoice.id}/items/${item.id}/supplier-options`,apiSession)
          .then((options:any)=>[item.id,Array.isArray(options)?options:[]])
          .catch(()=>[item.id,[]]),
      ),
    );
    setSupplierOptions(Object.fromEntries(optionRows));
  }

  async function collectPayment(invoice:any){
    if(!apiSession)return;
    const amount=Number(amounts[invoice.id]||invoice.balance_amount||0);
    if(!amount){setMessage('Enter payment amount.');return}
    setBusy(invoice.id);
    setMessage("");
    try {
      await apiFetch(`/billing/invoices/${invoice.id}/payments`, apiSession, {
        method: "POST",
        body: JSON.stringify({
          method: methods[invoice.id] || defaultPaymentMethod,
          amount,
          reference_number: references[invoice.id] || null,
          collected_by_user_id: apiSession.user?.id,
        }),
      });
      await loadLiveData(apiSession);
      await loadReports();
      setAmounts({ ...amounts, [invoice.id]: "" });
      setReferences({ ...references, [invoice.id]: "" });
      setMessage(`Payment recorded for ${invoice.invoice_number}.`);
    } catch (err: any) {
      setMessage(err.message || "Could not record payment.");
    } finally {
      setBusy("");
    }
  }

  async function collectSplitPayment(invoice: any, rows: any[]) {
    if (!apiSession) return;
    const valid = (rows || [])
      .map((row) => ({
        method: row.method || defaultPaymentMethod,
        amount: Number(row.amount || 0),
        reference_number: row.reference?.trim() ? row.reference.trim() : null,
      }))
      .filter((row) => row.amount > 0);
    if (!valid.length) {
      setMessage("Enter at least one payment amount.");
      return;
    }
    const total = valid.reduce((sum, row) => sum + row.amount, 0);
    const balance = Number(invoice.balance_amount || 0);
    if (total > balance) {
      setMessage(`Total ${money(total)} exceeds balance due ${money(balance)}.`);
      return;
    }
    setBusy(invoice.id);
    setMessage("");
    try {
      for (const row of valid) {
        await apiFetch(`/billing/invoices/${invoice.id}/payments`, apiSession, {
          method: "POST",
          body: JSON.stringify({ ...row, collected_by_user_id: apiSession.user?.id }),
        });
      }
      await loadLiveData(apiSession);
      await loadReports();
      await openInvoiceDetail(invoice);
      const modes = valid.length > 1 ? `${valid.length} payment modes` : valid[0].method;
      setMessage(`Recorded ${money(total)} (${modes}) for ${invoice.invoice_number}.`);
    } catch (err: any) {
      setMessage(err.message || "Could not record payment.");
    } finally {
      setBusy("");
    }
  }

  async function applyMembershipBenefit(invoice: any) {
    if (!apiSession) return;
    setBusy(`membership-${invoice.id}`);
    setMessage("");
    try {
      const row = await apiFetch(
        `/billing/invoices/${invoice.id}/membership-benefit/apply`,
        apiSession,
        { method: "POST" },
      );
      setDetail(row);
      await loadLiveData(apiSession);
      await loadReports();
      setMessage(`Membership benefit applied to ${invoice.invoice_number}.`);
    } catch (err: any) {
      setMessage(err.message || "Could not apply membership benefit.");
    } finally {
      setBusy("");
    }
  }

  async function issueCreditNote(invoice: any) {
    if (!apiSession) return;
    const reason = window.prompt(
      `Credit note reason for ${invoice.invoice_number}`,
    );
    if (!reason) return;
    setBusy(invoice.id);
    try {
      await apiFetch(
        `/billing/invoices/${invoice.id}/credit-notes`,
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            amount: Math.max(1, invoice.balance_amount || invoice.total_amount),
            reason,
            created_by_user_id: apiSession.user?.id,
          }),
        },
      );
      setMessage(`Credit note issued for ${invoice.invoice_number}.`);
    } catch (err: any) {
      setMessage(err.message || "Could not issue credit note.");
    } finally {
      setBusy("");
    }
  }

  async function openReceipt(invoice: any) {
    if (!apiSession) return;
    setBusy(invoice.id);
    try {
      const blob = await apiBlob(
        `/billing/invoices/${invoice.id}/receipt.pdf`,
        apiSession,
      );
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err: any) {
      setMessage(err.message || "Could not open receipt.");
    } finally {
      setBusy("");
    }
  }

  async function updateInvoiceItemSupplier(invoice:any,item:any,supplierId:string){
    if(!apiSession)return;
    setBusy(`supplier-${item.id}`);
    setMessage('');
    try{
      const row=await apiFetch(`/billing/invoices/${invoice.id}/items/${item.id}/supplier`,apiSession,{
        method:'PATCH',
        body:JSON.stringify({supplier_id:supplierId||null}),
      });
      setDetail(row);
      await loadInvoiceSupplierOptions(row);
      setMessage('Supplier updated.');
    }catch(err:any){setMessage(err.message||'Could not update supplier.')}
    finally{setBusy('')}
  }

  async function updateInvoiceAmount(invoice:any,amount:number){
    if(!apiSession)return;
    setBusy(`amount-${invoice.id}`);
    setMessage('');
    try{
      const row=await apiFetch(`/billing/invoices/${invoice.id}/amount`,apiSession,{
        method:'PATCH',
        body:JSON.stringify({amount,updated_by_user_id:apiSession.user?.id}),
      });
      setDetail(row);
      setMessage('Invoice amount updated.');
    }catch(err:any){setMessage(err.message||'Could not update amount.')}
    finally{setBusy('')}
  }

  async function finalizeSettlement(){
    if(!apiSession)return;
    setBusy('settlement');
    try{
      const saved=await apiFetch('/billing/doctor-settlements/finalize',apiSession,{
        method:'POST',
        body:JSON.stringify({finalized_by_user_id:apiSession.user?.id}),
      });
      setSettlement(saved);
      await loadReports();
      setMessage(
        `Doctor settlement finalized for ${money(saved.settlement_amount)}.`,
      );
    } catch (err: any) {
      setMessage(err.message || "Could not finalize settlement.");
    } finally {
      setBusy("");
    }
  }

  if (!apiSession) {
    return (
      <Card>
        <h3 className="text-lg font-bold">Invoices / Billing</h3>
        <p className="mt-2 text-sm text-slate-500">
          Backend login is required to view billing data.
        </p>
      </Card>
    );
  }

  if (detail) {
    return (
      <InvoiceDetailPage
        detail={detail}
        patient={patientMap.get(detail.invoice?.patient_id)}
        onClose={() => setDetail(null)}
        methods={methods}
        setMethods={setMethods}
        amounts={amounts}
        setAmounts={setAmounts}
        references={references}
        setReferences={setReferences}
        invoicePaymentOptions={invoicePaymentOptions}
        defaultPaymentMethod={defaultPaymentMethod}
        busy={busy}
        collectPayment={async (invoice: any) => {
          await collectPayment(invoice);
          await openInvoiceDetail(invoice);
        }}
        collectSplitPayment={collectSplitPayment}
        refreshConsultationInvoice={async (invoice: any) => {
          await refreshConsultationInvoice(invoice);
          await openInvoiceDetail(invoice);
        }}
        applyMembershipBenefit={applyMembershipBenefit}
        openReceipt={openReceipt}
        issueCreditNote={issueCreditNote}
        supplierOptions={supplierOptions}
        updateInvoiceItemSupplier={updateInvoiceItemSupplier}
        updateInvoiceAmount={updateInvoiceAmount}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-4 lg:grid-cols-4">
        <Card>
          <p className="text-xs lg:text-sm text-slate-500">Due Collection</p>
          <p className="mt-1 text-xl lg:text-2xl font-bold">
            {money(dueReport?.total_due_amount)}
          </p>
          <p className="text-[10px] lg:text-xs text-slate-500">
            {dueReport?.invoice_count ?? 0} invoices
          </p>
        </Card>
        <Card>
          <p className="text-xs lg:text-sm text-slate-500">Revenue</p>
          <p className="mt-1 text-xl lg:text-2xl font-bold">
            {money(revenueReport?.total_invoice_amount)}
          </p>
          <p className="text-[10px] lg:text-xs text-slate-500">Collected invoice value</p>
        </Card>
        <Card>
          <p className="text-xs lg:text-sm text-slate-500">Paid</p>
          <p className="mt-1 text-xl lg:text-2xl font-bold">
            {money(revenueReport?.total_paid_amount)}
          </p>
          <p className="text-[10px] lg:text-xs text-slate-500">
            Settlement {money(revenueReport?.total_doctor_share)}
          </p>
        </Card>
        <Card>
          <p className="text-xs lg:text-sm text-slate-500">Settlement</p>
          <p className="mt-1 text-xl lg:text-2xl   font-bold">{money(payableSettlement)}</p>
          <p className="text-[10px] lg:text-xs text-slate-500">
            {finalizedSettlement > 0
              ? `Finalized ${money(finalizedSettlement)}`
              : "No finalized settlement yet"}
          </p>
          {canFinalizeSettlement ? (
            <button
              type="button"
              onClick={finalizeSettlement}
              className="mt-2 rounded-lg border px-3 py-2 text-xs font-bold"
              disabled={busy === "settlement"}
            >
              {busy === "settlement" ? "Finalizing..." : "Finalize"}
            </button>
          ) : (
            <Badge tone="green" className="inline table-status rounded-lg text-[11px] lg:text-sm w-2/3">Finalized</Badge>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="text-base lg:text-lg font-bold">
          Pending Consultation Invoices
        </h3>
        <p className="table-data text-slate-500">
          Reception can generate the consultation-fee invoice after the doctor
          signs the consultation. Lab, pharmacy, IP, and physiotherapy each have
          their own invoices created by those modules.
        </p>
        <StatusToast message={message} onClose={() => setMessage("")} />
        <div className="mt-4 grid gap-3">
          {signedReady.length === 0 && (
            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
              All signed consultations already have invoices.
            </div>
          )}
          {signedReady.map((a: any) => (
            <div
              key={a.id}
              className="flex flex-col justify-between gap-3 rounded-2xl border p-4 md:flex-row md:items-center"
            >
              <div>
                <b className="text-lg lg:text-xl">
                  {a.token} · {a.patient}
                </b>
                <p className="text-xs lg:text-sm text-slate-500">
                  Signed consultation ready for billing
                </p>
              </div>
              <Button
                disabled={busy === a.id}
                onClick={() => generateInvoice(a)}
              >
                {busy === a.id ? "Generating..." : "Generate Invoice"}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
          <div>
            <h3 className="text-base lg:text-lg font-bold">
              Invoices & Payments
            </h3>
            <p className="text-xs lg:text-sm text-slate-500">
              Track invoice source, patient dues, settlement share, and payment
              collection in one list.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={refreshBillingData} />
            <Badge tone="slate" className="normal-badge">
              {filteredInvoices.length} of {invoices.length} invoices
            </Badge>
          </div>
        </div>
        <div className="mt-4 grid gap-3 grid-cols-6 xl:grid-cols-[1.2fr_.85fr_.85fr_.75fr_.75fr_auto] xl:items-end items-end">
          <TextField
            label="Search"
            value={filters.query}
            onChange={(v) => updateFilter("query", v)}
            placeholder="Invoice, patient, source"
            className="search-input"
          />
          <SelectField
            label="Source"
            value={filters.source}
            onChange={(v) => updateFilter("source", v)}
            options={[
              { value: "all", label: "All sources" },
              ...sourceOptions.map((s: any) => ({
                value: s.key,
                label: s.label,
              })),
            ]}
          />
          <SelectField
            label="Paid Status"
            value={filters.paidStatus}
            onChange={(v) => updateFilter("paidStatus", v)}
            options={[
              { value: "all", label: "All payments" },
              { value: "paid", label: "Paid" },
              { value: "due", label: "Due" },
              { value: "partially_paid", label: "Partially paid" },
              { value: "unpaid", label: "Unpaid" },
            ]}
          />
          <DateField
            label="From Date"
            value={filters.fromDate}
            onChange={(v) => updateFilter("fromDate", v)}
          />
          <DateField
            label="To Date"
            value={filters.toDate}
            onChange={(v) => updateFilter("toDate", v)}
          />
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-lg border border-slate-200 py-1 px-1 h-8 lg:h-12 text-xs lg:px-4 lg:py-3 lg:text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Clear
          </button>
        </div>
        <div className="scrollbar-hidden mt-4 overflow-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[920px] table-fixed text-left text-sm">
            {/* <colgroup>
              <col className="w-[80px]" />
              <col className="w-[190px]" />
              <col className="w-[170px]" />
              <col className="w-[170px]" />
              <col className="w-[120px]" />
              <col className="w-[105px]" />
              <col className="w-[105px]" />
              <col className="w-[130px]" />
            </colgroup> */}
            <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 w-[60px]">#</th>
                <th className="px-4 py-3 text-xs lg:text-sm">Invoice</th>
                <th className="px-3 py-3 text-xs lg:text-sm">Source</th>
                <th className="px-3 py-3 text-xs lg:text-sm">Patient</th>
                <th className="px-3 py-3 text-xs lg:text-sm">Status</th>
                <th className="px-3 py-3 text-xs lg:text-sm">Total</th>
                <th className="px-3 py-3 text-xs lg:text-sm">Paid</th>
                <th className="px-4 py-3 text-xs lg:text-sm">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-4 text-slate-500">
                    {invoices.length === 0
                      ? "No invoices yet."
                      : "No invoices match the selected filters."}
                  </td>
                </tr>
              )}
              {invoicePageRows.map((invoice: any, index: number) => {
                const p: any = patientMap.get(invoice.patient_id);
                const source = invoiceSource(invoice);
                const rowNumber = (safePage - 1) * pageSize + index + 1;
                return (
                  <tr
                    key={invoice.id}
                    onClick={() => openInvoiceDetail(invoice)}
                    className="group cursor-pointer align-middle hover:bg-slate-50"
                  >
                    <td className="px-4 py-4 font-semibold text-slate-500">
                      {rowNumber}
                    </td>
                    <td className="px-2 py-2 lg:px-4 lg:py-4  text-[10px] lg:text-sm">
                      <b>{invoice.invoice_number}</b>
                      <p className="mt-1 text-[10px] lg:text-xs font-semibold text-slate-400">
                        {formatInvoiceDate(invoice)}
                      </p>
                    </td>
                    <td className="px-2 py-2 lg:px-4 lg:py-4  text-[10px] lg:text-sm">
                      <div className="flex flex-col items-start gap-1">
                        <Badge tone={source.tone as any} className="rounded-full text-xs lg:text-sm p-2">{source.label}</Badge>
                      </div>
                    </td>
                    <td className="px-2 py-2 lg:px-4 lg:py-4  text-[10px] lg:text-sm font-medium">
                      {p?.name || p?.full_name || "Patient"}
                    </td>
                    <td className="px-2 py-2 lg:px-4 lg:py-4  text-[10px] lg:text-sm">
                      <Badge
                        tone={
                          invoice.status === "paid"
                            ? "green"
                            : invoice.status === "partially_paid"
                              ? "amber"
                              : "slate"
                        }
                        className="table-status"
                      >
                        {invoice.status}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 lg:px-4 lg:py-4 text-[10px] lg:text-sm text-start font-semibold tabular-nums">
                      {money(invoice.total_amount)}
                    </td>
                    <td className="px-2 py-2 lg:px-4 lg:py-4  text-[10px] lg:text-sm text-start tabular-nums">
                      {money(invoice.paid_amount)}
                    </td>
                    <td
                      className="px-2 py-2 lg:px-4 lg:py-4  text-[10px] lg:text-sm text-start"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <ActionButton
                        onClick={() => openInvoiceDetail(invoice)}
                        disabled={detailLoading === invoice.id}
                      >
                        {detailLoading === invoice.id ? "Loading..." : "View"}
                      </ActionButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          page={safePage}
          totalPages={totalPages}
          total={filteredInvoices.length}
          onPage={setPage}
        />
      </Card>
    </div>
  );
}
