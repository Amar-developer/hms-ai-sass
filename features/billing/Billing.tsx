"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionButton,
  ActionGroup,
  Badge,
  Button,
  Card,
  Input,
  Select,
  StatusToast,
} from "@/components/common/ui";
import { DateField, SelectField, TextField } from "@/components/FormElements";
import { apiBlob, apiFetch } from "@/lib/api";
import { paymentMethodOptions } from "@/lib/options";

const pageSize = 10;

function invoiceSourceKey(invoice: any) {
  if (invoice.lab_order_id) return "lab_scan";
  if (invoice.pharmacy_issue_id) return "pharmacy";
  if (invoice.physiotherapy_case_id) return "physiotherapy";
  if (invoice.home_care_booking_id) return "home_care";
  if (invoice.ip_admission_id) return "ip_billing";
  if (invoice.consultation_id || invoice.appointment_id) return "consultation";
  return "direct";
}

function invoiceSource(invoice: any) {
  const sources: Record<
    string,
    { label: string; tone: "slate" | "blue" | "amber" | "purple" }
  > = {
    lab_scan: { label: "Lab / Scan", tone: "blue" },
    pharmacy: { label: "Pharmacy", tone: "amber" },
    physiotherapy: { label: "Physiotherapy", tone: "purple" },
    home_care: { label: "Home Care / Visit", tone: "blue" },
    ip_billing: { label: "IP Billing", tone: "blue" },
    consultation: { label: "Consultation", tone: "slate" },
    direct: { label: "Direct", tone: "amber" },
  };
  return sources[invoiceSourceKey(invoice)] || sources.direct;
}

function invoiceLinkedRecord(invoice: any) {
  if (invoice.ip_admission_id) return "IP admission";
  if (invoice.physiotherapy_case_id) return "Physiotherapy case";
  if (invoice.home_care_booking_id) return "Home care / visit booking";
  if (invoice.pharmacy_issue_id) return "Pharmacy issue";
  if (invoice.lab_order_id) return "Lab / Scan order";
  if (invoice.consultation_id) return "Consultation";
  if (invoice.appointment_id) return "Appointment";
  return "Direct invoice";
}

function money(value: any) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function numberValue(value: any) {
  return Number(value || 0);
}

function invoiceDiscountParts(invoice: any) {
  const discount = numberValue(invoice.discount_amount);
  const membership = numberValue(invoice.membership_discount_amount);
  return {
    offerDiscount: Math.max(discount - membership, 0),
    membershipDiscount: membership,
  };
}

function invoiceMembershipLabel(invoice: any) {
  if (numberValue(invoice.membership_discount_amount) > 0)
    return "Membership benefit applied";
  if (
    invoice.patient_subscription_enrollment_id ||
    invoice.patient_subscription_plan_id
  )
    return "Membership plan invoice";
  return "";
}

function percentLabel(amount: any, base: any) {
  const value = numberValue(amount);
  const total = numberValue(base);
  if (value <= 0 || total <= 0) return "0%";
  const percent = (value * 100) / total;
  return `${Number(percent.toFixed(1)).toLocaleString("en-IN")}%`;
}

function claimedDetail(amount: any, base: any, verb = "claimed") {
  return `${money(amount)} of ${money(base)} (${percentLabel(amount, base)} ${verb})`;
}

function invoiceDateKey(invoice: any) {
  const raw =
    invoice.invoice_date ||
    invoice.created_at ||
    invoice.updated_at ||
    invoice.paid_at;
  if (!raw) return "";
  if (typeof raw === "string") return raw.slice(0, 10);
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function formatInvoiceDate(invoice: any) {
  const key = invoiceDateKey(invoice);
  if (!key) return "-";
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? key
    : date.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function invoicePaidStatus(invoice: any) {
  const paid = Number(invoice.paid_amount || 0);
  const balance = Number(invoice.balance_amount || 0);
  const status = String(invoice.status || "").toLowerCase();
  if (status === "paid" || balance <= 0) return "paid";
  if (status === "partially_paid" || paid > 0) return "partially_paid";
  return "unpaid";
}

function itemTypeLabel(type: any) {
  const labels: Record<string, string> = {
    consultation: "Consultation",
    lab: "Lab / Scan",
    pharmacy: "Medicine",
    ip_room: "IP Room",
    ip_consultation: "IP Doctor",
    ip_medication: "IP Medicine",
    ip_lab: "IP Lab / Scan",
    ip_charge: "IP Charge",
    physiotherapy: "Physiotherapy",
    home_care: "Home Care / Visit",
  };
  return (
    labels[String(type || "")] || String(type || "Service").replaceAll("_", " ")
  );
}

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
          patient?.name,
          patient?.full_name,
          patient?.patient_number,
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
              className="mt-2 rounded-xl border px-3 py-2 text-xs font-bold"
              disabled={busy === "settlement"}
            >
              {busy === "settlement" ? "Finalizing..." : "Finalize"}
            </button>
          ) : (
            <Badge tone="green">Finalized</Badge>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="text-base lg:text-lg font-bold">
          Pending Consultation Invoices
        </h3>
        <p className="text-xs lg:text-sm text-slate-500">
          Reception can generate the consultation-fee invoice after the doctor
          signs the consultation. Lab, pharmacy, IP, and physiotherapy each have
          their own invoices created by those modules.
        </p>
        <StatusToast message={message} onClose={() => setMessage("")} />
        <div className="mt-4 grid gap-3">
          {signedReady.length === 0 && (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
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
          <Badge tone="slate">
            {filteredInvoices.length} of {invoices.length} invoices
          </Badge>
        </div>
        <div className="mt-4 grid gap-3 grid-cols-6 xl:grid-cols-[1.2fr_.85fr_.85fr_.75fr_.75fr_auto] xl:items-end">
          <TextField
            label="Search"
            value={filters.query}
            onChange={(v) => updateFilter("query", v)}
            placeholder="Invoice, patient, source"
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
                        <Badge tone={source.tone as any}>{source.label}</Badge>
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

function InvoiceDetailPage({
  detail,
  patient,
  onClose,
  methods,
  setMethods,
  amounts,
  setAmounts,
  references,
  setReferences,
  invoicePaymentOptions,
  defaultPaymentMethod,
  busy,
  collectPayment,
  collectSplitPayment,
  refreshConsultationInvoice,
  applyMembershipBenefit,
  openReceipt,
  issueCreditNote,
  supplierOptions={},
  updateInvoiceItemSupplier,
}:any){
  const invoice=detail.invoice||{};
  const items=detail.items||[];
  const payments=detail.payments||[];
  const source=invoiceSource(invoice);
  const showInternalLabPrices=Boolean(invoice.lab_order_id);
  const linkedRecord=invoiceLinkedRecord(invoice);
  const discountParts=invoiceDiscountParts(invoice);
  const membershipLabel=invoiceMembershipLabel(invoice);
  const membershipBenefit=detail.membership_benefit;
  const taxableAmount=numberValue(invoice.taxable_amount);
  const taxAmount=numberValue(invoice.tax_amount);
  const canRefresh=invoice.consultation_id&&!invoice.lab_order_id&&!invoice.pharmacy_issue_id&&!invoice.ip_admission_id&&!invoice.physiotherapy_case_id;
  const balanceDue=numberValue(invoice.balance_amount);
  const [payRows,setPayRows]=useState<any[]>([{method:defaultPaymentMethod,amount:"",reference:""}]);
  useEffect(()=>{
    setPayRows([{method:defaultPaymentMethod,amount:String(balanceDue||""),reference:""}]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[invoice.id,invoice.balance_amount,defaultPaymentMethod]);
  const enteredTotal=payRows.reduce((sum,row)=>sum+Number(row.amount||0),0);
  const remaining=balanceDue-enteredTotal;
  function updatePayRow(index:number,key:string,value:any){
    setPayRows((rows)=>rows.map((row,i)=>i===index?{...row,[key]:value}:row));
  }
  function addPayRow(){
    setPayRows((rows)=>[...rows,{method:defaultPaymentMethod,amount:remaining>0?String(remaining):"",reference:""}]);
  }
  function removePayRow(index:number){
    setPayRows((rows)=>rows.length>1?rows.filter((_,i)=>i!==index):rows);
  }
  return (
    <div className="space-y-5">
      <Card>
        <div className="-mx-6 -mt-6 border-b border-slate-200 bg-white px-6 py-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-bold">{source.label} Invoice</h3>
                <Badge
                  tone={
                    invoice.status === "paid"
                      ? "green"
                      : invoice.status === "partially_paid"
                        ? "amber"
                        : "slate"
                  }
                >
                  {invoice.status}
                </Badge>
                {membershipLabel && (
                  <Badge tone="green">{membershipLabel}</Badge>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <b>{invoice.invoice_number}</b>
                <span className="text-slate-500">
                  {patient?.name || patient?.full_name || "Patient"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border px-4 py-3 text-sm font-bold hover:bg-slate-50"
            >
              Back to Invoices
            </button>
          </div>
        </div>

        <div className="pt-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="grid gap-3 text-sm md:grid-cols-4">
              <InvoiceMeta label="Type" value={source.label} />
              <InvoiceMeta label="Source" value={linkedRecord} />
              <InvoiceMeta
                label="Patient"
                value={patient?.name || patient?.full_name || "Patient"}
              />
              <InvoiceMeta
                label="Status"
                value={String(invoice.status || "issued").replaceAll("_", " ")}
              />
            </div>
          </div>

          <div className="mt-5 space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="font-bold">{source.label} Bill Items</h4>
                  <p className="text-xs text-slate-500">
                    Line items linked to this invoice.
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-right">
                  <p className="text-[11px] font-bold uppercase text-slate-500">
                    Items
                  </p>
                  <p className="text-sm font-black tabular-nums text-slate-950">
                    {items.length}
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className={`w-full text-left text-sm ${showInternalLabPrices?'min-w-[1080px]':'min-w-[760px]'}`}>
                  <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Item</th>
                      <th className="px-3 py-3">Description</th>
                      {showInternalLabPrices&&<th className="px-3 py-3 text-right">MRP</th>}
                      {showInternalLabPrices&&<th className="px-3 py-3">Supplier</th>}
                      {showInternalLabPrices&&<th className="px-3 py-3 text-right">Buying</th>}
                      {showInternalLabPrices&&<th className="px-3 py-3 text-right">Selling</th>}
                      <th className="px-3 py-3 text-right">Qty</th>
                      <th className="px-3 py-3 text-right">Rate</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={showInternalLabPrices?9:5} className="px-4 py-5 text-sm font-semibold text-slate-500">No bill items found.</td>
                      </tr>
                    )}
                    {items.map((item:any)=>{
                      const itemSupplierOptions=supplierOptions[item.id]||[];
                      return (
                      <tr key={item.id} className="align-middle">
                        <td className="px-4 py-4">
                          <Badge tone={source.tone as any}>
                            {itemTypeLabel(item.item_type)}
                          </Badge>
                        </td>
                        <td className="px-3 py-4">
                          <span
                            className="block max-w-[520px] break-words font-semibold text-slate-950"
                            title={
                              item.description || itemTypeLabel(item.item_type)
                            }
                          >
                            {item.description || itemTypeLabel(item.item_type)}
                          </span>
                          {showInternalLabPrices&&item.external_item_code&&<span className="mt-1 block text-xs text-slate-500">{item.external_item_code}</span>}
                        </td>
                        {showInternalLabPrices&&<td className="px-3 py-4 text-right tabular-nums">{money(item.mrp_amount||0)}</td>}
                        {showInternalLabPrices&&(
                          <td className="px-3 py-4">
                            <Select
                              value={item.supplier_id||''}
                              onChange={(event:any)=>updateInvoiceItemSupplier?.(invoice,item,event.target.value)}
                              disabled={busy===`supplier-${item.id}`}
                              className="min-w-[170px]"
                            >
                              <option value="">No supplier</option>
                              {itemSupplierOptions.map((supplier:any)=>(
                                <option key={supplier.supplier} value={supplier.supplier}>{supplier.supplier_name} · {money(supplier.buying_price)}</option>
                              ))}
                            </Select>
                          </td>
                        )}
                        {showInternalLabPrices&&<td className="px-3 py-4 text-right tabular-nums">{money(item.buying_amount||0)}</td>}
                        {showInternalLabPrices&&<td className="px-3 py-4 text-right tabular-nums">{money(item.selling_amount||item.unit_amount||0)}</td>}
                        <td className="px-3 py-4 text-right font-bold tabular-nums">{item.quantity}</td>
                        <td className="px-3 py-4 text-right tabular-nums">{money(item.unit_amount)}</td>
                        <td className="px-4 py-4 text-right font-black tabular-nums text-slate-950">{money(item.total_amount)}</td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-4">
                <h4 className="font-bold">Payment Summary</h4>
                <p className="text-xs text-slate-500">Staff collection view</p>
              </div>
              <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="divide-y">
                  <BillLine
                    label="Item total"
                    value={money(invoice.subtotal_amount)}
                  />
                  <BillLine
                    label="Offer discount"
                    value={`-${money(discountParts.offerDiscount)}`}
                    muted={discountParts.offerDiscount <= 0}
                    savings={discountParts.offerDiscount > 0}
                    note={
                      discountParts.offerDiscount > 0
                        ? claimedDetail(
                            discountParts.offerDiscount,
                            invoice.subtotal_amount,
                          )
                        : "No offer discount applied"
                    }
                  />
                  <BillLine
                    label="Membership benefit"
                    value={`-${money(discountParts.membershipDiscount)}`}
                    muted={discountParts.membershipDiscount <= 0}
                    savings={discountParts.membershipDiscount > 0}
                    note={
                      discountParts.membershipDiscount > 0
                        ? `${membershipLabel} · ${claimedDetail(discountParts.membershipDiscount, invoice.subtotal_amount)}`
                        : membershipBenefit?.reason ||
                          "No membership benefit applied"
                    }
                    action={
                      membershipBenefit?.is_applied ? (
                        <ActionButton disabled>Applied</ActionButton>
                      ) : !membershipBenefit?.is_applied &&
                        membershipBenefit?.can_apply ? (
                        <ActionButton
                          onClick={() => applyMembershipBenefit(invoice)}
                          disabled={busy === `membership-${invoice.id}`}
                        >
                          {busy === `membership-${invoice.id}`
                            ? "Applying..."
                            : `Apply ${money(membershipBenefit.discount_amount)}`}
                        </ActionButton>
                      ) : null
                    }
                  />
                  <BillLine label="Subtotal" value={money(taxableAmount)} />
                  <BillLine
                    label="Tax"
                    value={money(taxAmount)}
                    muted={taxAmount <= 0}
                    note={
                      taxAmount > 0
                        ? claimedDetail(taxAmount, taxableAmount, "applied")
                        : "No tax applied"
                    }
                  />
                  <BillLine
                    label="Grand total"
                    value={money(invoice.total_amount)}
                    strong
                  />
                  <BillLine
                    label="Paid amount"
                    value={money(invoice.paid_amount)}
                    savings={numberValue(invoice.paid_amount) > 0}
                  />
                  <BillLine
                    label="Balance due"
                    value={money(invoice.balance_amount)}
                    strong
                    danger={numberValue(invoice.balance_amount) > 0}
                  />
                </div>
                <div className="space-y-3">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <InvoiceMeta
                        label="Tax rule"
                        value={invoice.tax_rule_id ? "Applied" : "Not applied"}
                      />
                      <InvoiceMeta
                        label="Offer"
                        value={
                          invoice.discount_offer_id ? "Applied" : "Not applied"
                        }
                      />
                    </div>
                  </div>
                  {numberValue(invoice.balance_amount) > 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            Collect Payment
                          </p>
                          <p className="text-xs text-slate-500">
                            Split across multiple modes if needed
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={addPayRow}
                          className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-slate-900 hover:bg-slate-50"
                        >
                          + Add mode
                        </button>
                      </div>
                      <div className="mt-3 space-y-3">
                        {payRows.map((row, index) => (
                          <div
                            key={index}
                            className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                          >
                            <div className="grid gap-2 sm:grid-cols-2">
                              <Select
                                value={row.method}
                                onChange={(e: any) =>
                                  updatePayRow(index, "method", e.target.value)
                                }
                              >
                                {invoicePaymentOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </Select>
                              <Input
                                className="text-right tabular-nums"
                                type="number"
                                min="0"
                                placeholder="Amount"
                                value={row.amount}
                                onChange={(e: any) =>
                                  updatePayRow(index, "amount", e.target.value)
                                }
                              />
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <Input
                                placeholder="Reference number (optional)"
                                value={row.reference}
                                onChange={(e: any) =>
                                  updatePayRow(index, "reference", e.target.value)
                                }
                              />
                              {payRows.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removePayRow(index)}
                                  className="shrink-0 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold">
                        <span className="text-slate-500">Entering</span>
                        <span className="tabular-nums text-slate-900">
                          {money(enteredTotal)} / {money(balanceDue)}
                        </span>
                      </div>
                      {remaining < 0 && (
                        <p className="mt-1 text-xs font-bold text-rose-600">
                          Exceeds balance by {money(Math.abs(remaining))}
                        </p>
                      )}
                      {remaining > 0 && enteredTotal > 0 && (
                        <p className="mt-1 text-xs font-bold text-amber-600">
                          {money(remaining)} will remain due (partial payment)
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={busy === invoice.id || enteredTotal <= 0 || remaining < 0}
                        onClick={() => collectSplitPayment(invoice, payRows)}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-700 px-4 py-3.5 text-base font-black tracking-wide text-white shadow-lg shadow-slate-900/20 transition hover:from-slate-800 hover:to-slate-600 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                      >
                        {busy === invoice.id ? (
                          "Saving Payment..."
                        ) : (
                          <>
                            <span>
                              {payRows.filter((r) => Number(r.amount) > 0).length > 1
                                ? "Pay (Split)"
                                : "Pay"}
                            </span>
                            <span className="tabular-nums">{money(enteredTotal)}</span>
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
                      <span>Payment settled</span>
                      <span>{money(invoice.paid_amount)}</span>
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
                    {canRefresh && (
                      <ActionButton
                        onClick={() => refreshConsultationInvoice(invoice)}
                        disabled={busy === `refresh-${invoice.id}`}
                      >
                        {busy === `refresh-${invoice.id}`
                          ? "Refreshing..."
                          : "Refresh"}
                      </ActionButton>
                    )}
                    <ActionButton onClick={() => openReceipt(invoice)}>
                      Receipt
                    </ActionButton>
                    <ActionButton onClick={() => issueCreditNote(invoice)}>
                      Credit Note
                    </ActionButton>
                  </div>
                </div>
              </div>
            </aside>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h4 className="font-bold">Payments</h4>
            </div>
            <div className="grid gap-2 p-4">
              {payments.length === 0 && (
                <p className="text-sm text-slate-500">
                  No payments recorded yet.
                </p>
              )}
              {payments.map((payment: any) => (
                <div
                  key={payment.id}
                  className="flex flex-col justify-between gap-2 rounded-2xl bg-slate-50 p-3 text-sm md:flex-row md:items-center"
                >
                  <div>
                    <b className="capitalize">
                      {String(payment.method || "payment").replaceAll("_", " ")}
                    </b>
                    {payment.reference_number && (
                      <p className="text-xs text-slate-500">
                        {payment.reference_number}
                      </p>
                    )}
                  </div>
                  <Badge
                    tone={payment.status === "recorded" ? "green" : "amber"}
                  >
                    {payment.status}
                  </Badge>
                  <b>{money(payment.amount)}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function BillLine({
  label,
  value,
  note,
  muted = false,
  savings = false,
  strong = false,
  danger = false,
  action = null,
}: any) {
  const valueClass = danger
    ? "text-rose-700"
    : savings
      ? "text-emerald-700"
      : "text-slate-950";
  return (
    <div className="flex items-start justify-between gap-4 py-3 text-sm">
      <div>
        <p
          className={
            muted
              ? "font-semibold text-slate-400"
              : "font-semibold text-slate-700"
          }
        >
          {label}
        </p>
        {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <p
          className={`${strong ? "text-base font-black" : "font-bold"} ${muted ? "text-slate-400" : valueClass} tabular-nums`}
        >
          {value}
        </p>
        {action}
      </div>
    </div>
  );
}

function InvoiceMeta({ label, value }: any) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words font-bold capitalize text-slate-950">
        {value}
      </p>
    </div>
  );
}

function Pagination({ page, totalPages, total, onPage }: any) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="mt-4 flex flex-col justify-between gap-3 text-sm text-slate-500 sm:flex-row sm:items-center">
      <span>
        Showing {start}-{end} of {total}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-xl border px-3 py-2 font-bold text-slate-700 disabled:text-slate-300"
        >
          Previous
        </button>
        <span className="rounded-xl bg-slate-50 px-3 py-2 font-bold text-slate-700">
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded-xl border px-3 py-2 font-bold text-slate-700 disabled:text-slate-300"
        >
          Next
        </button>
      </div>
    </div>
  );
}
