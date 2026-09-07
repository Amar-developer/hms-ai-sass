import { ReceiptText } from "lucide-react";
import { Badge } from "@/app/components/common/ui";
import {
  recognizedInvoiceTax,
  recognizedInvoiceRevenue,
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
      totals.paid += recognizedInvoiceRevenue(row);
      totals.due += invoicePatientDueAmount(row);
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
      doctorCost: 0,
      paidGst: 0,
      settlement: 0,
      profit: 0,
    },
  );
  const filteredProfitBasis = filteredTotals.paid - filteredTotals.paidGst;
  const filteredCost = filteredTotals.doctorCost + filteredTotals.settlement;
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
      render: (row: any) =>
        row.report_item_kind === "lab"
          ? "Lab Test"
          : row.report_item_kind === "service"
            ? "Service"
            : invoiceTypeLabel(invoiceType(row)),
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
      key: "payment_mode",
      header: "Payment",
      width: "150px",
      render: (row: any) =>(
        <div className="max-w-[160px]">
          <p className="truncate" title={ invoicePaymentMode(row)}>
            { invoicePaymentMode(row)}
          </p>
        </div>
      ),
    },
    {
      key: "cost",
      header: "Cost",
      width: "140px",
      render: (row: any) =>
        moneyOrDash(invoiceDoctorFeeAmount(row) + invoiceSettlementAmount(row)),
    },
    {
      key: "tax_amount",
      header: "Paid GST",
      width: "110px",
      render: (row: any) => moneyOrDash(recognizedInvoiceTax(row)),
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
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col justify-between gap-2 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center">
        <div>
          <h3 className="text-base font-black tracking-tight text-slate-950">
            Invoice Profit Details
          </h3>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            Paid invoice rows and totals update from the current filters.
          </p>
        </div>
        <Badge tone="green" className="normal-badge">
          {filteredInvoices.length} paid invoices
        </Badge>
      </div>
      <div className="p-4">
        <DataTable
          className="overflow-auto scrollbar-hidden rounded-lg bg-white"
          columns={invoiceColumns}
          data={invoicePageRows}
          onRowClick={(row: any) => onOpenInvoices(row.id)}
          emptyMessage="No paid invoices match this filter."
          emptyDescription="Paid invoices matching the current filters will appear here."
          emptyIcon={ReceiptText}
          minBodyHeight={`${invoicePageRows.length > 0 ?'':'220px'}`}
          loading={loading}
          footer={
            <tr className="font-bold text-slate-900">
              <td colSpan={7} className="px-4 py-4 text-right">
                Filtered Totals ({filteredInvoices.length})
              </td>
              <td className="px-4 py-4">{moneyOrDash(filteredTotals.total)}</td>
              <td className="px-4 py-4">{moneyOrDash(filteredTotals.paid)}</td>
              <td className="px-4 py-4">{moneyOrDash(filteredTotals.due)}</td>
              <td className="px-4 py-4">-</td>
              <td className="px-4 py-4">
                {moneyOrDash(filteredCost)}
              </td>
              <td className="px-4 py-4">
                {moneyOrDash(filteredTotals.paidGst)}
              </td>
              <td className="px-4 py-4">
                {moneyOrDash(filteredTotals.profit)}
              </td>
              <td className="px-4 py-4">{filteredProfitMargin}</td>
            </tr>
          }
        />
      </div>
      <div className="px-4 pb-4">
        <Pagination
          page={safeInvoicePage}
          totalPages={totalInvoicePages}
          total={filteredInvoices.length}
          onPage={setInvoicePage}
          pageSize={pageSize}
        />
      </div>
    </section>
  );
};

export default InvoiceReport;
