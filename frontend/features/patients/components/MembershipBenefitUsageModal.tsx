"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/app/components/common/Modal";
import { Button } from "@/app/components/common/ui";

export function MembershipBenefitUsageModal({
  enrollment,
  onClose,
  onSave,
  saving = false,
  labTests = [],
  medicines = [],
}: any) {
  const [draft, setDraft] = useState<any | null>(null);

  useEffect(() => {
    if (!enrollment) {
      setDraft(null);
      return;
    }
    setDraft({
      used_consultations: String(enrollment.used_consultations ?? 0),
      used_free_lab_quantities: {
        ...(enrollment.used_free_lab_quantities || {}),
      },
      used_free_medicine_quantities: {
        ...(enrollment.used_free_medicine_quantities || {}),
      },
      reason: "",
    });
  }, [enrollment]);

  function itemName(rows: any[], itemId: string) {
    const item = rows.find((candidate: any) => candidate.id === itemId);
    return item?.name || item?.test_name || item?.medicine_name || itemId;
  }

  async function save() {
    if (!enrollment || !draft || draft.reason.trim().length < 2) return;
    const saved = await onSave(enrollment, {
      used_consultations: Number(draft.used_consultations || 0),
      used_free_lab_quantities: draft.used_free_lab_quantities,
      used_free_medicine_quantities: draft.used_free_medicine_quantities,
      reason: draft.reason.trim(),
    });
    if (saved) onClose();
  }

  return (
    <Modal
      open={Boolean(enrollment && draft)}
      onClose={onClose}
      title="Update plan benefit usage"
      description={
        enrollment
          ? `${enrollment.patient_name || "Patient"} · ${enrollment.plan?.name || "Membership plan"}`
          : undefined
      }
      maxWidth="md"
    >
      {draft && enrollment && (
        <div className="grid gap-5">
          <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            Update this patient&apos;s plan benefit usage whenever a correction is
            needed. Usage already recorded on invoices cannot be reduced.
          </p>
          {Number(enrollment.plan?.free_consultations || 0) > 0 && (
            <BenefitUsageInput
              label="Free consultations used"
              value={draft.used_consultations}
              max={Number(enrollment.plan.free_consultations)}
              onChange={(value: string) =>
                setDraft((current: any) => ({
                  ...current,
                  used_consultations: value,
                }))
              }
            />
          )}
          {Object.entries(
            enrollment.plan?.free_lab_test_quantities || {},
          ).map(([itemId, limit]: any) => (
            <BenefitUsageInput
              key={`lab-${itemId}`}
              label={`${itemName(labTests, itemId)} used`}
              value={String(draft.used_free_lab_quantities[itemId] || 0)}
              max={Number(limit)}
              onChange={(value: string) =>
                setDraft((current: any) => ({
                  ...current,
                  used_free_lab_quantities: {
                    ...current.used_free_lab_quantities,
                    [itemId]: Number(value || 0),
                  },
                }))
              }
            />
          ))}
          {Object.entries(
            enrollment.plan?.free_medicine_quantities || {},
          ).map(([itemId, limit]: any) => (
            <BenefitUsageInput
              key={`medicine-${itemId}`}
              label={`${itemName(medicines, itemId)} used`}
              value={String(draft.used_free_medicine_quantities[itemId] || 0)}
              max={Number(limit)}
              onChange={(value: string) =>
                setDraft((current: any) => ({
                  ...current,
                  used_free_medicine_quantities: {
                    ...current.used_free_medicine_quantities,
                    [itemId]: Number(value || 0),
                  },
                }))
              }
            />
          ))}
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            Reason for correction
            <textarea
              aria-label="Reason for correction"
              required
              minLength={2}
              maxLength={500}
              rows={3}
              value={draft.reason}
              placeholder="Example: Consultation usage corrected by tenant admin"
              onChange={(event) =>
                setDraft((current: any) => ({
                  ...current,
                  reason: event.target.value,
                }))
              }
              className="rounded-xl border border-slate-200 px-3 py-2 font-normal outline-none focus:border-emerald-600"
            />
            <span className="text-xs font-normal text-slate-500">
              Enter at least 2 characters. This reason is saved in the audit
              history.
            </span>
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button
              onClick={onClose}
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700 hover:bg-slate-200"
            >
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={draft.reason.trim().length < 2 || saving}
            >
              {saving ? "Saving..." : "Save usage"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function BenefitUsageInput({ label, value, max, onChange }: any) {
  return (
    <label className="grid gap-1.5 text-sm font-bold text-slate-700">
      {label}
      <div className="flex items-center gap-3">
        <input
          type="number"
          min="0"
          max={max}
          value={value}
          onChange={(event) => {
            const nextValue = Math.min(
              Math.max(Number(event.target.value || 0), 0),
              max,
            );
            onChange(String(nextValue));
          }}
          className="w-28 rounded-xl border border-slate-200 px-3 py-2 font-normal outline-none focus:border-emerald-600"
        />
        <span className="text-xs font-normal text-slate-500">
          of {max} included
        </span>
      </div>
    </label>
  );
}
