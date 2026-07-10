import { Badge } from "@/app/components/common/ui";
import { humanizeOptionLabel } from "@/lib/options";
import { Video, UserRoundCheck } from "lucide-react";
import { displayDate } from "@/utils/helper";
import { displayTime,toneForQueue } from "../helpers";

export function ScheduleList({ rows, selectedId, onSelect, onConsult }: any) {
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="card-title font-bold">Schedule List</h4>
        <Badge className="normal-badge">{rows.length} rows</Badge>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="hidden grid-cols-[1fr_1fr_1fr_.95fr_1.6fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 md:grid">
          <span>Patient</span>
          <span>Status</span>
          <span>Date & Time</span>
          <span>Visit</span>
          <span className="text-center">Mode</span>
        </div>
        {rows.length === 0 && (
          <div className="p-5 card-desc text-slate-500">
            No appointment scheduled for the selected doctor.
          </div>
        )}
        {rows.map((row: any) => (
          <div
            key={row.id}
            className={`grid gap-3 border-t border-slate-100 px-4 py-4 transition hover:bg-slate-50 md:grid-cols-[1fr_1fr_1fr_.95fr_1.6fr] ${selectedId === row.id ? "bg-slate-50" : ""}`}
          >
            <div>
              <p className="font-bold text-slate-950 ">{row.patient}</p>
              <p className="text-xs text-slate-500">{row.token || row.id}</p>
            </div>
            <div className="">
              {(row.queueStatus || row.status) && (
                <Badge
                  tone={toneForQueue(row.queueStatus)}
                  className="normal-badge mt-1 text-xs w-[60%] "
                >
                  {humanizeOptionLabel(row.queueStatus || row.status)}
                </Badge>
              )}
            </div>
            <div className=" flex justify-start  flex-col items-start">
              <p className="font-semibold text-slate-800">
                {displayDate(row.appointmentDate || row.appointment_date)}
              </p>
              <p className="text-xs text-slate-500">
                {displayTime(row.time || row.appointment_time)}
              </p>
            </div>
            <div className="flex justify-start items-start ">
              <Badge
                tone={
                  row.tokenType === "Emergency"
                    ? "red"
                    : toneForQueue(row.queueStatus)
                }
                className="normal-badge text-xs w-[60%]"
              >
                {humanizeOptionLabel(row.visitType || row.tokenType || "OP")}
              </Badge>
            </div>
            <div className="flex flex-wrap items-start gap-2 text-slate-600">
              <div className="flex items-center p-1">
                {String(row.visitType || "")
                  .toLowerCase()
                  .includes("online") ? (
                  <Video className="h-5 w-5 text-blue-600" />
                ) : (
                  <UserRoundCheck className="h-5 w-5 text-emerald-600" />
                )}
                <span className="text-xs flex   font-bold">
                  {String(row.visitType || "OP")
                    .toLowerCase()
                    .includes("online")
                    ? "Online"
                    : "Clinic"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onSelect(row.id)}
                className="rounded-xl border px-3 py-2 text-xs font-bold"
              >
                Select
              </button>
              <button
                type="button"
                onClick={() => onConsult(row.id)}
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white"
              >
                Consultation
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
