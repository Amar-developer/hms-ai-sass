import { displayDate, money } from "@/utils/helper";
import { Badge,Card } from "@/app/components/common/ui";

export function QueuedEnrollmentsTable({ rows, patientMap }: any) {
  if (!rows.length) return null;
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h3 className="text-base lg:text-lg font-bold">Queued Enrollments</h3>
          <p className="card-desc text-slate-500">
            Purchased while another plan was active — these activate
            automatically once the patient's current plan ends.
          </p>
        </div>
        <Badge
          tone="amber"
          className="w-[20%] lg:w-[15%] text-xs lg:text-sm rounded-full py-2 px-2"
        >
          {rows.length} queued
        </Badge>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-[480px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Patient</th>
              <th>Plan</th>
              <th>Purchased</th>
              <th>Expected start</th>
              <th>Paid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((row: any) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="px-4 py-4 text-xs lg:text-sm">
                  <b>
                    {patientMap.get(row.patient_id)?.name ||
                      patientMap.get(row.patient_id)?.full_name ||
                      "Patient"}
                  </b>
                  <p className="text-xs text-slate-500">
                    {patientMap.get(row.patient_id)?.patient_number || ""}
                  </p>
                </td>
                <td className="text-xs lg:text-sm">
                  {row.plan?.name || "Membership plan"}
                </td>
                <td className="text-xs lg:text-sm">
                  {displayDate(row.starts_on)}
                </td>
                <td className="text-xs lg:text-sm">
                  When current plan ends (~{displayDate(row.ends_on)})
                </td>
                <td className="text-xs lg:text-sm font-semibold tabular-nums">
                  {money(row.paid_amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
