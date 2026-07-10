import { Card, ActionButton, Button } from "@/app/components/common/ui";
import { normalizeMedicineSchedule } from "../helpers";

export function ConsultPrescriptionModal({
  a,
  detail,
  loading,
  busy,
  onClose,
  onCreate,
}: any) {
  const medicines = (detail?.medicines || []).map((m: any) =>
    normalizeMedicineSchedule({
      medicine_name: m.medicine_name,
      dosage: m.dosage,
      frequency: m.frequency,
      duration: m.duration,
      instructions: m.instructions,
    }),
  );
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="card-title font-bold">Prescription Detail</h3>
            <p className="mt-1 text-sm text-slate-500">
              {a.token} · {a.patient}
            </p>
          </div>
          <ActionButton onClick={onClose}>Close</ActionButton>
        </div>
        {loading && <p className="mt-4 text-sm text-slate-500">Loading...</p>}
        {medicines.length > 0 && (
          <div className="mt-4 overflow-auto rounded-2xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Medicine</th>
                  <th>Dosage</th>
                  <th>Frequency</th>
                  <th>Duration</th>
                  <th>Instructions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {medicines.map((m: any, i: number) => (
                  <tr key={i}>
                    <td className="px-4 py-3 font-semibold">
                      {m.medicine_name}
                    </td>
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
        )}
        {detail && medicines.length === 0 && (
          <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
            No medicines in this prescription.
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button
            disabled={busy === a.consultationId || loading}
            onClick={() => onCreate(a)}
            className='save-button'
          >
            {busy === a.consultationId
              ? "Creating..."
              : "Create Pharmacy Issue"}
          </Button>
          <Button onClick={onClose} className='close-button'>Cancel</Button>
        </div>
      </Card>
    </div>
  );
}
