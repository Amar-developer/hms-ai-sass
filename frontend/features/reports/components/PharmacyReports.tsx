import { Pill } from "lucide-react";
import CollapsibleReportSection from "./CollapsibleReportSection";
import { PharmacyReportsProps } from "../types";
import { DataTable } from "@/app/components/common/DataTable";

const PharmacyReports = ({
  pharmacySettlementRows,
  openSections,
  setOpenSections,
  money,
  onOpenInvoices,
  loading,
}: PharmacyReportsProps) => {
  const moneyOrDash = (value: any) =>
    Number(value || 0) === 0 ? "-" : money(value);
  const columns = [
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
      key: "supplier",
      header: "Supplier",
      width: "160px",
      render: (row: any) => <b>{row.supplier}</b>,
    },
    {
      key: "item",
      header: "Medicine",
      width: "180px",
    },
    {
      key: "issueCount",
      header: "Issues",
      width: "90px",
    },
    {
      key: "invoiceCount",
      header: "Invoices",
      width: "90px",
    },
    {
      key: "quantity",
      header: "Qty",
      width: "90px",
    },
    {
      key: "total",
      header: "Total",
      render: (row: any) => moneyOrDash(row.total),
      width: "90px",
    },
    {
      key: "revenue",
      header: "Paid",
      render: (row: any) => moneyOrDash(row.revenue),
      width: "90px",
    },
    {
      key: "balance",
      header: "Due",
      render: (row: any) => moneyOrDash(row.balance),
      width: "90px",
    },
    {
      key: "paymentMode",
      header: "Payment",
      width: "130px",
    },
    {
      key: "tax",
      header: "Paid GST",
      width: "100px",
      render: (row: any) => moneyOrDash(row.tax),
    },
    {
      key: "purchaseCost",
      header: "Purchase ",
      render: (row: any) => moneyOrDash(row.purchaseCost),
      width: "160px",
    },
    {
      key: "profit",
      header: "Profit",
      width: "90px",
      render: (row: any) => (
        <span className="font-bold">{moneyOrDash(row.profit)}</span>
      ),
    },
    {
      key: "profitMargin",
      header: "Margin",
      width: "120px",
      render: (row: any) => {
        const basis =
          Number(row.revenue || 0) - Number(row.tax || 0) ||
          Number(row.total || 0);
        return basis && Number(row.profit || 0) !== 0
          ? `${Math.round((Number(row.profit) / basis) * 100)}%`
          : "-";
      },
    },
  ];
  const totals = pharmacySettlementRows.reduce(
    (sum: any, row: any) => {
      for (const key of ["issueCount", "invoiceCount", "quantity", "total", "revenue", "balance", "tax", "purchaseCost", "profit"]) {
        sum[key] += Number(row[key] || 0);
      }
      return sum;
    },
    { issueCount: 0, invoiceCount: 0, quantity: 0, total: 0, revenue: 0, balance: 0, tax: 0, purchaseCost: 0, profit: 0 },
  );
  const profitBasis = totals.revenue - totals.tax;
  return (
    <div>
      <CollapsibleReportSection
        title="Pharmacy Settlement & Profitability"
        subtitle="Medicine cost is frozen on each invoice line; legacy invoices fall back to catalog setup."
        badge={`${pharmacySettlementRows.length} medicines`}
        isOpen={openSections.pharmacy}
        onToggle={() =>
          setOpenSections((state: any) => ({
            ...state,
            pharmacy: !state.pharmacy,
          }))
        }
      >
        <div className="overflow-auto scrollbar-hidden rounded-lg border border-slate-200">
          <DataTable
            columns={columns}
            data={pharmacySettlementRows}
            onRowClick={(row: any) => onOpenInvoices(row.invoices)}
            paginate
            emptyMessage="No paid pharmacy invoices match this filter."
            emptyDescription="Pharmacy settlement and profitability figures will appear here once invoices are paid."
            emptyIcon={Pill}
            minBodyHeight={`${pharmacySettlementRows.length > 0 ?'':'220px'}`}
            className="w-full min-w-[1220px] text-left text-sm"
            loading={loading}
            footer={
              <tr className="font-bold text-slate-900">
                <td colSpan={3} className="px-4 py-4 text-right">Filtered Totals</td>
                <td className="px-4 py-4">{totals.issueCount}</td>
                <td className="px-4 py-4">{totals.invoiceCount}</td>
                <td className="px-4 py-4">{totals.quantity}</td>
                <td className="px-4 py-4">{moneyOrDash(totals.total)}</td>
                <td className="px-4 py-4">{moneyOrDash(totals.revenue)}</td>
                <td className="px-4 py-4">{moneyOrDash(totals.balance)}</td>
                <td className="px-4 py-4">-</td>
                <td className="px-4 py-4">{moneyOrDash(totals.tax)}</td>
                <td className="px-4 py-4">{moneyOrDash(totals.purchaseCost)}</td>
                <td className="px-4 py-4">{moneyOrDash(totals.profit)}</td>
                <td className="px-4 py-4">
                  {profitBasis ? `${Math.round((totals.profit / profitBasis) * 100)}%` : "-"}
                </td>
              </tr>
            }
          />
        </div>
      </CollapsibleReportSection>
    </div>
  );
};

export default PharmacyReports;
