import React from "react";
import CollapsibleReportSection from "./CollapsibleReportSection";
import { DataTable } from "./DataTable";
import { PharmacyReportsProps } from "../types";



const PharmacyReports = ({
  pharmacySettlementRows,
  openSections,
  setOpenSections,
  money,
  onOpenInvoices,
}: PharmacyReportsProps) => {
  const columns = [
    {
      key: "supplier",
      header: "Supplier",
      width:'160px',
      render: (row: any) => <b>{row.supplier}</b>,
    },
    {
      key: "item",
      header: "Medicine",
      width:'180px',
    },
    {
      key: "issueCount",
      header: "Issues",
      width:'90px',
    },
    {
      key: "invoiceCount",
      header: "Invoices",
       width:'90px',
    },
    {
      key: "quantity",
      header: "Qty",
       width:'90px',
    },
    {
      key: "total",
      header: "Total",
      render: (row: any) => money(row.total),
       width:'90px',
    },
    {
      key: "revenue",
      header: "Revenue",
      render: (row: any) => money(row.revenue),
       width:'90px',
    },
    {
      key: "balance",
      header: "Balance",
      render: (row: any) => money(row.balance),
       width:'90px',
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
      width: '130px',
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
      width: "120px",
    },
    {
      key: "purchaseCost",
      header: "Purchase Cost",
      render: (row: any) => money(row.purchaseCost),
       width:'160px',
    },
    {
      key: "profit",
      header: "Profit",
      width:'90px',
      render: (row: any) => (
        <span className="font-bold">{money(row.profit)}</span>
      ),
    },
  ];
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
        <div className="mt-4 overflow-auto rounded-2xl border">
          <DataTable
            columns={columns}
            data={pharmacySettlementRows}
            onRowClick={(row: any) => onOpenInvoices(row.invoices)}
            paginate
            emptyMessage="No paid pharmacy invoices match this filter."
            className="w-full min-w-[1220px] text-left text-sm"
          />
        </div>
      </CollapsibleReportSection>
    </div>
  );
};

export default PharmacyReports;
