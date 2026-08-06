import React from "react";
import CollapsibleReportSection from "./CollapsibleReportSection";
import { HomeCareReportsProps } from "../types";
import { rowDate } from "../helpers";
import { DataTable } from "@/app/components/common/DataTable";



const HomeCareReports = ({
  homeCareReportRows,
  openSections,
  setOpenSections,
  money,
  onOpenInvoices,
  loading,
}: HomeCareReportsProps) => {
  const moneyOrDash = (value: any) =>
    Number(value || 0) === 0 ? "-" : money(value);
  const columns = [
    {
      key: "invoice",
      header: "Invoice No",
      render: (row: any) => (
        <>
          <b>{row.invoice}</b>
        </>
      ),
      width:'120px'
    },
    {
      key:'invoice_date',
      header:'Date',
      render: (row:any)=> row.date,
      width:'100px'
    },
    {
      key: "type",
      header: "Type",
      width:'120px'
    },
    {
      key: "patient",
      header: "Patient",
      render: (row: any) => <b>{row.patient}</b>,
      width:'120px'
    },
    {
      key: "staff",
      header: "Staff",
      width:'140px'
    },
    {
      key: "totalAmount",
      header: "Total",
      render: (row: any) => moneyOrDash(row.totalAmount),
      width:'90px'
    },
    {
      key: "paidAmount",
      header: "Paid",
      render: (row: any) => moneyOrDash(row.paidAmount),
      width:'90px'
    },
    {
      key: "balance",
      header: "Amount Due",
      render: (row: any) => moneyOrDash(row.balance),
      width:'90px'
    },
    {
      key: "approvedDiscount",
      header: "Admin Discount",
      render: (row: any) => moneyOrDash(row.approvedDiscount),
      width:'130px'
    },
    {
      key: "offerDiscount",
      header: "Offer Discount",
      render: (row: any) => moneyOrDash(row.offerDiscount),
      width:'120px'
    },
    {
      key: "membershipBenefit",
      header: "Membership Benefit",
      render: (row: any) => moneyOrDash(row.membershipBenefit),
      width:'120px'
    },
    {
      key: "paymentMode",
      header: "Payment Method",
      width:'130px'
    },
    {
      key: "paidTax",
      header: "Paid GST",
      render: (row: any) => moneyOrDash(row.paidTax),
      width:'100px'
    },
    {
      key: "settlement",
      header: "Settlement",
      render: (row: any) => moneyOrDash(row.settlement),
      width:'120px'
    },
    {
      key: "grossProfit",
      header: "Realized Profit",
      render: (row: any) => (
        <span className="font-bold">{moneyOrDash(row.grossProfit)}</span>
      ),
      width:'140px'
    },
    {
      key: "grossProfitPercent",
      header: "Profit Margin",
      width:'150px',
      render: (row: any) =>
        Number(row.grossProfit || 0) === 0 ? "-" : row.grossProfitPercent,
    },
  ];

  return (
    <CollapsibleReportSection
      title="Home Care / Visit Invoice Report"
      subtitle="Paid home care and home visit invoices split by booking type."
      badge={`${homeCareReportRows.length} invoices`}
      isOpen={openSections.homeCare}
      onToggle={() =>
        setOpenSections((state: any) => ({
          ...state,
          homeCare: !state.homeCare,
        }))
      }
    >
      <div className="mt-4 overflow-auto scrollbar-hidden rounded-2xl border">
        <DataTable
          columns={columns}
          data={homeCareReportRows}
          onRowClick={(row: any) => onOpenInvoices(row.invoiceIds)}
          paginate
          emptyMessage="No paid home care or home visit invoices match this filter."
          className="w-full min-w-[1280px] text-left text-sm"
          loading={loading}
        />
      </div>
    </CollapsibleReportSection>
  );
};

export default HomeCareReports;
