import { HeartPulse } from "lucide-react";
import CollapsibleReportSection from "./CollapsibleReportSection";
import { HomeCareReportsProps } from "../types";
import { DataTable } from "@/app/components/common/DataTable";
import { PatientFlagBadges } from "@/features/patients/components/PatientFlagBadges";

const HomeCareReports = ({
  homeCareReportRows,
  variant = "combined",
  openSections,
  setOpenSections,
  money,
  onOpenInvoices,
  loading,
}: HomeCareReportsProps) => {
  const isVisitReport = variant === "home_visit";
  const isCombinedReport = variant === "combined";
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
      key: "invoice",
      header: "Invoice No",
      width: "150px",
      render: (row: any) => (
        <div className="max-w-[140px]">
          <p className="truncate font-semibold" title={row.invoice}>
            {row.invoice}
          </p>
        </div>
      ),
    },
    {
      key: "invoice_date",
      header: "Date",
      render: (row: any) => row.date,
      width: "100px",
    },
    {
      key: "type",
      header: "Type",
      width: "120px",
    },
    {
      key: "patient",
      header: "Patient",
      width: "120px",
      render: (row: any) => (
        <div className="max-w-[140px]">
          <p className="truncate" title={row.patient}>{row.patient}</p>
          <PatientFlagBadges patient={row.patientReference} className="mt-1" />
        </div>
      ),
    },
    {
      key: "staff",
      header: "Staff",
      width: "140px",
      render: (row:any)=>(
        <div className="max-w-[130px]">
          <p className="truncate" title={row.staff}>{row.staff}</p>
        </div>
      )
    },
    {
      key: "totalAmount",
      header: "Total",
      render: (row: any) => moneyOrDash(row.totalAmount),
      width: "100px",
    },
    {
      key: "paidAmount",
      header: "Paid",
      render: (row: any) => moneyOrDash(row.paidAmount),
      width: "100px",
    },
    {
      key: "balance",
      header: "Due",
      render: (row: any) => moneyOrDash(row.balance),
      width: "100px",
    },
    {
      key: "approvedDiscount",
      header: "Admin %",
      width: "100px",
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
      render: (row: any) => moneyOrDash(row.membershipBenefit),
      width: "120px",
    },
    {
      key: "paymentMode",
      header: "Payment",
      width: "130px",
    },
    {
      key: "paidTax",
      header: "Paid GST",
      render: (row: any) => moneyOrDash(row.paidTax),
      width: "100px",
    },
    {
      key: "settlement",
      header: "Settlement",
      render: (row: any) => moneyOrDash(row.settlement),
      width: "120px",
    },
    {
      key: "grossProfit",
      header: "Profit",
      render: (row: any) => (
        <span className="font-bold">{moneyOrDash(row.grossProfit)}</span>
      ),
      width: "100px",
    },
    {
      key: "grossProfitPercent",
      header: "Margin",
      width: "100px",
      render: (row: any) =>
        Number(row.grossProfit || 0) === 0 ? "-" : row.grossProfitPercent,
    },
  ];

  return (
    <CollapsibleReportSection
      title={
        isCombinedReport
          ? "Home Care / Visit Invoice Report"
          : isVisitReport
            ? "Home Visit Invoice Report"
            : "Home Care Invoice Report"
      }
      subtitle={
        isCombinedReport
          ? "Paid home care and home visit invoices split by booking type."
          : isVisitReport
          ? "Paid home visit invoices, settlement, and realized profit."
          : "Paid home care invoices, settlement, and realized profit."
      }
      badge={`${homeCareReportRows.length} invoices`}
      isOpen={openSections[variant] ?? openSections.homeCare}
      onToggle={() =>
        setOpenSections((state: any) => ({
          ...state,
          [variant]: !(state[variant] ?? state.homeCare),
        }))
      }
    >
      <div className="overflow-auto scrollbar-hidden rounded-lg border border-slate-200">
        <DataTable
          columns={columns}
          data={homeCareReportRows}
          onRowClick={(row: any) => onOpenInvoices(row.invoiceIds)}
          paginate
          emptyMessage="No paid home care or home visit invoices match this filter."
          emptyDescription="Home care and home visit invoices will show up here once payments are recorded."
          emptyIcon={HeartPulse}
          minBodyHeight={`${homeCareReportRows.length > 0 ?'':'220px'}`}
          className="w-full min-w-[1280px] text-left text-sm"
          loading={loading}
        />
      </div>
    </CollapsibleReportSection>
  );
};

export default HomeCareReports;
