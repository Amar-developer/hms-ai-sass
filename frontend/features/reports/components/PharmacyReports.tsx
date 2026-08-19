import React from "react";
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
      width: "130px",
      render: (row: any) => moneyOrDash(row.membershipBenefit),
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
        <div className="mt-4 overflow-auto scrollbar-hidden rounded-2xl border">
          <DataTable
            columns={columns}
            data={pharmacySettlementRows}
            onRowClick={(row: any) => onOpenInvoices(row.invoices)}
            paginate
            emptyMessage="No paid pharmacy invoices match this filter."
            className="w-full min-w-[1220px] text-left text-sm"
            loading={loading}
          />
        </div>
      </CollapsibleReportSection>
    </div>
  );
};

export default PharmacyReports;
