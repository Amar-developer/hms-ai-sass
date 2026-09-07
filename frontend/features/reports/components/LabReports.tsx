import { FlaskConical } from "lucide-react";
import CollapsibleReportSection from "./CollapsibleReportSection";
import { LabReportsProps } from "../types";
import { DataTable } from "@/app/components/common/DataTable";

const LabReports = ({
  labSettlementRows,
  reportKind = "overall",
  openSections,
  setOpenSections,
  money,
  onOpenInvoices,
  loading,
}: LabReportsProps) => {
  const isLabOnly = reportKind === "lab";
  const isServiceOnly = reportKind === "service";
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
      width: "120px",
      render: (row: any) => (
        <div className="max-w-[110px]">
          <p className="truncate">{row.supplier}</p>
        </div>
      ),
    },
    {
      key: "item",
      header: isLabOnly ? "Lab Test" : isServiceOnly ? "Service" : "Lab / Service",
      width: "160px",
      render: (row: any) => {
        return (
          <div className="max-w-[150px]">
            <p className="truncate" title={row.item}>{row.item}</p>
          </div>
        );
      },
    },
    {
      key: "orderCount",
      header: "Orders",
      width: "90px",
    },
    {
      key: "invoiceCount",
      header: "Invoices",
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
      render: (row:any) => (
        <div className="max-w-[120px]">
          <p className="truncate" title={row.paymentMode}>
            {row.paymentMode}
          </p>
        </div>
      )
    },
    {
      key: "tax",
      header: "Paid GST",
      width: "100px",
      render: (row: any) => moneyOrDash(row.tax),
    },
    {
      key: "purchaseCost",
      header: "Purchase",
      width: "120px",
      render: (row: any) => moneyOrDash(row.purchaseCost),
    },
    {
      key: "profit",
      header: "Profit",
      render: (row: any) => (
        <span className="font-bold">{moneyOrDash(row.profit)}</span>
      ),
      width: "90px",
    },
    {
      key: "profitMargin",
      header: "Margin",
      width: "100px",
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
  const totals = labSettlementRows.reduce(
    (sum: any, row: any) => {
      for (const key of ["orderCount", "invoiceCount", "total", "revenue", "balance", "tax", "purchaseCost", "profit"]) {
        sum[key] += Number(row[key] || 0);
      }
      return sum;
    },
    { orderCount: 0, invoiceCount: 0, total: 0, revenue: 0, balance: 0, tax: 0, purchaseCost: 0, profit: 0 },
  );
  const profitBasis = totals.revenue - totals.tax;
  return (
    <div>
      <CollapsibleReportSection
        title={
          isLabOnly
            ? "Lab Test Settlement & Profitability"
            : isServiceOnly
              ? "Service Settlement & Profitability"
              : "Lab / Service Settlement & Profitability"
        }
        subtitle={
          isLabOnly
            ? "Standalone Lab Test items only; mixed invoices are allocated to their matching test lines."
            : isServiceOnly
              ? "Service/package items only; mixed invoices are allocated to their matching service lines."
              : "Lab Tests and Services are item-classified, with supplier cost frozen on each invoice line."
        }
        badge={`${labSettlementRows.length} ${isServiceOnly ? "services" : isLabOnly ? "lab tests" : "items"}`}
        isOpen={openSections.lab}
        onToggle={() =>
          setOpenSections((state: any) => ({ ...state, lab: !state.lab }))
        }
      >
        <div className="overflow-auto scrollbar-hidden rounded-lg border border-slate-200">
          <DataTable
            columns={columns}
            data={labSettlementRows}
            onRowClick={(row: any) => onOpenInvoices(row.invoices)}
            paginate
            emptyMessage="No paid lab invoices match this filter"
            emptyDescription="Lab settlement and profitability figures will appear here once invoices are paid."
            emptyIcon={FlaskConical}
            minBodyHeight={`${labSettlementRows.length > 0 ?'':'220px'}`}
            className="w-full min-w-[920px] text-left text-sm"
            loading={loading}
            footer={
              <tr className="font-bold text-slate-900">
                <td colSpan={3} className="px-4 py-4 text-right">Filtered Totals</td>
                <td className="px-4 py-4">{totals.orderCount}</td>
                <td className="px-4 py-4">{totals.invoiceCount}</td>
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

export default LabReports;
