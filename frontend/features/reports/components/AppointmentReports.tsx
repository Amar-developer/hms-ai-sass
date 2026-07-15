import { AppointmentReportsProps } from "../types";
import CollapsibleReportSection from "./CollapsibleReportSection";
import { DataTable } from "./DataTable";



const AppointmentReports = ({
  doctorRows,
  openSections,
  setOpenSections,
  money,
  percent,
  onOpenInvoices,
}: AppointmentReportsProps) => {
  const columns = [
    {
      key: "doctor",
      header: "Doctor",
      render: (row: any) => <b>{row.doctor}</b>,
    },
    {
      key: "consultations",
      header: "Consultations",
      width: '140px'
    },
    {
      key: "invoices",
      header: "Invoices",
    },
    {
      key: "grossRevenue",
      header: "Total",
      render: (row: any) => money(row.grossRevenue),
    },
    {
      key: "paidRevenue",
      header: "Paid",
      render: (row: any) => money(row.paidRevenue),
    },
    {
      key: "balance",
      header: "Balance",
      render: (row: any) => money(row.balance),
    },
    {
      key: "membershipBenefit",
      header: "Membership Benefit",
      width: '150px',
      render: (row: any) => money(row.membershipBenefit),
    },
    {
      key: "paymentMode",
      header: "Mode of Payment",
      width: "140px",
    },
    {
      key: "settlement",
      header: "Settlement",
      width:'120px',
      render: (row: any) => money(row.settlement),
    },
    {
      key: "settlementPercent",
      header: "Settlement %",
      width: "120px",
    },
    {
      key: "clinicFee",
      header: "Clinic Fee",
      render: (row: any) => money(row.clinicFee),
    },
    {
      key: "grossProfitPercentage",
      header: "Gross Profit %",
      render: (row: any) => percent(row.finalProfit, row.paidRevenue),
    },
    {
      key: "finalProfit",
      header: "Final Profit",
      render: (row: any) => (
        <span className="font-bold">{money(row.finalProfit)}</span>
      ),
    },
  ];
  return (
    <div>
      <CollapsibleReportSection
        title="Doctor Settlement & Profitability"
        subtitle="Profit and settlement use only fully paid invoices, so issued or due invoices do not overstate doctor payout or clinic profit."
        badge={`${doctorRows.length} doctors`}
        isOpen={openSections.doctor}
        onToggle={() =>
          setOpenSections((state: any) => ({ ...state, doctor: !state.doctor }))
        }
      >
        <div className="mt-4 overflow-auto rounded-2xl border">
          <DataTable
          columns={columns}
          data={doctorRows}
          onRowClick={(row: any) => onOpenInvoices(row.invoiceIds)}
          paginate
          className="w-full min-w-[1280px] text-left text-sm"
          emptyMessage="No healthcare invoices match this filter."
          />
        </div>
      </CollapsibleReportSection>
    </div>
  );
};

export default AppointmentReports;
