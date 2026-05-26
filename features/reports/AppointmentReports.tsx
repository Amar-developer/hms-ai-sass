import React from "react";
import CollapsibleReportSection from "@/components/reports/CollapsibleReportSection";


export type AppointmentReportsProps = {
  openSections: any;
  setOpenSections: any;
  money: any;
  doctorRows:any;
  percent:any
};
const AppointmentReports = ({
  doctorRows,
  openSections,
  setOpenSections,
  money,
  percent
}: AppointmentReportsProps) => {
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
          <table className="w-full min-w-[1280px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Doctor</th>
                <th>Consultations</th>
                <th>Invoices</th>
                <th>Gross Revenue</th>
                <th>Paid</th>
                <th>Doctor Fee</th>
                <th>Settlement</th>
                <th>Clinic Fee</th>
                <th>Gross Profit %</th>
                <th>Final Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {doctorRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-4 text-slate-500">
                    No healthcare invoices match this filter.
                  </td>
                </tr>
              )}
              {doctorRows.map((row: any) => (
                <tr key={row.id}>
                  <td className="px-4 py-4">
                    <b>{row.doctor}</b>
                  </td>
                  <td>{row.consultations}</td>
                  <td>{row.invoices}</td>
                  <td>{money(row.grossRevenue)}</td>
                  <td>{money(row.paidRevenue)}</td>
                  <td>{money(row.doctorFee)}</td>
                  <td>{money(row.settlement)}</td>
                  <td>{money(row.clinicFee)}</td>
                  <td>
                    {percent(
                      Math.max(row.grossRevenue - row.doctorFee, 0),
                      row.grossRevenue,
                    )}
                  </td>
                  <td className="font-bold">{money(row.finalProfit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleReportSection>
    </div>
  );
};

export default AppointmentReports;
