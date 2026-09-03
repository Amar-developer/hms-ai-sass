"use client";

import type { ApiSession } from "@/lib/api";
import { isQueueActionLocked, statusKey } from "../helpers";
import { splitRows } from "@/utils/helper";
import * as consulationApi from "./consulation.api";

type UseConsultationActionsParams = {
  apiSession: ApiSession | null | undefined;
  selected: any;
  appointments: any[];
  setAppointments: (updater: (appointments: any[]) => any[]) => void;
  refetchAppointments: () => Promise<any[]>;
  setBusy: (value: boolean) => void;
  setPendingAction: (value: "draft" | "sign" | null) => void;
  setMessage: (value: string) => void;
  setSelectedAppointmentId: (id: string) => void;
  nextEligibleAppointment: (excludeId?: string) => any;
  resetConsultation: () => void;
  consultationDraftPayload: () => any;
  labReferralSummary: () => string;
  medicineRows: string;
  prescription: string;
  remarks: string;
  treatmentType: string;
  notes: string;
  referDoctor: boolean;
  referDoctorId: string;
  setConsultationValidationAttempted: (value: boolean) => void;
  addendumNote: string;
  setAddendumNote: (value: string) => void;
  setAddendums: (updater: (addendums: any[]) => any[]) => void;
  markDoneFields: {
    diagnosis: string;
    medicineAmount: number;
    labNeeded: boolean;
    labTests: string;
    referDoctorId: string;
    doctorList: any[];
    feeType: string;
    consultationCharge: number;
    ipBaseAmount: number;
    extraFee: number;
    finalFee: number;
  };
  resetAfterMarkDone: () => void;
  onOpenConsultationInvoices?: () => void;
};

/**
 * Queue and consultation write actions for the doctor dashboard: calling /
 * skipping / requeuing / cancelling a token, drafting, saving and signing a
 * consultation, and posting addendums. Every handler keeps its original
 * "no backend session" local-queue fallback so the demo/offline mode used
 * before login keeps working unchanged.
 */
export function useConsultationActions({
  apiSession,
  selected,
  appointments,
  setAppointments,
  refetchAppointments,
  setBusy,
  setPendingAction,
  setMessage,
  setSelectedAppointmentId,
  nextEligibleAppointment,
  resetConsultation,
  consultationDraftPayload,
  labReferralSummary,
  medicineRows,
  prescription,
  remarks,
  treatmentType,
  notes,
  referDoctor,
  referDoctorId,
  setConsultationValidationAttempted,
  addendumNote,
  setAddendumNote,
  setAddendums,
  markDoneFields,
  resetAfterMarkDone,
  onOpenConsultationInvoices,
}: UseConsultationActionsParams) {
  function updateAppt(id: string, patch: any) {
    setAppointments((current: any[]) =>
      current.map((a: any) => (a.id === id ? { ...a, ...patch } : a)),
    );
  }

  async function callPatient(a: any) {
    if (isQueueActionLocked(a)) return;
    if (apiSession && a.queueEntryId) {
      setBusy(true);
      setMessage("");
      try {
        await consulationApi.callQueueToken(
          apiSession,
          a.queueEntryId,
          "Called from doctor dashboard",
        );
        await refetchAppointments();
        setSelectedAppointmentId(a.id);
        setMessage("Token called in backend.");
      } catch (err: any) {
        setMessage(err.message || "Could not call patient.");
      } finally {
        setBusy(false);
      }
      return;
    }
    updateAppt(a.id, { queueStatus: "Called", status: "In Consultation" });
    setSelectedAppointmentId(a.id);
  }

  function callNext(current: any) {
    const next = nextEligibleAppointment(
      statusKey(current?.queueStatus) === "called" ? current?.id : undefined,
    );
    if (next) callPatient(next);
  }

  function callNextInWorkspace() {
    const next = nextEligibleAppointment(selected?.id);
    if (!next) return;
    callPatient(next);
    return next;
  }

  async function skipPatient() {
    if (!selected) return;
    if (isQueueActionLocked(selected)) return;
    if (apiSession && selected.queueEntryId) {
      setBusy(true);
      setMessage("");
      try {
        await consulationApi.markQueueNotAvailable(
          apiSession,
          selected.queueEntryId,
          "Patient not present from doctor dashboard",
        );
        await refetchAppointments();
        const next = nextEligibleAppointment(selected.id);
        if (next) setSelectedAppointmentId(next.id);
        setMessage("Patient marked not available.");
      } catch (err: any) {
        setMessage(err.message || "Could not update token.");
      } finally {
        setBusy(false);
      }
      return;
    }
    updateAppt(selected.id, {
      status: "Patient Not Available",
      queueStatus: "Not Available",
      skippedCount: (selected.skippedCount || 0) + 1,
    });
  }

  async function requeuePatient(mode: "after2" | "end") {
    if (!selected) return;
    if (isQueueActionLocked(selected)) return;
    if (apiSession && selected.queueEntryId) {
      setBusy(true);
      setMessage("");
      try {
        await consulationApi.requeueQueueToken(
          apiSession,
          selected.queueEntryId,
          "Requeued from doctor dashboard",
          mode === "end",
        );
        await refetchAppointments();
        const next = nextEligibleAppointment(selected.id);
        if (next) setSelectedAppointmentId(next.id);
        setMessage("Token requeued.");
      } catch (err: any) {
        setMessage(err.message || "Could not requeue token.");
      } finally {
        setBusy(false);
      }
      return;
    }
    updateAppt(selected.id, {
      status: "Scheduled",
      queueStatus: "Requeued",
      priority: mode === "after2" ? 2.5 : 5,
      requeueMode: mode,
    });
  }

  async function cancelAppointment() {
    if (!selected) return;
    if (isQueueActionLocked(selected)) return;
    if (apiSession && selected.queueEntryId) {
      setBusy(true);
      setMessage("");
      resetConsultation();
      try {
        await consulationApi.cancelQueueToken(
          apiSession,
          selected.queueEntryId,
          "Cancelled from doctor dashboard",
        );
        await refetchAppointments();
        setSelectedAppointmentId("");
        setMessage("Appointment cancelled.");
      } catch (err: any) {
        setMessage(err.message || "Could not cancel appointment.");
      } finally {
        setBusy(false);
      }
      return;
    }
    updateAppt(selected.id, { status: "Cancelled", queueStatus: "Cancelled" });
  }

  function markDone() {
    if (!selected) return;
    const {
      diagnosis,
      medicineAmount,
      labNeeded,
      labTests,
      referDoctorId: referralDoctorId,
      doctorList,
      feeType,
      consultationCharge,
      ipBaseAmount,
      extraFee,
      finalFee,
    } = markDoneFields;
    const referralDoctor: any = referDoctor
      ? doctorList.find((p: any) => p.id === referralDoctorId)
      : null;
    updateAppt(selected.id, {
      status: "Consultation Done",
      queueStatus: "Completed",
      doctorNotes: notes,
      patientRemarks: remarks,
      diagnosis,
      prescription,
      medicineAmount: Number(medicineAmount || 0),
      labNeeded,
      labTests,
      labAmount: labNeeded ? labTests.split(",").length * 350 : 0,
      referDoctor,
      referDoctorId: referralDoctor?.id,
      referDoctorName: referralDoctor?.name,
      feeType,
      consultationCharge,
      ipBaseAmount,
      extraFee: Number(extraFee || 0),
      finalFee,
    });
    resetAfterMarkDone();
  }

  async function ensureBackendConsultation() {
    if (!apiSession || !selected)
      throw new Error("Backend login and appointment selection are required.");
    if (
      selected.queueEntryId &&
      statusKey(selected.queueStatus) !== "in_consultation" &&
      statusKey(selected.status) !== "in_consultation"
    ) {
      try {
        await consulationApi.startQueueConsultation(
          apiSession,
          selected.queueEntryId,
          "Started from doctor dashboard",
        );
      } catch (err: any) {
        if (!String(err.message || "").includes("already")) throw err;
      }
    }
    if (selected.consultationId) return selected.consultationId;
    const created: any = await consulationApi.createConsultation(apiSession, {
      appointment_id: selected.id,
      created_by_user_id: apiSession.user?.id,
      ...consultationDraftPayload(),
    });
    await refetchAppointments();
    return created.id;
  }

  async function saveBackendDraft() {
    setBusy(true);
    setPendingAction("draft");
    setMessage("");
    try {
      const consultationId = await ensureBackendConsultation();
      const labText = labReferralSummary();
      await consulationApi.updateConsultation(apiSession as ApiSession, consultationId, {
        prescription_text: medicineRows || prescription,
        lab_referral_text: labText || null,
        follow_up_advice: remarks,
        patient_remarks: remarks,
        ...consultationDraftPayload(),
      });
      await refetchAppointments();
      setMessage("Consultation draft saved to backend.");
    } catch (err: any) {
      setMessage(err.message || "Could not save consultation.");
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }

  async function signBackendConsultation() {
    setConsultationValidationAttempted(true);
    const draftPayload = consultationDraftPayload();
    const hasComplaints = Boolean(draftPayload.chief_complaint);
    const hasDiagnosis = Boolean(draftPayload.diagnosis);
    const medicinesMissingDoseOrFrequency = splitRows(medicineRows).some(
      (line: string) => {
        const [_name, dosage, frequency] = line
          .split("|")
          .map((part: string) => part.trim());
        return !dosage || !frequency;
      },
    );
    const missingFields = [
      !treatmentType.trim() ? "treatment type" : "",
      !hasComplaints ? "complaints" : "",
      !hasDiagnosis ? "diagnosis" : "",
      !notes.trim() ? "doctor notes" : "",
      referDoctor && !referDoctorId ? "recommended doctor" : "",
    ].filter(Boolean);
    if (missingFields.length > 0) {
      setMessage(`Add ${missingFields.join(", ")} before signing.`);
      return;
    }
    if (medicinesMissingDoseOrFrequency) {
      setMessage(
        "Every prescribed medicine needs dosage and frequency before signing.",
      );
      return;
    }
    setBusy(true);
    setPendingAction("sign");
    setMessage("");
    try {
      const consultationId = await ensureBackendConsultation();
      const labText = labReferralSummary();
      await consulationApi.updateConsultation(apiSession as ApiSession, consultationId, {
        prescription_text: medicineRows || prescription,
        lab_referral_text: labText || null,
        follow_up_advice: remarks,
        patient_remarks: remarks,
        ...draftPayload,
      });
      await consulationApi.signConsultation(
        apiSession as ApiSession,
        consultationId,
        (apiSession as ApiSession).user?.id,
      );
      await refetchAppointments();
      setConsultationValidationAttempted(false);
      setMessage("Consultation Completed and locked in backend.");
      onOpenConsultationInvoices?.();
    } catch (err: any) {
      setMessage(err.message || "Could not sign consultation.");
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }

  async function saveAddendum() {
    if (!apiSession || !selected?.consultationId || !addendumNote.trim())
      return;
    setBusy(true);
    setMessage("");
    try {
      const saved = await consulationApi.addConsultationAddendum(
        apiSession,
        selected.consultationId,
        addendumNote,
        apiSession.user?.id,
      );
      setAddendums((previous: any[]) => [...previous, saved]);
      setAddendumNote("");
      setMessage("Addendum saved to signed consultation.");
    } catch (err: any) {
      setMessage(err.message || "Could not save addendum.");
    } finally {
      setBusy(false);
    }
  }

  return {
    callPatient,
    callNext,
    callNextInWorkspace,
    skipPatient,
    requeuePatient,
    cancelAppointment,
    markDone,
    saveBackendDraft,
    signBackendConsultation,
    saveAddendum,
  };
}
