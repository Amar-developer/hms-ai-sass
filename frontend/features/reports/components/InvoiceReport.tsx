import { ReceiptText } from "lucide-react";
import { Card, Badge } from "@/app/components/common/ui";
import {
  approvedDiscountUsage,
  offerDiscountUsage,
  recognizedInvoiceTax,
  reportedInvoiceTotal,
} from "../financials";
import { Pagination } from "@/app/components/common/Pagination";
import { InvoiceProps } from "../types";
import { DataTable } from "@/app/components/common/DataTable";
import { PatientFlagBadges } from "@/features/patients/components/PatientFlagBadges";
import { invoicePatientDueAmount } from "@/features/billing/helpers";

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
      totals.due += invoicePatientDueAmount(row);
      totals.adminDiscount += approvedDiscountUsage(row);
      totals.offerDiscount += offerDiscountUsage(row);
      totals.membershipBenefit += numberValue(row.membership_discount_amount);
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
      key: "s.no",
      header: "S.No",
      width: "50px",
      className: "text-center",
      cellClassName: "text-center",
      sortable: true,
      render: (_, index: number) => index + 1,
    },
    {
      key: "invoice_number",
      header: "Invoice No.",
      width: "160px",
      className: "text-center",
      render: (row: any) => (
        <>
          <b>{row.invoice_number}</b>
        </>
      ),
    },
    {
      key: "invoice_date",
      header: "Date",
      width: "100px",
      render: (row: any) => rowDate(row),
      className: "text-center",
    },
    {
      key: "type",
      header: "Type",
      width: "160px",
      className: "text-center",
      render: (row: any) => invoiceTypeLabel(invoiceType(row)),
    },
    {
      key: "patient",
      header: "Patient",
      width: "140px",
      render: (row: any) => {
        const patient = patientById.get(row.patient_id);

        return (
          <div className="max-w-[130px]">
            <p className="truncate" title={patient?.name ||
                patient?.full_name ||
                row.patient_name ||
                publicDisplayValue(row.patient_id)}>
              {patient?.name ||
                patient?.full_name ||
                row.patient_name ||
                publicDisplayValue(row.patient_id)}
            </p>
            <PatientFlagBadges patient={patient} className="mt-1" />
          </div>
        );
      },
    },
    {
      key: "doctor",
      header: "Doctor / Staff",
      width: "150px",
      render: (row: any) => {
        const value = invoiceDoctorStaffName(row);
        return (
          <div className="max-w-[140px]">
            <p className="truncate" title={value}>
              {value && value !== "Unassigned" ? value : "-"}
            </p>
          </div>
        )
      },
    },
    {
      key: "status",
      header: "Status",
      width: "90px",
      render: (row: any) => (
        <Badge
          tone={
            row.status === "paid"
              ? "green"
              : row.status === "partially_paid"
                ? "amber"
                : "slate"
          }
          className="normal-label"
        >
          {humanizeOptionLabel(row.status)}
        </Badge>
      ),
    },
    {
      key: "total_amount",
      header: "Total",
      width: "90px",
      render: (row: any) => moneyOrDash(reportedInvoiceTotal(row)),
    },
    {
      key: "paid_amount",
      header: "Paid",
      width: "90px",
      render: (row: any) => moneyOrDash(numberValue(row.paid_amount)),
    },
    {
      key: "balance_amount",
      header: "Due",
      width: "90px",
      render: (row: any) => moneyOrDash(invoicePatientDueAmount(row)),
    },
    {
      key: "approved_discount_amount",
      header: "Admin %",
      width: "125px",
      render: (row: any) => moneyOrDash(approvedDiscountUsage(row)),
    },
    {
      key: "offer_discount_amount",
      header: "Offer %",
      width: "105px",
      render: (row: any) => moneyOrDash(offerDiscountUsage(row)),
    },
    {
      key: "membership_discount_amount",
      header: "Membership",
      width: "110px",
      render: (row: any) => moneyOrDash(row.membership_discount_amount),
    },
    {
      key: "payment_mode",
      header: "Payment Method",
      width: "170px",
      render: (row: any) =>(
        <div className="max-w-[160px]">
          <p className="truncate" title={ invoicePaymentMode(row)}>
            { invoicePaymentMode(row)}
          </p>
        </div>
      ),
    },
    {
      key: "doctor_fee",
      header: "Doctor Cost",
      width: "140px",
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
      width: "120px",
      render: (row: any) => moneyOrDash(invoiceSettlementAmount(row)),
    },

    {
      key: "clinic_profit",
      header: "Profit",
      width: "90px",
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
      header: "Margin",
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
        <Badge tone="green" className="normal-badge">
          {filteredInvoices.length} paid invoices
        </Badge>
      </div>
      <div className="mt-4 overflow-auto scrollbar-hidden rounded-lg border">
        <DataTable
          className="w-full min-w-[1120px] text-left text-sm"
          columns={invoiceColumns}
          data={invoicePageRows}
          onRowClick={(row: any) => onOpenInvoices(row.id)}
          emptyMessage="No paid invoices match this filter."
          emptyDescription="Paid invoices matching the current filters will appear here."
          emptyIcon={ReceiptText}
          minBodyHeight="220px"
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
