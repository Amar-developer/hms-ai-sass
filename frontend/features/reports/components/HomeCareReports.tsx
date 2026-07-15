import React from "react";
import CollapsibleReportSection from "./CollapsibleReportSection";
import { DataTable } from "./DataTable";
import { HomeCareReportsProps } from "../types";



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
      header: "Invoice",
      render: (row: any) => (
        <>
          <b>{row.invoice}</b>
          <p className="text-xs text-slate-500">{row.date}</p>
        </>
      ),
    },
    {
      key: "type",
      header: "Type",
    },
    {
      key: "patient",
      header: "Patient",
      render: (row: any) => <b>{row.patient}</b>,
    },
    {
      key: "staff",
      header: "Staff",
    },
    {
      key: "totalAmount",
      header: "Total",
      render: (row: any) => money(row.totalAmount),
    },
    {
      key: "paidAmount",
      header: "Paid Amount",
      render: (row: any) => money(row.paidAmount),
    },
    {
      key: "balance",
      header: "Balance",
      render: (row: any) => money(row.balance),
    },
    {
      key: "membershipBenefit",
      header: "Membership Benefit",
      render: (row: any) => money(row.membershipBenefit),
    },
    {
      key: "paymentMode",
      header: "Mode of Payment",
    },
    {
      key: "settlement",
      header: "Settlement",
      render: (row: any) => money(row.settlement),
    },
    {
      key: "settlementPercent",
      header: "Settlement %",
    },
    {
      key: "grossProfit",
      header: "Gross Profit",
      render: (row: any) => (
        <span className="font-bold">{money(row.grossProfit)}</span>
      ),
    },
    {
      key: "grossProfitPercent",
      header: "Gross Profit %",
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
