import { displayDate } from "@/utils/doctorConsultation/helpers";
import { Badge } from "../common/ui";
import { humanizeOptionLabel } from "@/lib/options";

export function PatientHistoryPanel({ history, onOpenPatient }: any) {
  return (
    <div className="rounded-3xl bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="font-bold">Existing Treatment History</h4>
          <p className="text-sm text-slate-500">
            Previous visits visible for clinical reference.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenPatient?.()}
            className="rounded-xl border bg-white px-3 py-2 text-xs font-bold hover:bg-slate-50"
          >
            Patient Details
          </button>
          <Badge>{history.length} records</Badge>
        </div>
      </div>
      {history.length === 0 && (
        <div className="mt-3 rounded-2xl bg-white p-4 text-sm text-slate-500">
          No previous consultation history found for this patient.
        </div>
      )}
      {history.length > 0 && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {history.map((item: any) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenPatient?.(item.patientId || item.patient_id)}
              className="rounded-2xl bg-white p-4 text-left transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">
                    {displayDate(item.appointmentDate || item.appointment_date)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {item.doctor || item.practitioner_name || "Doctor"} ·{" "}
                    {item.departmentName ||
                      item.departmentId ||
                      "Medical Department"}
                  </p>
                </div>
                <Badge
                  tone={
                    item.consultationStatus === "signed" ? "green" : "slate"
                  }
                >
                  {humanizeOptionLabel(
                    item.consultationStatus || item.status || "Visit",
                  )}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-slate-700">
                {item.diagnosis ||
                  item.doctorNotes ||
                  item.patientRemarks ||
                  item.visitPurpose ||
                  "No clinical summary saved for this visit."}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}