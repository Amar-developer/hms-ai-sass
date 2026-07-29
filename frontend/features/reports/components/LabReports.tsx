import React from "react";
import CollapsibleReportSection from "./CollapsibleReportSection";
import { DataTable } from "./DataTable";
import { LabReportsProps } from "../types";



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
      key: "supplier",
      header: "Supplier",
      render: (row: any) => <b>{row.supplier}</b>,
      width: '120px'
    },
    {
      key: "item",
      header: "Lab / Package",
      width: '160px'
    },
    {
      key: "orderCount",
      header: "Orders",
      width: '90px'
    },
    {
      key: "invoiceCount",
      header: "Invoices",
      width: '90px'
    },
    {
      key: "total",
      header: "Total",
      render: (row: any) => moneyOrDash(row.total),
      width: '90px'
    },
    {
      key: "revenue",
      header: "Paid",
      render: (row: any) => moneyOrDash(row.revenue),
      width: '90px'
    },
    {
      key: "balance",
      header: "Amount Due",
      render: (row: any) => moneyOrDash(row.balance),
      width: '90px'
    },
    {
      key: "approvedDiscount",
      header: "Admin Discount",
      width: '130px',
      render: (row: any) => moneyOrDash(row.approvedDiscount),
    },
    {
      key: "offerDiscount",
      header: "Offer Discount",
      width: '100px',
      render: (row: any) => moneyOrDash(row.offerDiscount),
    },
    {
      key: "membershipBenefit",
      header: "Membership Benefit",
      width: '120px',
      render: (row: any) => moneyOrDash(row.membershipBenefit),
    },
    {
      key: "paymentMode",
      header: "Payment Method",
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
      header: "Purchase Cost",
      width: '120px',
      render: (row: any) => moneyOrDash(row.purchaseCost),
    },
    {
      key: "profit",
      header: "Realized Profit",
      render: (row: any) => (
        <span className="font-bold">{moneyOrDash(row.profit)}</span>
      ),
      width:'90px'
    },
    {
      key: "profitMargin",
      header: "Profit Margin",
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
        <div className="mt-4 overflow-auto rounded-2xl border">
          <DataTable
            columns={columns}
            data={labSettlementRows}
            onRowClick={(row: any) => onOpenInvoices(row.invoices)}
            paginate
            emptyMessage="No paid lab invoices match this filter"
            className='w-full min-w-[920px] text-left text-sm'
            loading={loading}
          />
        </div>
      </CollapsibleReportSection>
    </div>
  );
};

export default LabReports;
