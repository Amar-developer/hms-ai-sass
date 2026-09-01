import { Badge } from "@/app/components/common/ui";
import { humanizeOptionLabel } from "@/lib/options";
import { ArrowRight, CalendarClock, UserRound } from "lucide-react";
import { displayDate } from "@/utils/helper";
import { displayTime,toneForQueue } from "../helpers";
import { TableSkeleton } from "@/app/components/common/loader/TableSkeleton";

export function ScheduleList({ rows, loading, selectedId, onSelect, onConsult }: any) {
  return (
    <div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="hidden grid-cols-[minmax(220px,1.5fr)_150px_180px_130px_150px] gap-4 border-b border-emerald-100 bg-slate-100 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-600 md:grid">
          <span>Patient & Token</span>
          <span>Queue Status</span>
          <span>Appointment</span>
          <span>Visit Type</span>
          <span className="text-right">Action</span>
        </div>
        {loading ? (
          <TableSkeleton rows={6} columns={5} />
        ) : (
          <>
        {rows.length === 0 && (
          <div className="grid min-h-44 place-items-center px-5 text-center">
            <div>
              <CalendarClock className="mx-auto h-7 w-7 text-slate-300" />
              <p className="mt-2 text-xs font-bold text-slate-700">
                No scheduled visits
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Change the doctor or visit date to view another schedule.
              </p>
            </div>
          </div>
        )}
        {rows.map((row: any) => (
          <div
            key={row.id}
            onClick={() => onSelect?.(row.id)}
            className={`grid w-full gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-emerald-50/30 md:grid-cols-[minmax(220px,1.5fr)_150px_180px_130px_150px] md:items-center ${selectedId === row.id ? "border-l-4 border-l-emerald-600 bg-emerald-50/60" : "bg-white"}`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <UserRound className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-black text-slate-950">
                  {row.patient || "Patient"}
                </span>
                <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">
                  Token {row.token || "-"}
                </span>
              </span>
            </div>
            <div>
              {(row.queueStatus || row.status) && (
                <Badge
                  tone={toneForQueue(row.queueStatus)}
                  className="inline-flex rounded-full px-2.5 py-1 text-[10px]"
                >
                  {humanizeOptionLabel(row.queueStatus || row.status)}
                </Badge>
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">
                {displayDate(row.appointmentDate || row.appointment_date)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {displayTime(row.time || row.appointment_time)}
              </p>
            </div>
            <div>
              <Badge
                tone={
                  row.tokenType === "Emergency"
                    ? "red"
                    : toneForQueue(row.queueStatus)
                }
                className="inline-flex rounded-full px-2.5 py-1 text-[10px]"
              >
                {humanizeOptionLabel(row.visitType || row.tokenType || "OP")}
              </Badge>
            </div>
            <div className="flex justify-start md:justify-end">
              <button
                type="button"
                onClick={(event: any) => {
                  event.stopPropagation();
                  onConsult(row.id);
                }}
                className="primary-action h-9 gap-2 px-3 text-xs"
              >
                Open Visit
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
          </>
        )}
      </div>
    </div>
  );
}
