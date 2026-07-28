import React from "react";
import { Card,Badge } from "@/app/components/common/ui";
import { DataTable } from "./DataTable";
import {
  approvedDiscountUsage,
  offerDiscountUsage,
  recognizedInvoiceTax,
  reportedInvoiceTotal,
} from "../financials";
import { Pagination } from "@/app/components/common/Pagination";
import { InvoiceProps } from "../types";



const InvoiceReport = ({
  filteredInvoices,
  invoicePageRows,
  patientById,
  invoiceDoctorStaffName,
  invoiceSettlementAmount,
  invoiceDoctorFeeAmount,
  invoicePaymentMode,
  invoiceGrossProfit,
  invoiceGrossProfitPercent,
  numberValue,
  rowDate,
  invoiceTypeLabel,
  invoiceType,
  publicDisplayValue,
  humanizeOptionLabel,
  money,
  safeInvoicePage,
  pageSize,
  totalInvoicePages,
  setInvoicePage,
  onOpenInvoices,
  loading,

}: InvoiceProps) => {
  const moneyOrDash = (value: any) => {
    const amount = Number(value || 0);
    return !Number.isFinite(amount) || amount === 0 ? "-" : money(amount);
  };
  const profitPercentOrDash = (row: any) =>
    Number(invoiceGrossProfit(row) || 0) === 0
      ? "-"
      : invoiceGrossProfitPercent(row);
  const filteredTotals = filteredInvoices.reduce(
    (totals: any, row: any) => {
      totals.total += reportedInvoiceTotal(row);
      totals.paid += numberValue(row.paid_amount);
      totals.due += numberValue(row.balance_amount);
      totals.adminDiscount += approvedDiscountUsage(row);
      totals.offerDiscount += offerDiscountUsage(row);
      totals.membershipBenefit += numberValue(
        row.membership_discount_amount,
      );
      totals.doctorCost += invoiceDoctorFeeAmount(row);
      totals.paidGst += recognizedInvoiceTax(row);
      totals.settlement += invoiceSettlementAmount(row);
      totals.profit += invoiceGrossProfit(row);
      return totals;
    },
    {
      total: 0,
      paid: 0,
      due: 0,
      adminDiscount: 0,
      offerDiscount: 0,
      membershipBenefit: 0,
      doctorCost: 0,
      paidGst: 0,
      settlement: 0,
      profit: 0,
    },
  );
  const filteredProfitBasis = filteredTotals.paid - filteredTotals.paidGst;
  const filteredProfitMargin = filteredProfitBasis
    ? `${Math.round((filteredTotals.profit / filteredProfitBasis) * 100)}%`
    : "-";
  const invoiceColumns = [
  {
    key: "invoice_number",
    header: "Invoice No.",
    width:'160px',
    className:'text-center',
    render: (row: any) => (
      <>
        <b>{row.invoice_number}</b>
      </>
    ),
  },
  {
    key:"invoice_date",
    header:'Invoice Date',
    width:'100px',
    render: (row:any)=> rowDate(row),
    className:'text-center',
  },
  {
    key: "type",
    header: "Invoice Type",
    width:'120px',
    className:'text-center',
    render: (row: any) => invoiceTypeLabel(invoiceType(row)),

  },
  {
    key: "patient",
    header: "Patient",
    width:'140px',
    render: (row: any) => {
      const patient = patientById.get(row.patient_id);

      return (
        <b>
          {patient?.name ||
            patient?.full_name ||
            row.patient_name ||
            publicDisplayValue(row.patient_id)}
        </b>
      );
    },
  },
  {
    key: "doctor",
    header: "Doctor / Staff",
    width:'140px',
    render: (row: any) => {
      const value = invoiceDoctorStaffName(row);
      return value && value !== "Unassigned" ? value : "-";
    },
  },
  {
    key: "status",
    header: "Payment Status",
    width:'90px',
    render: (row: any) => (
      <Badge
        tone={
          row.status === "paid"
            ? "green"
            : row.status === "partially_paid"
              ? "amber"
              : "slate"
        }
        className="normal-badge"
      >
        {humanizeOptionLabel(row.status)}
      </Badge>
    ),
  },
  {
    key: "total_amount",
    header: "Total",
    width:'90px',
    render: (row: any) => moneyOrDash(reportedInvoiceTotal(row)),
  },
  {
    key: "paid_amount",
    header: "Paid",
    width:'90px',
    render: (row: any) => moneyOrDash(numberValue(row.paid_amount)),
  },
  {
    key: "balance_amount",
    header: "Amount Due",
    width:'90px',
    render: (row: any) => moneyOrDash(row.balance_amount),
  },
  {
    key: "approved_discount_amount",
    header: "Admin Discount",
    width:'125px',
    render: (row: any) => moneyOrDash(approvedDiscountUsage(row)),
  },
  {
    key: "offer_discount_amount",
    header: "Offer Discount",
    width:'105px',
    render: (row: any) => moneyOrDash(offerDiscountUsage(row)),
  },
  {
    key: "membership_discount_amount",
    header: "Membership Benefit",
    width:'100px',
    render: (row: any) =>
      moneyOrDash(row.membership_discount_amount),
  },
  {
    key: "payment_mode",
    header: "Payment Method",
    width: "120px",
    render: (row: any) => invoicePaymentMode(row),
  },
  {
    key: "doctor_fee",
    header: "Doctor Cost",
    width:'120px',
    render: (row: any) => moneyOrDash(invoiceDoctorFeeAmount(row)),
  },
  {
    key: "tax_amount",
    header: "Paid GST",
    width: "110px",
    render: (row: any) => moneyOrDash(recognizedInvoiceTax(row)),
  },
  {
    key: "settlement",
    header: "Settlement",
    width:'120px',
    render: (row: any) =>
      moneyOrDash(invoiceSettlementAmount(row)),
  },

  {
    key: "clinic_profit",
    header: "Realized Profit",
    width:'90px',
    render: (row: any) => {
      return (
        <span className="font-bold ">
          {moneyOrDash(invoiceGrossProfit(row))}
        </span>
      );
    },
  },
  {
    key: "clinic_profit_percentage",
    header: "Profit Margin",
    width: "100px",
    render: (row: any) => profitPercentOrDash(row),
  },
];
  return (
    <Card>
      <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
        <div>
          <h3 className="card-title font-bold">Invoice Profit Details</h3>
          <p className="card-desc text-slate-500">
            Paid invoice rows and totals update from the current filters.
          </p>
        </div>
        <Badge tone="green" className="normal-badge">{filteredInvoices.length} paid invoices</Badge>
      </div>
      <div className="mt-4 overflow-auto rounded-lg border">
        <DataTable
          className="w-full min-w-[1120px] text-left text-sm"
          columns={invoiceColumns}
          data={invoicePageRows}
          onRowClick={(row: any) => onOpenInvoices(row.id)}
          emptyMessage="No paid invoices match this filter."
          loading={loading}
          footer={
            <tr className="font-bold text-slate-900">
              <td colSpan={6} className="px-4 py-4 text-right">
                Filtered Totals ({filteredInvoices.length})
              </td>
              <td className="px-4 py-4">{moneyOrDash(filteredTotals.total)}</td>
              <td className="px-4 py-4">{moneyOrDash(filteredTotals.paid)}</td>
              <td className="px-4 py-4">{moneyOrDash(filteredTotals.due)}</td>
              <td className="px-4 py-4">
                {moneyOrDash(filteredTotals.adminDiscount)}
              </td>
              <td className="px-4 py-4">
                {moneyOrDash(filteredTotals.offerDiscount)}
              </td>
              <td className="px-4 py-4">
                {moneyOrDash(filteredTotals.membershipBenefit)}
              </td>
              <td className="px-4 py-4">-</td>
              <td className="px-4 py-4">
                {moneyOrDash(filteredTotals.doctorCost)}
              </td>
              <td className="px-4 py-4">
                {moneyOrDash(filteredTotals.paidGst)}
              </td>
              <td className="px-4 py-4">
                {moneyOrDash(filteredTotals.settlement)}
              </td>
              <td className="px-4 py-4">
                {moneyOrDash(filteredTotals.profit)}
              </td>
              <td className="px-4 py-4">{filteredProfitMargin}</td>
            </tr>
          }
        />
      </div>
      <Pagination
        page={safeInvoicePage}
        totalPages={totalInvoicePages}
        total={filteredInvoices.length}
        onPage={setInvoicePage}
        pageSize={pageSize}
      />
    </Card>
  );
};

export default InvoiceReport;
