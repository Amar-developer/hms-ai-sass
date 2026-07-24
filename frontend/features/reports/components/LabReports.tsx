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
}: LabReportsProps) => {
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
      render: (row: any) => money(row.total),
      width: '90px'
    },
    {
      key: "revenue",
      header: "Revenue",
      render: (row: any) => money(row.revenue),
      width: '90px'
    },
    {
      key: "balance",
      header: "Balance",
      render: (row: any) => money(row.balance),
      width: '90px'
    },
    {
      key: "approvedDiscount",
      header: "Approved %",
      width: '130px',
      render: (row: any) => money(row.approvedDiscount),
    },
    {
      key: "offerDiscount",
      header: "Offer %",
      width: '100px',
      render: (row: any) => money(row.offerDiscount),
    },
    {
      key: "membershipBenefit",
      header: "Membership",
      width: '120px',
      render: (row: any) => money(row.membershipBenefit),
    },
    {
      key: "billingDiscount",
      header: "Total %",
      width: '100px',
      render: (row: any) => money(row.billingDiscount),
    },
    {
      key: "paymentMode",
      header: "M.O.P",
      width: "90px",
    },
    {
      key: "purchaseCost",
      header: "Purchase",
      width: '120px',
      render: (row: any) => money(row.purchaseCost),
    },
    {
      key: "profit",
      header: "Profit",
      render: (row: any) => (
        <span className="font-bold">{money(row.profit)}</span>
      ),
      width:'90px'
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
          />
        </div>
      </CollapsibleReportSection>
    </div>
  );
};

export default LabReports;
