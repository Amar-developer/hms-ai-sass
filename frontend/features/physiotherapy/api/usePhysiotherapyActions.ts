"use client";

import type { ApiSession } from "@/lib/api";
import { inr, today } from "@/utils/helper";
import * as physiotherapyApi from "./physiotherapy.api";

type UsePhysiotherapyActionsParams = {
  apiSession: ApiSession | null | undefined;
  branchId?: string;
  departmentId?: string;
  appointments: any[];
  ipAdmissions: any[];
  selected: any;
  setSelectedId: (id: string) => void;
  setView: (view: "list" | "op" | "ip" | "detail") => void;
  setBusy: (value: string) => void;
  setError: (value: string) => void;
  setMessage: (value: string) => void;
  setCases: (updater: (cases: any[]) => any[]) => void;
  setInvoiceDetail: (value: any) => void;
  loadPhysio: () => Promise<void>;
  loadLiveData?: (session: ApiSession) => Promise<void>;
  loadSessions: (caseId: string) => Promise<void>;
  loadInvoice: (caseId: string) => Promise<void>;
};

/**
 * Write actions for the physiotherapy dashboard: creating OP/IP cases,
 * the equipment master, recording a therapy session, uploading signed
 * consent files, and generating the case invoice.
 */
export function usePhysiotherapyActions({
  apiSession,
  branchId,
  departmentId,
  appointments,
  ipAdmissions,
  selected,
  setSelectedId,
  setView,
  setBusy,
  setError,
  setMessage,
  setCases,
  setInvoiceDetail,
  loadPhysio,
  loadLiveData,
  loadSessions,
  loadInvoice,
}: UsePhysiotherapyActionsParams) {
  async function refresh() {
    await loadPhysio();
    if (apiSession && loadLiveData) await loadLiveData(apiSession);
  }

  async function submitCase(e: any, careContext: "op" | "ip") {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const appointmentId = String(fd.get("source_appointment_id") || "");
    const admissionId = String(fd.get("ip_admission_id") || "");
    const appointment = appointments.find(
      (row: any) => row.id === appointmentId,
    );
    const admission = ipAdmissions.find((row: any) => row.id === admissionId);
    const patientId = String(
      fd.get("patient_id") ||
        appointment?.patientId ||
        appointment?.patient_id ||
        admission?.patient_id ||
        admission?.patientId ||
        "",
    );
    const payload = {
      branch_id: branchId,
      patient_id: patientId,
      source_appointment_id: appointmentId || undefined,
      ip_admission_id: admissionId || undefined,
      department_id: departmentId || undefined,
      physiotherapist_id: String(fd.get("physiotherapist_id") || "") || undefined,
      care_context: careContext,
      assessment_date: String(fd.get("assessment_date") || today()),
      body_region: String(fd.get("body_region") || "") || undefined,
      condition: String(fd.get("condition") || "") || undefined,
      pain_score:
        fd.get("pain_score") === "" ? undefined : Number(fd.get("pain_score")),
      range_of_motion: String(fd.get("range_of_motion") || "") || undefined,
      muscle_strength: String(fd.get("muscle_strength") || "") || undefined,
      treatment_goal: String(fd.get("treatment_goal") || "") || undefined,
      planned_sessions: Number(fd.get("planned_sessions") || 1),
      frequency: String(fd.get("frequency") || "") || undefined,
    };
    setBusy("case");
    setError("");
    setMessage("");
    try {
      const row: any = await physiotherapyApi.createCase(
        apiSession as ApiSession,
        payload,
      );
      await refresh();
      setSelectedId(row.id);
      setView("detail");
      setMessage("Physiotherapy case created successfully.");
      form.reset();
    } catch (err: any) {
      setError(err.message || "Unable to create physiotherapy case.");
    } finally {
      setBusy("");
    }
  }

  async function submitEquipment(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      branch_id:
        String(fd.get("branch_scope") || "branch") === "branch"
          ? branchId
          : undefined,
      name: String(fd.get("name") || ""),
      modality_type: String(fd.get("modality_type") || "ift"),
      manufacturer: String(fd.get("manufacturer") || "") || undefined,
      model_number: String(fd.get("model_number") || "") || undefined,
      serial_number: String(fd.get("serial_number") || "") || undefined,
      is_portable: String(fd.get("is_portable") || "false") === "true",
    };
    setBusy("equipment");
    setError("");
    setMessage("");
    try {
      await physiotherapyApi.createEquipment(apiSession as ApiSession, payload);
      await refresh();
      setMessage("Physiotherapy equipment saved.");
      form.reset();
    } catch (err: any) {
      setError(err.message || "Unable to save equipment.");
    } finally {
      setBusy("");
    }
  }

  async function submitSession(e: any) {
    e.preventDefault();
    if (!selected) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      session_date: String(fd.get("session_date") || today()),
      equipment_id: String(fd.get("equipment_id") || "") || undefined,
      modality_type: String(fd.get("modality_type") || "exercise"),
      physiotherapist_id:
        String(fd.get("physiotherapist_id") || "") ||
        selected.physiotherapist_id ||
        undefined,
      treatment_area: String(fd.get("treatment_area") || "") || undefined,
      intensity: String(fd.get("intensity") || "") || undefined,
      duration_minutes: Number(fd.get("duration_minutes") || 15),
      pre_pain_score:
        fd.get("pre_pain_score") === ""
          ? undefined
          : Number(fd.get("pre_pain_score")),
      post_pain_score:
        fd.get("post_pain_score") === ""
          ? undefined
          : Number(fd.get("post_pain_score")),
      exercises: String(fd.get("exercises") || "") || undefined,
      home_program: String(fd.get("home_program") || "") || undefined,
      notes: String(fd.get("notes") || "") || undefined,
      charge_amount: Number(fd.get("charge_amount") || 0),
    };
    setBusy("session");
    setError("");
    setMessage("");
    try {
      await physiotherapyApi.createCaseSession(
        apiSession as ApiSession,
        selected.id,
        payload,
      );
      await loadSessions(selected.id);
      await loadInvoice(selected.id);
      setMessage("Physiotherapy session saved.");
      form.reset();
    } catch (err: any) {
      setError(err.message || "Unable to save physiotherapy session.");
    } finally {
      setBusy("");
    }
  }

  async function submitConsent(e: any) {
    e.preventDefault();
    if (!selected) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const files = Array.from(fd.getAll("consent_files")).filter(
      (file: any) => file?.size,
    ) as File[];
    if (files.length === 0) {
      setError("Please select at least one file to upload.");
      return;
    }
    const notes = fd.get("consent_notes") as string | null;
    setBusy("consent");
    setError("");
    setMessage("");
    try {
      const updated: any = await physiotherapyApi.uploadCaseConsent(
        apiSession as ApiSession,
        selected.id,
        files,
        notes || undefined,
      );
      setCases((prev: any[]) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
      setMessage("Consent files uploaded successfully.");
      form.reset();
    } catch (err: any) {
      setError(err.message || "Unable to upload consent form.");
    } finally {
      setBusy("");
    }
  }

  async function generateInvoice() {
    if (!selected) return;
    setBusy("invoice");
    setError("");
    setMessage("");
    try {
      const detail: any = await physiotherapyApi.generatePhysiotherapyInvoice(
        apiSession as ApiSession,
        selected.id,
        { created_by_user_id: (apiSession as ApiSession).user?.id },
      );
      setInvoiceDetail(detail);
      setMessage(
        `Physiotherapy invoice ${detail.invoice.invoice_number} generated for ${inr(detail.invoice.total_amount)}. Collect payment from Invoices.`,
      );
      await refresh();
    } catch (err: any) {
      setError(err.message || "Unable to generate physiotherapy invoice.");
    } finally {
      setBusy("");
    }
  }

  return {
    refresh,
    submitCase,
    submitEquipment,
    submitSession,
    submitConsent,
    generateInvoice,
  };
}
