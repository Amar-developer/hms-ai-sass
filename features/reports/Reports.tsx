"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  Download,
  IndianRupee,
  Percent,
  ReceiptIndianRupee,
  Stethoscope,
} from "lucide-react";
import { Badge, Card, Field, Input, Select } from "@/components/ui";

function money(value: any) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function numberValue(value: any) {
  return Number(value || 0);
}

function dateKey(value: any) {
  return String(value || "").slice(0, 10);
}

function normalized(value: any) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
}

function isCompleted(row: any) {
  return [
    row.status,
    row.queueStatus,
    row.queue_status,
    row.consultationStatus,
    row.consultation_status,
  ]
    .map(normalized)
    .some((status) =>
      [
        "consultation_completed",
        "consultation_done",
        "completed",
        "done",
        "seen",
        "signed",
        "billed",
      ].includes(status),
    );
}

function currentRange(period: string) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  if (period === "daily") {
    return [toInputDate(start), toInputDate(end)];
  }
  if (period === "weekly") {
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);
    end.setDate(start.getDate() + 6);
    return [toInputDate(start), toInputDate(end)];
  }
  start.setDate(1);
  end.setMonth(end.getMonth() + 1, 0);
  return [toInputDate(start), toInputDate(end)];
}

function toInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function percent(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function settlementPaidBasis(invoice: any) {
  const total = numberValue(invoice.total_amount);
  const paid = numberValue(invoice.paid_amount);
  const doctorShare = numberValue(invoice.doctor_share_amount);
  if (!total || !paid || !doctorShare) return 0;
  return Math.min(Math.round((doctorShare * paid) / total), paid);
}

function rowDate(invoice: any) {
  return dateKey(invoice.created_at || invoice.invoice_date || invoice.updated_at);
}

function csvCell(value: any) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadBlob(filename: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function tableToCsv(headers: string[], rows: any[][]) {
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}

function htmlEscape(value: any) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function htmlTable(headers: string[], rows: any[][]) {
  return `
    <table>
      <thead>
        <tr>${headers.map((header) => `<th>${htmlEscape(header)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${
          rows.length
            ? rows
                .map(
                  (row) =>
                    `<tr>${row.map((cell) => `<td>${htmlEscape(cell)}</td>`).join("")}</tr>`,
                )
                .join("")
            : `<tr><td colspan="${headers.length}">No rows</td></tr>`
        }
      </tbody>
    </table>
  `;
}

export function Reports({
  scopedAppointments,
  patients,
  ipAdmissions,
  apiSession,
  liveInvoices = [],
  livePractitioners = [],
}: any) {
  const [period, setPeriod] = useState("monthly");
  const [rangeStart, rangeEnd] = currentRange(period);
  const [fromDate, setFromDate] = useState(rangeStart);
  const [toDate, setToDate] = useState(rangeEnd);
  const [doctorId, setDoctorId] = useState("all");
  const appointmentById = useMemo(
    () => new Map<string, any>(scopedAppointments.map((row: any) => [row.id, row])),
    [scopedAppointments],
  );
  const doctorById = useMemo(
    () =>
      new Map(
        livePractitioners.map((row: any) => [
          row.id,
          row.full_name || row.name || row.id,
        ]),
      ),
    [livePractitioners],
  );
  const doctorOptions = Array.from(
    new Map(
      scopedAppointments
        .map((row: any) => [
          row.doctorId || row.practitioner_id,
          row.doctor || row.practitioner_name || doctorById.get(row.doctorId || row.practitioner_id),
        ])
        .filter(([id]) => Boolean(id)),
    ).entries(),
  );
  const filteredInvoices = liveInvoices.filter((invoice: any) => {
    const invoiceDate = rowDate(invoice);
    const appointment = appointmentById.get(invoice.appointment_id);
    const invoiceDoctorId =
      appointment?.doctorId || appointment?.practitioner_id || invoice.practitioner_id;
    return (
      (!fromDate || invoiceDate >= fromDate) &&
      (!toDate || invoiceDate <= toDate) &&
      (doctorId === "all" || invoiceDoctorId === doctorId)
    );
  });
  const completedAppointments = scopedAppointments.filter((row: any) => {
    const appointmentDate = dateKey(row.appointmentDate || row.appointment_date);
    const rowDoctorId = row.doctorId || row.practitioner_id;
    return (
      isCompleted(row) &&
      (!fromDate || appointmentDate >= fromDate) &&
      (!toDate || appointmentDate <= toDate) &&
      (doctorId === "all" || rowDoctorId === doctorId)
    );
  });
  const totals = filteredInvoices.reduce(
    (acc: any, invoice: any) => {
      const total = numberValue(invoice.total_amount);
      const paid = numberValue(invoice.paid_amount);
      const balance = numberValue(invoice.balance_amount);
      const doctorShare = numberValue(invoice.doctor_share_amount);
      const settlement = settlementPaidBasis(invoice);
      acc.invoices += 1;
      acc.grossRevenue += total;
      acc.paidRevenue += paid;
      acc.balance += balance;
      acc.doctorFee += doctorShare;
      acc.settlement += settlement;
      acc.clinicFee += numberValue(invoice.clinic_share_amount) || Math.max(total - doctorShare, 0);
      acc.tax += numberValue(invoice.tax_amount);
      return acc;
    },
    {
      invoices: 0,
      grossRevenue: 0,
      paidRevenue: 0,
      balance: 0,
      doctorFee: 0,
      settlement: 0,
      clinicFee: 0,
      tax: 0,
    },
  );
  const grossProfit = Math.max(totals.grossRevenue - totals.doctorFee, 0);
  const finalProfit = Math.max(totals.paidRevenue - totals.settlement, 0);
  const doctorRows = Array.from(
    filteredInvoices.reduce((acc: Map<string, any>, invoice: any) => {
      const appointment: any = appointmentById.get(invoice.appointment_id);
      const key =
        appointment?.doctorId || appointment?.practitioner_id || invoice.practitioner_id || "unassigned";
      const row =
        acc.get(key) ||
        {
          id: key,
          doctor: appointment?.doctor || doctorById.get(key) || "Unassigned",
          invoices: 0,
          consultations: 0,
          grossRevenue: 0,
          paidRevenue: 0,
          doctorFee: 0,
          settlement: 0,
          clinicFee: 0,
          finalProfit: 0,
        };
      const total = numberValue(invoice.total_amount);
      const paid = numberValue(invoice.paid_amount);
      const doctorFee = numberValue(invoice.doctor_share_amount);
      const settlement = settlementPaidBasis(invoice);
      row.invoices += 1;
      row.grossRevenue += total;
      row.paidRevenue += paid;
      row.doctorFee += doctorFee;
      row.settlement += settlement;
      row.clinicFee += numberValue(invoice.clinic_share_amount) || Math.max(total - doctorFee, 0);
      row.finalProfit += Math.max(paid - settlement, 0);
      acc.set(key, row);
      return acc;
    }, new Map<string, any>()).values(),
  ).map((row: any) => ({
    ...row,
    consultations: completedAppointments.filter(
      (appointment: any) => (appointment.doctorId || appointment.practitioner_id || "unassigned") === row.id,
    ).length,
  })).sort((a: any, b: any) => b.finalProfit - a.finalProfit);

  function changePeriod(nextPeriod: string) {
    const [start, end] = currentRange(nextPeriod);
    setPeriod(nextPeriod);
    if (nextPeriod !== "custom") {
      setFromDate(start);
      setToDate(end);
    }
  }

  const settlementHeaders = [
    "Doctor",
    "Consultations",
    "Invoices",
    "Gross Revenue",
    "Paid Revenue",
    "Doctor Fee",
    "Settlement",
    "Clinic Fee",
    "Gross Profit %",
    "Final Profit",
  ];
  const settlementRows = doctorRows.map((row: any) => [
    row.doctor,
    row.consultations,
    row.invoices,
    row.grossRevenue,
    row.paidRevenue,
    row.doctorFee,
    row.settlement,
    row.clinicFee,
    percent(Math.max(row.grossRevenue - row.doctorFee, 0), row.grossRevenue),
    row.finalProfit,
  ]);
  const invoiceHeaders = [
    "Invoice",
    "Date",
    "Doctor",
    "Status",
    "Total",
    "Paid",
    "Balance",
    "Doctor Fee",
    "Settlement",
    "Clinic Profit",
  ];
  const invoiceRows = filteredInvoices.map((invoice: any) => {
    const appointment: any = appointmentById.get(invoice.appointment_id);
    const settlement = settlementPaidBasis(invoice);
    const paid = numberValue(invoice.paid_amount);
    const doctorName =
      appointment?.doctor ||
      doctorById.get(appointment?.doctorId || appointment?.practitioner_id) ||
      "Unassigned";
    return [
      invoice.invoice_number,
      rowDate(invoice),
      doctorName,
      invoice.status,
      numberValue(invoice.total_amount),
      paid,
      numberValue(invoice.balance_amount),
      numberValue(invoice.doctor_share_amount),
      settlement,
      Math.max(paid - settlement, 0),
    ];
  });
  const summaryRows = [
    ["Gross Revenue", totals.grossRevenue],
    ["Paid Revenue", totals.paidRevenue],
    ["Balance", totals.balance],
    ["Doctor Fee", totals.doctorFee],
    ["Settlement", totals.settlement],
    ["Clinic Fee", totals.clinicFee],
    ["Gross Profit", grossProfit],
    ["Gross Profit %", percent(grossProfit, totals.grossRevenue)],
    ["Final Profit", finalProfit],
    ["Final Profit %", percent(finalProfit, totals.paidRevenue)],
    ["Completed Consultations", completedAppointments.length],
  ];
  const exportName = `healthcare-profit-report-${fromDate || "start"}-${toDate || "end"}`;

  function exportCsv() {
    const content = [
      "Healthcare Gross Profit Report",
      `Period,${fromDate || "-"},${toDate || "-"}`,
      "",
      tableToCsv(["Metric", "Value"], summaryRows),
      "",
      "Doctor Settlement & Profitability",
      tableToCsv(settlementHeaders, settlementRows),
      "",
      "Invoice Profit Details",
      tableToCsv(invoiceHeaders, invoiceRows),
    ].join("\n");
    downloadBlob(`${exportName}.csv`, "text/csv;charset=utf-8", content);
  }

  function exportExcel() {
    const html = `
      <html>
        <head><meta charset="utf-8" /></head>
        <body>
          <h2>Healthcare Gross Profit Report</h2>
          <p>Period: ${fromDate || "-"} to ${toDate || "-"}</p>
          ${htmlTable(["Metric", "Value"], summaryRows)}
          <h3>Doctor Settlement & Profitability</h3>
          ${htmlTable(settlementHeaders, settlementRows)}
          <h3>Invoice Profit Details</h3>
          ${htmlTable(invoiceHeaders, invoiceRows)}
        </body>
      </html>
    `;
    downloadBlob(`${exportName}.xls`, "application/vnd.ms-excel;charset=utf-8", html);
  }

  function exportPdf() {
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>Healthcare Gross Profit Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1, h2, h3 { margin: 0 0 8px; }
            p { color: #475569; }
            table { width: 100%; border-collapse: collapse; margin: 16px 0 28px; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
            th { background: #f1f5f9; text-transform: uppercase; font-size: 11px; }
          </style>
        </head>
        <body>
          <h1>Healthcare Gross Profit Report</h1>
          <p>Period: ${fromDate || "-"} to ${toDate || "-"}</p>
          <h2>Summary</h2>
          ${htmlTable(["Metric", "Value"], summaryRows)}
          <h2>Doctor Settlement & Profitability</h2>
          ${htmlTable(settlementHeaders, settlementRows)}
          <h2>Invoice Profit Details</h2>
          ${htmlTable(invoiceHeaders, invoiceRows)}
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    win.document.close();
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <h3 className="text-lg font-bold">Healthcare Gross Profit Report</h3>
            <p className="text-sm text-slate-500">
              Consultation revenue, doctor settlement, clinic fee, gross profit,
              final profit, and paid-basis settlement.
            </p>
          </div>
          <Badge tone="blue">
            {apiSession?.user?.is_super_admin ? "Super Admin" : "Tenant Admin"}
          </Badge>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-bold"
          >
            <Download size={15} />
            CSV
          </button>
          <button
            type="button"
            onClick={exportExcel}
            className="rounded-2xl border px-3 py-2 text-sm font-bold"
          >
            Excel
          </button>
          <button
            type="button"
            onClick={exportPdf}
            className="rounded-2xl border px-3 py-2 text-sm font-bold"
          >
            PDF
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Field label="Period">
            <Select value={period} onChange={(event: any) => changePeriod(event.target.value)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom</option>
            </Select>
          </Field>
          <Field label="From Date">
            <Input
              type="date"
              value={fromDate}
              onChange={(event: any) => {
                setPeriod("custom");
                setFromDate(event.target.value);
              }}
            />
          </Field>
          <Field label="To Date">
            <Input
              type="date"
              value={toDate}
              onChange={(event: any) => {
                setPeriod("custom");
                setToDate(event.target.value);
              }}
            />
          </Field>
          <Field label="Doctor">
            <Select value={doctorId} onChange={(event: any) => setDoctorId(event.target.value)}>
              <option value="all">All doctors</option>
              {doctorOptions.map(([id, label]: any) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={IndianRupee} label="Gross Revenue" value={money(totals.grossRevenue)} hint={`${totals.invoices} invoices`} />
        <Metric icon={ReceiptIndianRupee} label="Paid Revenue" value={money(totals.paidRevenue)} hint={`Due ${money(totals.balance)}`} />
        <Metric icon={Stethoscope} label="Doctor Fee" value={money(totals.doctorFee)} hint={`Settlement ${money(totals.settlement)}`} />
        <Metric icon={Activity} label="Final Profit" value={money(finalProfit)} hint={`Gross profit ${money(grossProfit)}`} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={Percent} label="Gross Profit %" value={percent(grossProfit, totals.grossRevenue)} hint="After doctor fee on invoice value" />
        <Metric icon={Percent} label="Final Profit %" value={percent(finalProfit, totals.paidRevenue)} hint="After paid-basis doctor settlement" />
        <Metric icon={CalendarDays} label="Completed Consultations" value={completedAppointments.length} hint={`${patients.length} patient records · ${ipAdmissions.length} IP records`} />
      </div>

      <Card>
        <h3 className="text-lg font-bold">Doctor Settlement & Profitability</h3>
        <p className="text-sm text-slate-500">
          Settlement is calculated only on collected amount, so unpaid invoice
          balance does not overstate doctor payout or clinic profit.
        </p>
        <div className="mt-4 overflow-auto rounded-2xl border">
          <table className="w-full min-w-[1280px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Doctor</th>
                <th>Consultations</th>
                <th>Invoices</th>
                <th>Gross Revenue</th>
                <th>Paid</th>
                <th>Doctor Fee</th>
                <th>Settlement</th>
                <th>Clinic Fee</th>
                <th>Gross Profit %</th>
                <th>Final Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {doctorRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-4 text-slate-500">
                    No healthcare invoices match this filter.
                  </td>
                </tr>
              )}
              {doctorRows.map((row: any) => (
                <tr key={row.id}>
                  <td className="px-4 py-4">
                    <b>{row.doctor}</b>
                    <p className="text-xs text-slate-500">{row.id}</p>
                  </td>
                  <td>{row.consultations}</td>
                  <td>{row.invoices}</td>
                  <td>{money(row.grossRevenue)}</td>
                  <td>{money(row.paidRevenue)}</td>
                  <td>{money(row.doctorFee)}</td>
                  <td>{money(row.settlement)}</td>
                  <td>{money(row.clinicFee)}</td>
                  <td>{percent(Math.max(row.grossRevenue - row.doctorFee, 0), row.grossRevenue)}</td>
                  <td className="font-bold">{money(row.finalProfit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-bold">Invoice Profit Details</h3>
        <div className="mt-4 overflow-auto rounded-2xl border">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th>Doctor</th>
                <th>Status</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Doctor Fee</th>
                <th>Settlement</th>
                <th>Clinic Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-4 text-slate-500">
                    No invoices match this filter.
                  </td>
                </tr>
              )}
              {filteredInvoices.map((invoice: any) => {
                const appointment: any = appointmentById.get(invoice.appointment_id);
                const settlement = settlementPaidBasis(invoice);
                const paid = numberValue(invoice.paid_amount);
                const doctorName =
                  appointment?.doctor ||
                  doctorById.get(appointment?.doctorId || appointment?.practitioner_id) ||
                  "Unassigned";
                return (
                  <tr key={invoice.id}>
                    <td className="px-4 py-4">
                      <b>{invoice.invoice_number}</b>
                      <p className="text-xs text-slate-500">{rowDate(invoice)}</p>
                    </td>
                    <td>{doctorName}</td>
                    <td>
                      <Badge tone={invoice.status === "paid" ? "green" : invoice.status === "partially_paid" ? "amber" : "slate"}>
                        {invoice.status}
                      </Badge>
                    </td>
                    <td>{money(invoice.total_amount)}</td>
                    <td>{money(paid)}</td>
                    <td>{money(invoice.balance_amount)}</td>
                    <td>{money(invoice.doctor_share_amount)}</td>
                    <td>{money(settlement)}</td>
                    <td className="font-bold">{money(Math.max(paid - settlement, 0))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Metric({ icon: Icon, label, value, hint }: any) {
  return (
    <Card>
      <Icon className="text-slate-500" />
      <p className="mt-3 text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className="mt-2 text-xs font-semibold text-slate-500">{hint}</p>
    </Card>
  );
}
