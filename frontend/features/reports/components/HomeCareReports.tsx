import React from "react";
import CollapsibleReportSection from "./CollapsibleReportSection";
import { DataTable } from "./DataTable";
import { HomeCareReportsProps } from "../types";
import { rowDate } from "../helpers";



const HomeCareReports = ({
  homeCareReportRows,
  openSections,
  setOpenSections,
  money,
  onOpenInvoices,
}: HomeCareReportsProps) => {
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
      render: (row: any) => money(row.totalAmount),
      width:'90px'
    },
    {
      key: "paidAmount",
      header: "Paid",
      render: (row: any) => money(row.paidAmount),
      width:'90px'
    },
    {
      key: "balance",
      header: "Balance",
      render: (row: any) => money(row.balance),
      width:'90px'
    },
    {
      key: "approvedDiscount",
      header: "Approved %",
      render: (row: any) => money(row.approvedDiscount),
      width:'130px'
    },
    {
      key: "offerDiscount",
      header: "Offer %",
      render: (row: any) => money(row.offerDiscount),
      width:'120px'
    },
    {
      key: "membershipBenefit",
      header: "Membership",
      render: (row: any) => money(row.membershipBenefit),
      width:'120px'
    },
    {
      key: "billingDiscount",
      header: "Total %",
      render: (row: any) => money(row.billingDiscount),
      width:'120px'
    },
    {
      key: "paymentMode",
      header: "M.O.P",
      width:'90px'
    },
    {
      key: "settlement",
      header: "Settlement",
      render: (row: any) => money(row.settlement),
      width:'120px'
    },
    {
      key: "grossProfit",
      header: "Gross Profit",
      render: (row: any) => (
        <span className="font-bold">{money(row.grossProfit)}</span>
      ),
      width:'140px'
    },
    {
      key: "grossProfitPercent",
      header: "Gross Profit %",
      width:'150px'
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
      <div className="mt-4 overflow-auto rounded-2xl border">
        <DataTable
          columns={columns}
          data={homeCareReportRows}
          onRowClick={(row: any) => onOpenInvoices(row.invoiceIds)}
          paginate
          emptyMessage="No paid home care or home visit invoices match this filter."
          className="w-full min-w-[1280px] text-left text-sm"
        />
      </div>
    </CollapsibleReportSection>
  );
};

export default HomeCareReports;
