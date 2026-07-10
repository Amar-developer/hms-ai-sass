import { Pagination } from "@/app/components/common/Pagination";
import { enrollmentPageSize } from "../constants";
import { useEffect, useState } from "react";
import { Card,Badge } from "@/app/components/common/ui";
import { PlanIconButton } from "./PlanIconButton";
import { displayDate, money } from "@/utils/helper";

export function ActiveEnrollmentsTable({
  rows,
  patientMap,
  canManage,
  busy,
  onUpdate,
  onCancel,
}: any) {
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<any | null>(null);
  const totalPages = Math.max(1, Math.ceil(rows.length / enrollmentPageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice(
    (safePage - 1) * enrollmentPageSize,
    safePage * enrollmentPageSize,
  );
  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  function startEdit(row: any) {
    setEditing({
      id: row.id,
      starts_on: String(row.starts_on || "").slice(0, 10),
      ends_on: String(row.ends_on || "").slice(0, 10),
      paid_amount: String(row.paid_amount ?? 0),
      used_consultations: String(row.used_consultations ?? 0),
    });
  }

  function editValue(key: string, value: string) {
    setEditing((current: any) => ({ ...current, [key]: value }));
  }

  function saveEdit(row: any) {
    if (!editing) return;
    onUpdate(row, {
      starts_on: editing.starts_on,
      ends_on: editing.ends_on,
      paid_amount: Number(editing.paid_amount || 0),
      used_consultations: Number(editing.used_consultations || 0),
    });
    setEditing(null);
  }

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h3 className="text-base lg:text-lg font-bold">Active Enrollments</h3>
          <p className="card-desc text-slate-500">
            Paginated table for active patient memberships.
          </p>
        </div>
        <Badge
          tone="green"
          className="w-[20%] lg:w-[15%] text-xs lg:text-sm rounded-full py-2 px-2"
        >
          {rows.length} active
        </Badge>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-[560px] text-left text-sm ">
          <colgroup className="">
            <col className="w-[80px]" />
            <col className="w-[140px]" />
            <col className="w-[180px]" />
            <col className="w-[180px]" />
            <col className="w-[120px]" />
            <col className="w-[120px]" />
            <col className="w-[160px]" />
            {/* {canManage ? <col className="w-[150px]" />:''} */}
          </colgroup>
          <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">#</th>
              <th>Patient</th>
              <th>Plan</th>
              <th>Validity</th>
              <th className="text-left">Paid</th>
              <th>Status</th>
              {canManage && <th className="text-center pr-4">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {pageRows.length === 0 && (
              <tr>
                <td
                  colSpan={canManage ? 7 : 6}
                  className="px-4 py-4 text-slate-500 text-xs lg:text-sm"
                >
                  No active enrollments yet.
                </td>
              </tr>
            )}
            {pageRows.map((row: any, index: number) => {
              const isEditing = editing?.id === row.id;
              return (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-4 font-semibold text-slate-500 text-xs lg:text-sm">
                    {(safePage - 1) * enrollmentPageSize + index + 1}
                  </td>
                  <td>
                    <b className="text-xs lg:text-sm">
                      {patientMap.get(row.patient_id)?.name ||
                        patientMap.get(row.patient_id)?.full_name ||
                        "Patient"}
                    </b>
                    <p className="text-xs text-slate-500 text-xs lg:text-sm">
                      {patientMap.get(row.patient_id)?.patient_number || ""}
                    </p>
                  </td>
                  <td>
                    <b className="text-xs lg:text-sm">
                      {row.plan?.name || "Membership plan"}
                    </b>
                    {/* {row.plan?.code && (
                      <p className="text-xs text-slate-500">{row.plan.code}</p>
                    )} */}
                  </td>
                  <td className="text-xs lg:text-sm">
                    {isEditing ? (
                      <div className="grid gap-1">
                        {/* READ ONLY START DATE */}
                        <input
                          type="date"
                          value={editing.starts_on}
                          disabled
                          className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1.5 text-xs text-slate-500"
                        />

                        {/* EDITABLE END DATE */}
                        <input
                          type="date"
                          value={editing.ends_on}
                          onChange={(event: any) =>
                            editValue("ends_on", event.target.value)
                          }
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                        />
                      </div>
                    ) : (
                      <>
                        {displayDate(row.starts_on)} to{" "}
                        {displayDate(row.ends_on)}
                      </>
                    )}
                  </td>
                  <td className="text-left font-semibold tabular-nums text-xs lg:text-sm">
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        value={editing.paid_amount}
                        onChange={(event: any) =>
                          editValue("paid_amount", event.target.value)
                        }
                        className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs"
                      />
                    ) : (
                      money(row.paid_amount)
                    )}
                  </td>
                  <td>
                    <Badge tone="green" className="table-status w-[60%]">
                      {row.status}
                    </Badge>
                  </td>
                  {canManage && (
                    <td className="pr-4">
                      <div className="flex justify-end gap-2">
                        {isEditing ? (
                          <>
                            <PlanIconButton
                              title="Save"
                              disabled={busy === `enrollment-${row.id}`}
                              onClick={() => saveEdit(row)}
                              tone="green"
                            >
                              Save
                            </PlanIconButton>
                            <PlanIconButton
                              title="Cancel"
                              onClick={() => setEditing(null)}
                            >
                              Cancel
                            </PlanIconButton>
                          </>
                        ) : (
                          <>
                            <PlanIconButton
                              title="Edit enrollment"
                              onClick={() => startEdit(row)}
                            >
                              Edit
                            </PlanIconButton>
                            <PlanIconButton
                              title="Cancel enrollment"
                              disabled={busy === `enrollment-${row.id}`}
                              onClick={() => onCancel(row)}
                              tone="amber"
                            >
                              Cancel
                            </PlanIconButton>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination
        page={safePage}
        totalPages={totalPages}
        total={rows.length}
        pageSize={enrollmentPageSize}
        onPage={setPage}
      />
    </Card>
  );
}
