import CollapsibleReportSection from "./CollapsibleReportSection";
import { LabReportsProps } from "../types";
import { DataTable } from "@/app/components/common/DataTable";

const LabReports = ({
  labSettlementRows,
  openSections,
  setOpenSections,
  money,
  onOpenInvoices,
  loading,
}: LabReportsProps) => {
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
      header: "Lab / Package",
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
      key: "approvedDiscount",
      header: "Admin %",
      width: "130px",
      render: (row: any) => moneyOrDash(row.approvedDiscount),
    },
    {
      key: "offerDiscount",
      header: "Offer %",
      width: "100px",
      render: (row: any) => moneyOrDash(row.offerDiscount),
    },
    {
      key: "membershipBenefit",
      header: "Membership",
      width: "120px",
      render: (row: any) => moneyOrDash(row.membershipBenefit),
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
  return (
    <div>
      <CollapsibleReportSection
        title="Lab Test Settlement & Profitability"
        subtitle="Supplier cost is frozen on each invoice line; legacy invoices fall back to catalog setup."
        badge={`${labSettlementRows.length} lab items`}
        isOpen={openSections.lab}
        onToggle={() =>
          setOpenSections((state: any) => ({ ...state, lab: !state.lab }))
        }
      >
        <div className="mt-4 overflow-auto scrollbar-hidden rounded-2xl border">
          <DataTable
            columns={columns}
            data={labSettlementRows}
            onRowClick={(row: any) => onOpenInvoices(row.invoices)}
            paginate
            emptyMessage="No paid lab invoices match this filter"
            className="w-full min-w-[920px] text-left text-sm"
            loading={loading}
          />
        </div>
      </CollapsibleReportSection>
    </div>
  );
};

export default LabReports;
