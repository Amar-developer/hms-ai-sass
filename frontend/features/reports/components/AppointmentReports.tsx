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
      width:'80px',
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
      width:'80px'
    },
    {
      key: "grossRevenue",
      width:'150px',
      header: "Gross Revenue",
      render: (row: any) => money(row.grossRevenue),
    },
    {
      key: "paidRevenue",
      header: "Paid",
      width:'80px',
      render: (row: any) => money(row.paidRevenue),
    },
    {
      key: "doctorFee",
      header: "Doctor Fee",
      width:'120px',
      render: (row: any) => money(row.doctorFee),
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
      width:'110px',
      render: (row: any) => money(row.clinicFee),
    },
    {
      key: "grossProfitPercentage",
      header: "Gross Profit %",
      width:'150px',
      render: (row: any) =>
        percent(
          Math.max(row.grossRevenue - row.doctorFee, 0),
          row.grossRevenue,
        ),
    },
    {
      key: "finalProfit",
      header: "Final Profit",
      width:'130px',
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
