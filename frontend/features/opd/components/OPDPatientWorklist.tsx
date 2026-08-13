"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Search, Stethoscope } from "lucide-react";

import { Badge, SearchableSelect } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { PatientFlagBadges } from "@/features/patients/components/PatientFlagBadges";
import { humanizeOptionLabel } from "@/lib/options";
import { displayDate } from "@/utils/helper";
import {
  displayTime,
  isCancelledAppointment,
  isCompletedAppointment,
  statusKey,
} from "@/features/consulation/helpers";

type WorklistFilter = "active" | "waiting" | "called" | "completed" | "all";

type OPDPatientWorklistProps = {
  rows: any[];
  patients: any[];
  selectedId?: string;
  selectedDate: string;
  setSelectedDate: (value: string) => void;
  doctorId: string;
  setDoctorId: (value: string) => void;
  doctors: any[];
  doctorLocked?: boolean;
  onSelect: (id: string) => void;
};

function visitStatus(row: any) {
  if (isCancelledAppointment(row)) return "cancelled";
  if (isCompletedAppointment(row)) return "completed";
  const queue = statusKey(row.queueStatus || row.queue_status || row.status);
  if (queue === "called") return "called";
  if (queue === "in_consultation") return "in_consultation";
  if (["waiting", "in_queue", "requeued", "emergency_queue"].includes(queue))
    return "waiting";
  if (queue === "checked_in") return "checked_in";
  return queue || "scheduled";
}

function statusTone(status: string) {
  if (status === "completed") return "green";
  if (["called", "in_consultation"].includes(status)) return "blue";
  if (status === "cancelled") return "red";
  return "amber";
}

export function filterOPDWorklistRows(
  rows: any[],
  filter: WorklistFilter,
  query: string,
  patientById: Map<string, any>,
) {
  const search = query.trim().toLowerCase();
  return rows.filter((row) => {
    const status = visitStatus(row);
    const matchesFilter =
      filter === "all" ||
      (filter === "active" &&
        status !== "completed" &&
        status !== "cancelled") ||
      (filter === "called" &&
        ["called", "in_consultation"].includes(status)) ||
      status === filter;
    if (!matchesFilter) return false;
    if (!search) return true;
    const patient = patientById.get(
      String(row.patientId || row.patient_id || ""),
    );
    return [
      row.token,
      row.patient,
      row.patient_name,
      row.patient_number,
      row.mobile,
      patient?.full_name,
      patient?.patient_number,
      patient?.mobile,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(search);
  });
}

export function OPDPatientWorklist({
  rows,
  patients,
  selectedId,
  selectedDate,
  setSelectedDate,
  doctorId,
  setDoctorId,
  doctors,
  doctorLocked = false,
  onSelect,
}: OPDPatientWorklistProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<WorklistFilter>("active");
  const patientById = useMemo(
    () =>
      new Map(
        patients.map((patient: any) => [String(patient.id), patient]),
      ),
    [patients],
  );
  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter(
        (row) => !isCancelledAppointment(row) && !isCompletedAppointment(row),
      ).length,
      waiting: rows.filter((row) => visitStatus(row) === "waiting").length,
      called: rows.filter((row) =>
        ["called", "in_consultation"].includes(visitStatus(row)),
      ).length,
      completed: rows.filter(isCompletedAppointment).length,
    }),
    [rows],
  );
  const visibleRows = useMemo(() => {
    return filterOPDWorklistRows(rows, filter, query, patientById);
  }, [filter, patientById, query, rows]);

  return (
    <aside className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)]">
      <div className="border-b border-slate-200 p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-950">
              Patient Worklist
            </h3>
            <p className="mt-0.5 text-[11px] font-medium text-slate-500">
              {displayDate(selectedDate)} · {counts.active} active visits
            </p>
          </div>
          <Badge tone="blue" className="rounded-full px-2 py-1 text-[10px]">
            {visibleRows.length} shown
          </Badge>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          <FormField label="Doctor">
            <SearchableSelect
              value={doctorId}
              onChange={(value) => {
                setDoctorId(value);
              }}
              disabled={doctorLocked}
              searchable={doctors.length > 8}
              placeholder="Select doctor"
              options={doctors.map((doctor) => ({
                value: doctor.id,
                label: doctor.name,
                sublabel: doctor.specialty,
              }))}
            />
          </FormField>
          <FormField label="Visit Date">
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs font-semibold text-slate-800 outline-none transition focus:border-teal-600"
              />
            </div>
          </FormField>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search patient, token or mobile"
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none transition focus:border-teal-600 focus:bg-white"
          />
        </div>

        <div className="scrollbar-hidden mt-3 flex gap-1 overflow-x-auto">
          {(
            [
              ["active", "Active"],
              ["waiting", "Waiting"],
              ["called", "Called"],
              ["completed", "Done"],
              ["all", "All"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition ${
                filter === id
                  ? "bg-brand text-brand-fg"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {label} {counts[id]}
            </button>
          ))}
        </div>
      </div>

      <div className="scrollbar-hidden max-h-[620px] overflow-y-auto p-2 xl:max-h-[calc(100vh-330px)]">
        {visibleRows.length === 0 ? (
          <div className="grid min-h-48 place-items-center px-5 text-center">
            <div>
              <Stethoscope className="mx-auto h-7 w-7 text-slate-300" />
              <p className="mt-2 text-xs font-bold text-slate-700">
                No matching visits
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Change the doctor, date, filter, or search.
              </p>
            </div>
          </div>
        ) : (
          visibleRows.map((row) => {
            const status = visitStatus(row);
            const patient = patientById.get(
              String(row.patientId || row.patient_id || ""),
            );
            const active = String(selectedId) === String(row.id);
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => onSelect(row.id)}
                className={`mb-1 grid w-full grid-cols-[44px_minmax(0,1fr)_auto] gap-2 rounded-xl border p-2.5 text-left transition ${
                  active
                    ? "border-teal-500 bg-teal-50 shadow-sm"
                    : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span
                  className={`grid h-11 w-11 place-items-center rounded-xl text-xs font-black ${
                    active
                      ? "bg-brand text-brand-fg"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {row.token || "OP"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-black text-slate-950">
                    {row.patient || row.patient_name || patient?.full_name || "Patient"}
                  </span>
                  <span className="mt-0.5 flex min-w-0 items-center justify-between gap-2">
                    <span className="truncate text-[10px] font-medium text-slate-500">
                      {humanizeOptionLabel(
                        row.visitType || row.appointmentType || "OP consultation",
                      )}
                    </span>
                    <Badge
                      tone={statusTone(status)}
                      className="shrink-0 rounded-full px-2 py-0.5 text-[9px]"
                    >
                      {humanizeOptionLabel(status)}
                    </Badge>
                  </span>
                  <PatientFlagBadges patient={patient} className="mt-1" />
                </span>
                <span className="pt-0.5 text-[10px] font-bold text-slate-500">
                  {displayTime(row.time || row.appointment_time)}
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
