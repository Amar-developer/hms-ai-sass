"use client";

import type { ApiSession } from "@/lib/api";
import { mapWithConcurrency } from "@/lib/concurrency";
import * as doctorsApi from "./doctors.api";

type UseDoctorActionsParams = {
  apiSession: ApiSession | null | undefined;
  scopedSession: ApiSession | null | undefined;
  tenantId: string;
  feeRules: any[];
  setBusy: (busy: boolean) => void;
  setMessage: (message: string) => void;
  setConfirm: (value: any) => void;
  syncSharedPractitioner: (practitioner: any) => void;
  setLivePractitioners?: (
    updater: (previous: any[]) => any[],
  ) => void;
  loadFeeRules: (tenantId: string, force?: boolean) => Promise<void>;
  afterSave: () => void;
};

/**
 * Doctor CRUD writes: create/update a practitioner (plus the fee rules that
 * ride along with the same form submit), signature upload, activate/
 * deactivate, and delete.
 */
export function useDoctorActions({
  apiSession,
  scopedSession,
  tenantId,
  feeRules,
  setBusy,
  setMessage,
  setConfirm,
  syncSharedPractitioner,
  setLivePractitioners,
  loadFeeRules,
  afterSave,
}: UseDoctorActionsParams) {
  async function saveDoctorFeeRules(practitionerId: string, data: any) {
    if (!scopedSession) return;
    const practitionerType = String(data.practitionerType || "doctor");
    const branchIds: string[] = data.branchIds || [];
    const specialtyFees: any[] = data.specialtyFees || [];
    const targets = (branchIds.length ? branchIds : [null]).flatMap(
      (branchId: string | null) =>
        specialtyFees.map((specialty) => ({
          branchId,
          departmentId: specialty.departmentId,
          feeAmount: Number(specialty.fee),
          doctorSharePercentage: Math.min(
            100,
            Math.max(0, Number(specialty.doctorSharePercentage || 0)),
          ),
        })),
    );
    await mapWithConcurrency(
      targets,
      (target) => {
        const existing = [...feeRules]
          .filter(
            (rule: any) =>
              rule.is_active &&
              rule.practitioner_id === practitionerId &&
              rule.branch_id === target.branchId &&
              rule.department_id === target.departmentId &&
              rule.appointment_type === "op" &&
              (practitionerType === "physiotherapist"
                ? rule.treatment_type === "physiotherapy_session"
                : !rule.treatment_type),
          )
          .sort(
            (a: any, b: any) =>
              new Date(b.created_at || 0).getTime() -
              new Date(a.created_at || 0).getTime(),
          )[0];
        if (
          existing &&
          Number(existing.fee_amount) === target.feeAmount &&
          Number(existing.doctor_share_percentage || 0) ===
            target.doctorSharePercentage &&
          Boolean(existing.share_tax_with_doctor) ===
            (data.shareTaxWithDoctor === "true")
        ) {
          return Promise.resolve(existing);
        }
        return doctorsApi.createDoctorFeeRule(scopedSession, {
          branch_id: target.branchId,
          department_id: target.departmentId,
          practitioner_id: practitionerId,
          appointment_type: "op",
          treatment_type:
            practitionerType === "physiotherapist"
              ? "physiotherapy_session"
              : null,
          fee_amount: target.feeAmount,
          share_type: "percentage",
          doctor_share_percentage: target.doctorSharePercentage,
          doctor_fixed_amount: null,
          share_tax_with_doctor: data.shareTaxWithDoctor === "true",
        });
      },
      4,
    );
  }

  async function createDoctor(data: any) {
    if (!scopedSession || !apiSession) return;
    setBusy(true);
    setMessage("");
    try {
      const created = await doctorsApi.createPractitioner(scopedSession, {
        user_id: data.userId || null,
        full_name: data.fullName,
        practitioner_type: data.practitionerType || "doctor",
        primary_specialty: data.primarySpecialty || null,
        registration_number: data.registrationNumber || null,
        mobile: data.mobile || null,
        email: data.email || null,
        branch_ids: data.branchIds,
        department_ids: data.departmentIds,
        actor_user_id: apiSession.user?.id || null,
      });
      await saveDoctorFeeRules(created.id, data).catch((err: any) => {
        setMessage(
          err.message || "Doctor created, but fee rule could not be saved.",
        );
      });
      syncSharedPractitioner(created);
      afterSave();
      await loadFeeRules(tenantId, true);
      setMessage(`Doctor created: ${created.full_name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not create doctor.");
    } finally {
      setBusy(false);
    }
  }

  async function updateDoctor(selected: any, data: any) {
    if (!scopedSession || !selected || !apiSession) return;
    setBusy(true);
    setMessage("");
    try {
      const updated = await doctorsApi.updatePractitioner(
        scopedSession,
        selected.id,
        {
          user_id: data.userId || null,
          full_name: data.fullName,
          practitioner_type: data.practitionerType || "doctor",
          primary_specialty: data.primarySpecialty || null,
          registration_number: data.registrationNumber || null,
          mobile: data.mobile || null,
          email: data.email || null,
          status: data.status || "active",
          branch_ids: data.branchIds || [],
          department_ids: data.departmentIds || [],
          actor_user_id: apiSession.user?.id || null,
        },
      );
      await saveDoctorFeeRules(updated.id, data).catch((err: any) => {
        setMessage(
          err.message || "Doctor updated, but fee rule could not be saved.",
        );
      });
      syncSharedPractitioner(updated);
      afterSave();
      await loadFeeRules(tenantId, true);
      setMessage("Doctor updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update doctor.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadDoctorSignature(practitionerId: string, file: File) {
    if (!scopedSession || !file) return;
    setBusy(true);
    setMessage("");
    try {
      const upload = new FormData();
      upload.append("file", file);
      upload.append("category", "signature");
      upload.append("source_module", "practitioners");
      upload.append("attached_to_doctype", "Practitioner");
      upload.append("attached_to_name", practitionerId);
      upload.append("attached_to_field", "signature_url");
      upload.append("attached_to_label", "Doctor Signature");
      upload.append("folder", "Signatures");
      const created = await doctorsApi.uploadPractitionerSignature(
        scopedSession,
        upload,
      );
      setLivePractitioners?.((previous: any[]) =>
        previous.map((row: any) =>
          row.id === practitionerId
            ? { ...row, signature_url: created.file_url }
            : row,
        ),
      );
      setMessage("Signature uploaded.");
    } catch (err: any) {
      setMessage(err.message || "Could not upload signature.");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(row: any) {
    if (!scopedSession || !apiSession) return;
    setBusy(true);
    setMessage("");
    try {
      const updated = await doctorsApi.updatePractitioner(
        scopedSession,
        row.id,
        {
          status: row.status === "active" ? "inactive" : "active",
          branch_ids: row.branch_ids || [],
          department_ids: row.department_ids || [],
          actor_user_id: apiSession.user?.id || null,
        },
      );
      syncSharedPractitioner(updated);
      setMessage(
        `Doctor ${updated.status === "active" ? "activated" : "deactivated"}.`,
      );
    } catch (err: any) {
      setMessage(err.message || "Could not update status.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function deleteDoctor(row: any) {
    if (!scopedSession) return;
    setBusy(true);
    setMessage("");
    try {
      await doctorsApi.deletePractitioner(scopedSession, row.id);
      setLivePractitioners?.((previous: any[]) =>
        previous.map((item: any) =>
          item.id === row.id ? { ...item, status: "inactive" } : item,
        ),
      );
      setMessage("Doctor deleted/deactivated.");
    } catch (err: any) {
      setMessage(err.message || "Could not delete doctor.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  return {
    createDoctor,
    updateDoctor,
    uploadDoctorSignature,
    deactivate,
    deleteDoctor,
  };
}
