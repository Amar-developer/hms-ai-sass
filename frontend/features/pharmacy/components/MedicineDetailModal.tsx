import { apiFetch } from "@/lib/api";
import { displayDateTime } from "@/utils/helper";
import { useEffect, useState } from "react";
import { Card, ActionButton } from "@/app/components/common/ui";
import { normalizeMedicineSchedule, parseMedicines } from "../helpers";

export function MedicineDetailModal({ issue, apiSession, patient, onClose }: any) {
  const [consultMedicines, setConsultMedicines] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function loadLinkedConsultation() {
      if (!apiSession || !issue?.consultation_id) return;
      setLoading(true);
      try {
        const detail = await apiFetch(
          `/consultations/${issue.consultation_id}`,
          apiSession,
        );
        if (!cancelled) setConsultMedicines(detail?.medicines || []);
      } catch {
        if (!cancelled) setConsultMedicines([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadLinkedConsultation();
    return () => {
      cancelled = true;
    };
  }, [apiSession?.tenantId, issue?.consultation_id]);
  const parsedMedicines = parseMedicines(issue?.medicine_text);
  const medicines = consultMedicines.length
    ? consultMedicines.map((m: any) =>
        normalizeMedicineSchedule({
          name: m.medicine_name,
          dosage: m.dosage,
          frequency: m.frequency,
          duration: m.duration,
          instructions: m.instructions,
        }),
      )
    : parsedMedicines;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold">Medicine List</h3>
            <p className="mt-1 text-sm text-slate-500">{patient}</p>
            <p className="text-xs text-slate-500">
              {issue?.created_at ? displayDateTime(issue.created_at) : ""}
            </p>
          </div>
          <ActionButton onClick={onClose}>Close</ActionButton>
        </div>
        {loading && (
          <p className="mt-4 text-sm text-slate-500">
            Loading prescription details...
          </p>
        )}
        {medicines.length > 0 ? (
          <div className="mt-5 overflow-auto rounded-2xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Medicine</th>
                  <th>Dosage</th>
                  <th>Frequency</th>
                  <th>Duration</th>
                  <th className="pr-4">Instructions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {medicines.map((m: any, i: number) => (
                  <tr key={i}>
                    <td className="px-4 py-3 font-semibold">{m.name}</td>
                    <td>{m.dosage || "-"}</td>
                    <td>{m.frequency || "-"}</td>
                    <td>{m.duration || "-"}</td>
                    <td className="pr-4 text-slate-500">
                      {m.instructions || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
            No medicines found.
          </p>
        )}
      </Card>
    </div>
  );
}
