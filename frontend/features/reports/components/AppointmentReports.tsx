import { Stethoscope } from "lucide-react";
import { DataTable } from "@/app/components/common/DataTable";
import { AppointmentReportsProps } from "../types";
import CollapsibleReportSection from "./CollapsibleReportSection";

const AppointmentReports = ({
  doctorRows,
  openSections,
  setOpenSections,
  money,
  percent,
  onOpenInvoices,
}: AppointmentReportsProps) => {
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
      key: "doctor",
      header: "Doctor",
      width: "140px",
      render: (row: any) =>(
        <div className="max-w-[130px]">
          <p className="truncate font-semibold" title={row.doctor}>
            {row.doctor}
          </p>
        </div>
      ),
    },
    {
      key: "consultations",
      header: "Consultations",
      width: "140px",
    },
    {
      key: "invoices",
      header: "Invoices",
      width: "80px",
    },
    {
      key: "grossRevenue",
      width: "90px",
      header: "Total",
      render: (row: any) => moneyOrDash(row.grossRevenue),
    },
    {
      key: "paidRevenue",
      header: "Paid",
      width: "80px",
      render: (row: any) => moneyOrDash(row.paidRevenue),
    },
    {
      key: "balance",
      header: "Due",
      width: "110px",
      render: (row: any) => moneyOrDash(row.balance),
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
      width: "140px",
      render: (row: any) => moneyOrDash(row.membershipBenefit),
    },
    {
      key: "paymentMode",
      header: "Payment",
      width: "130px",
      render: (row:any)=> (
        <div className="max-w-[120px]">
          <p className="truncate" title= {row.paymentMode}>
            {row.paymentMode}
          </p>
        </div>
      )
    },
    {
      key: "paidTax",
      header: "Paid GST",
      width: "100px",
      render: (row: any) => moneyOrDash(row.paidTax),
    },
    {
      key: "doctorFee",
      header: "Doctor Fee",
      width: "120px",
      render: (row: any) => moneyOrDash(row.doctorFee),
    },
    {
      key: "clinicFee",
      header: "Clinic Fee",
      width: "110px",
      render: (row: any) => moneyOrDash(row.clinicFee),
    },

    {
      key: "finalProfit",
      header: "Final Profit",
      width: "130px",
      render: (row: any) => (
        <span className="font-bold">{moneyOrDash(row.finalProfit)}</span>
      ),
    },
    {
      key: "grossProfitPercentage",
      header: "Profit Margin",
      width: "150px",
      render: (row: any) =>
        Number(row.finalProfit || 0) === 0
          ? "-"
          : percent(
              row.finalProfit,
              row.paidRevenue - row.paidTax,
              row.grossRevenue,
            ),
    },
  ];
  return (
    <div>
      <CollapsibleReportSection
        title="Doctor Fee & Profitability"
        subtitle="Doctor fee is deducted once for settled consultations, including fully covered membership visits."
        badge={`${doctorRows.length} doctors`}
        isOpen={openSections.doctor}
        onToggle={() =>
          setOpenSections((state: any) => ({ ...state, doctor: !state.doctor }))
        }
      >
        <div className="overflow-auto scrollbar-hidden rounded-lg border border-slate-200">
          <DataTable
            columns={columns}
            data={doctorRows}
            onRowClick={(row: any) => onOpenInvoices(row.invoiceIds)}
            paginate
            className="w-full min-w-[1280px] text-left text-sm"
            emptyMessage="No healthcare invoices match this filter."
            emptyDescription="Doctor fee and profitability details will appear here once consultations are settled."
            emptyIcon={Stethoscope}
            minBodyHeight={`${doctorRows.length > 0 ?'':'220px'}`}
          />
        </div>
      </CollapsibleReportSection>
    </div>
  );
};

export default AppointmentReports;
