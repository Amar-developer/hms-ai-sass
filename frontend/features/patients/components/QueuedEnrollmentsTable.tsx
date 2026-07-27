import { displayDate, money } from "@/utils/helper";
import { Badge, Card } from "@/app/components/common/ui";
import { useEffect, useState } from "react";
import { Pagination } from "@/app/components/common/Pagination";
import { pageSize } from "@/utils/constants";
import { DataTable } from "@/features/reports/components/DataTable";

export function QueuedEnrollmentsTable({ rows, patientMap }: any) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  if (!rows.length) return null;

  const MEMBERSHIP_COLUMNS = [
    {
      key: "patient",
      header: "Patient",
      render: (row: any) => (
        <>
          <b>
            {row.patient_name ||
              patientMap.get(row.patient_id)?.name ||
              patientMap.get(row.patient_id)?.full_name ||
              "Patient"}
          </b>
          <p className="text-xs text-slate-500">
            {row.patient_number ||
              patientMap.get(row.patient_id)?.patient_number ||
              ""}
          </p>
        </>
      ),
      cellClassName: "text-xs lg:text-sm",
    },
    {
      key: "plan",
      header: "Plan",
      render: (row: any) => row.plan?.name || "Membership plan",
      cellClassName: "text-xs lg:text-sm",
    },
    {
      key: "purchased",
      header: "Purchased",
      render: (row: any) => displayDate(row.created_at),
      cellClassName: "text-xs lg:text-sm",
    },
    {
      key: "validity",
      header: "Expected validity",
      render: (row: any) =>
        `${displayDate(row.starts_on)} to ${displayDate(row.ends_on)}`,
      cellClassName: "text-xs lg:text-sm",
    },
    {
      key: "paid",
      header: "Paid",
      render: (row: any) => money(row.paid_amount),
      cellClassName: "text-xs lg:text-sm font-semibold tabular-nums",
    },
  ];
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h3 className="text-base lg:text-lg font-bold">Queued Enrollments</h3>
          <p className="card-desc text-slate-500">
            Purchased while another plan was active — these activate
            automatically once the patient's current plan ends.
          </p>
          <p className="mt-1 text-xs font-semibold text-amber-700">
            Expected dates follow the current plan. On actual activation, the
            start and end dates are recalculated from that activation date.
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
        <DataTable
          columns={MEMBERSHIP_COLUMNS}
          data={pagedRows}
          paginate={false}
          emptyMessage="No memberships found"
        />
      </div>
      <Pagination
        page={safePage}
        totalPages={totalPages}
        total={rows.length}
        onPage={setPage}
      />
    </Card>
  );
}
