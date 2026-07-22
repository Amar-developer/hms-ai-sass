import React from "react";
import { Card,Badge } from "@/app/components/common/ui";
import { DataTable } from "./DataTable";
import {
  approvedDiscountUsage,
  billingDiscountUsage,
  offerDiscountUsage,
  recognizedInvoiceTax,
  reportedInvoiceTotal,
} from "../financials";
import { Pagination } from "@/app/components/common/Pagination";
import { InvoiceProps } from "../types";



const InvoiceReport = ({
  filteredInvoices,
  invoicePageRows,
  appointmentById,
  patientById,
  invoiceSettlementAmount,
  invoiceDoctorFeeAmount,
  invoicePaymentMode,
  invoiceGrossProfit,
  invoiceGrossProfitPercent,
  numberValue,
  doctorById,
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

}: InvoiceProps) => {
  const invoiceColumns = [
  {
    key: "invoice_number",
    header: "Invoice",
    width:'130px',
    render: (row: any) => (
      <>
        <b>{row.invoice_number}</b>
        <p className="text-xs text-slate-500">
          {rowDate(row)}
        </p>
      </>
    ),
  },
  {
    key: "type",
    header: "Type",
    width:'140px',
    render: (row: any) => invoiceTypeLabel(invoiceType(row)),
  },
  {
    key: "patient",
    header: "Patient",
    width:'80px',
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
    header: "Doctor",
    width:'100px',
    render: (row: any) => {
      const appointment = appointmentById.get(row.appointment_id);

      return (
        appointment?.doctor ||
        doctorById.get(
          appointment?.doctorId || appointment?.practitioner_id,
        ) ||
        "Unassigned"
      );
    },
  },
  {
    key: "status",
    header: "Status",
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
    render: (row: any) => money(reportedInvoiceTotal(row)),
  },
  {
    key: "paid_amount",
    header: "Paid",
    width:'90px',
    render: (row: any) => money(numberValue(row.paid_amount)),
  },
  {
    key: "balance_amount",
    header: "Balance",
    width:'90px',
    render: (row: any) => money(row.balance_amount),
  },
  {
    key: "approved_discount_amount",
    header: "Approved Discount",
    width:'115px',
    render: (row: any) => money(approvedDiscountUsage(row)),
  },
  {
    key: "offer_discount_amount",
    header: "Offer Discount",
    width:'105px',
    render: (row: any) => money(offerDiscountUsage(row)),
  },
  {
    key: "membership_discount_amount",
    header: "Membership",
    width:'100px',
    render: (row: any) =>
      money(row.membership_discount_amount),
  },
  {
    key: "billing_discount_amount",
    header: "Total Discount",
    width:'105px',
    render: (row: any) => money(billingDiscountUsage(row)),
  },
  {
    key: "payment_mode",
    header: "M.O.P",
    width: "90px",
    render: (row: any) => invoicePaymentMode(row),
  },
  {
    key: "doctor_fee",
    header: "Doctor Fee",
    width:'100px',
    render: (row: any) => money(invoiceDoctorFeeAmount(row)),
  },
  {
    key: "tax_amount",
    header: "GST from Paid",
    width: "110px",
    render: (row: any) => money(recognizedInvoiceTax(row)),
  },
  {
    key: "settlement",
    header: "Settlement",
    width:'100px',
    render: (row: any) =>
      money(invoiceSettlementAmount(row)),
  },

  {
    key: "clinic_profit",
    header: "Profit",
    width:'90px',
    render: (row: any) => {
      return (
        <span className="font-bold ">
          {money(invoiceGrossProfit(row))}
        </span>
      );
    },
  },
  {
    key: "clinic_profit_percentage",
    header: "Profit %",
    width: "100px",
    render: (row: any) => invoiceGrossProfitPercent(row),
  },
];
  return (
    <Card>
      <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
        <div>
          <h3 className="card-title font-bold">Invoice Profit Details</h3>
          <p className="card-desc text-slate-500">
            Only paid invoices are shown in profit details.
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
