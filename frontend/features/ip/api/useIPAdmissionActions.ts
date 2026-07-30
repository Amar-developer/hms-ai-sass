"use client";

import type { ApiSession } from "@/lib/api";
import { inr, patientName, today } from "@/utils/helper";
import * as ipApi from "./ip.api";

type IPView = "list" | "convert" | "direct" | "detail";

type UseIPAdmissionActionsParams = {
  apiSession: ApiSession | null | undefined;
  branchId?: string;
  departmentId?: string;
  patients: any[];
  ipAdmissions: any[];
  setIpAdmissions: (rows: any[]) => void;
  selectedAdmission: any;
  setSelectedId: (id: string) => void;
  setView: (view: IPView) => void;
  setBusy: (value: string) => void;
  setError: (value: string) => void;
  setMessage: (value: string) => void;
  loadAdmissionWork: (admissionId: string) => Promise<void>;
  refetchAdmissions: () => Promise<any[]>;
  setLatestConsultation: (row: any) => void;
  setLatestConsent: (row: any) => void;
  setLatestDischarge: (row: any) => void;
  setIpInvoice: (value: any) => void;
};

/**
 * Write actions for the IP admission dashboard: creating admissions
 * (direct or converted from an OP appointment), the treatment / consultation
 * / consent / discharge / charge workflow, consent-sign and discharge-finalize,
 * medication orders/administrations, and invoice generation.
 */
export function useIPAdmissionActions({
  apiSession,
  branchId,
  departmentId,
  patients,
  ipAdmissions,
  setIpAdmissions,
  selectedAdmission,
  setSelectedId,
  setView,
  setBusy,
  setError,
  setMessage,
  loadAdmissionWork,
  refetchAdmissions,
  setLatestConsultation,
  setLatestConsent,
  setLatestDischarge,
  setIpInvoice,
}: UseIPAdmissionActionsParams) {
  async function refresh() {
    if (apiSession) await refetchAdmissions();
  }

  async function uploadIpDocuments(
    admissionId: string,
    documentType: string,
    files: any[],
  ) {
    const selectedFiles = files.filter((file: any) => file?.name);
    if (!selectedFiles.length || !apiSession) return;
    await ipApi.uploadAdmissionDocuments(
      apiSession,
      admissionId,
      documentType,
      selectedFiles,
    );
  }

  async function submitAdmission(e: any, fromAppointment = false) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(e.currentTarget);
    const sourceAppointmentId = String(fd.get("source_appointment_id") || "");
    const patientId = String(fd.get("patient_id") || "");
    if (!fromAppointment && !patientId) {
      setError("Select a patient.");
      return;
    }
    const payload = {
      branch_id: branchId,
      patient_id: patientId,
      source_appointment_id: sourceAppointmentId || undefined,
      department_id:
        String(fd.get("department_id") || departmentId || "") || undefined,
      admitting_practitioner_id:
        String(fd.get("practitioner_id") || "") || undefined,
      room_id: String(fd.get("room_id") || "") || undefined,
      ward: String(fd.get("ward") || "General Ward"),
      room: String(fd.get("room") || "") || undefined,
      bed: String(fd.get("bed") || ""),
      admission_date: String(fd.get("admission_date") || today()),
      expected_discharge_date:
        String(fd.get("expected_discharge_date") || "") || undefined,
      aadhaar_number:
        String(fd.get("aadhaar_number") || "").replace(/\D/g, "") || undefined,
      reason: String(fd.get("reason") || "") || undefined,
      provisional_diagnosis:
        String(fd.get("provisional_diagnosis") || "") || undefined,
    };
    setBusy("admission");
    setError("");
    setMessage("");
    try {
      if (apiSession) {
        const row: any =
          fromAppointment && sourceAppointmentId
            ? await ipApi.createAdmissionFromAppointment(
                apiSession,
                sourceAppointmentId,
                payload,
              )
            : await ipApi.createAdmission(apiSession, payload);
        const documentFile = fd.get("admission_document") as File | null;
        if (documentFile?.size) {
          await ipApi.uploadAdmissionDocument(apiSession, row.id, documentFile);
        }
        await refresh();
        setSelectedId(row.id);
        setView("detail");
        setMessage("IP admission created successfully.");
      } else {
        const p = patients.find((row: any) => row.id === patientId);
        const row = {
          ...payload,
          id: `IP-${1001 + ipAdmissions.length}`,
          admission_number: `IP-${1001 + ipAdmissions.length}`,
          patient_id: patientId,
          status: "admitted",
          patient: patientName(p),
        };
        setIpAdmissions([row, ...ipAdmissions]);
        setSelectedId(row.id);
        setView("detail");
      }
      form.reset();
    } catch (err: any) {
      setError(err.message || "Unable to create IP admission.");
    } finally {
      setBusy("");
    }
  }

  async function postWork(
    e: any,
    type: "treatment" | "consultation" | "consent" | "discharge" | "charge",
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!selectedAdmission) return;
    const fd = new FormData(form);
    const bodies: any = {
      treatment: {
        treatment_date: String(fd.get("treatment_date") || today()),
        practitioner_id: String(fd.get("practitioner_id") || "") || undefined,
        treatment_type: String(fd.get("treatment_type") || "ward_round"),
        notes: String(fd.get("notes") || ""),
        medication_summary:
          String(fd.get("medication_summary") || "") || undefined,
        orders: String(fd.get("orders") || "") || undefined,
      },
      consultation: {
        practitioner_id: String(fd.get("practitioner_id") || "") || undefined,
        consultation_date: String(fd.get("consultation_date") || today()),
        consultation_type: String(fd.get("consultation_type") || "ward_round"),
        fee_amount: Number(fd.get("fee_amount") || 0),
        vitals_json: JSON.stringify({
          bp: String(fd.get("bp") || ""),
          pulse: String(fd.get("pulse") || ""),
          temperature: String(fd.get("temperature") || ""),
        }),
        complaints: String(fd.get("complaints") || "") || undefined,
        diagnosis: String(fd.get("diagnosis") || "") || undefined,
        notes: String(fd.get("notes") || "") || undefined,
        prescription_text:
          String(fd.get("prescription_text") || "") || undefined,
      },
      consent: {
        consent_type: String(fd.get("consent_type") || "general_admission"),
        title: String(fd.get("title") || "General IP Admission Consent"),
        content:
          String(fd.get("content") || "") ||
          "Patient/guardian consent received for in-patient admission and treatment.",
        patient_or_guardian_name:
          String(fd.get("patient_or_guardian_name") || "") || undefined,
        relationship: String(fd.get("relationship") || "") || undefined,
      },
      discharge: {
        discharge_date: String(fd.get("discharge_date") || today()),
        final_diagnosis: String(fd.get("final_diagnosis") || ""),
        course_in_hospital:
          String(fd.get("course_in_hospital") || "") || undefined,
        procedures: String(fd.get("procedures") || "") || undefined,
        medications: String(fd.get("medications") || "") || undefined,
        follow_up_advice: String(fd.get("follow_up_advice") || "") || undefined,
        condition_at_discharge:
          String(fd.get("condition_at_discharge") || "") || undefined,
      },
      charge: {
        charge_type: String(fd.get("charge_type") || "room"),
        description: String(fd.get("description") || ""),
        quantity: Number(fd.get("quantity") || 1),
        unit_amount: Number(fd.get("unit_amount") || 0),
      },
    };
    const creators: Record<
      string,
      (session: ApiSession, admissionId: string, payload: any) => Promise<any>
    > = {
      treatment: ipApi.createTreatment,
      consultation: ipApi.createIpConsultation,
      consent: ipApi.createConsent,
      discharge: ipApi.createDischargeSummary,
      charge: ipApi.createCharge,
    };
    setBusy(type);
    setError("");
    setMessage("");
    try {
      if (!apiSession)
        throw new Error("Backend login is required for IP workflow actions.");
      const row = await creators[type](
        apiSession,
        selectedAdmission.id,
        bodies[type],
      );
      if (type === "consent" || type === "discharge") {
        await uploadIpDocuments(
          selectedAdmission.id,
          type,
          fd.getAll("documents"),
        );
      }
      if (type === "consultation") setLatestConsultation(row);
      if (type === "consent") setLatestConsent(row);
      if (type === "discharge") setLatestDischarge(row);
      await loadAdmissionWork(selectedAdmission.id);
      await refresh();
      setMessage(`${type.replace("_", " ")} saved successfully.`);
      form.reset();
    } catch (err: any) {
      setError(err.message || `Unable to save ${type}.`);
    } finally {
      setBusy("");
    }
  }

  async function signConsentEntry(consentId: string) {
    setBusy("consent sign");
    setError("");
    setMessage("");
    try {
      const row = await ipApi.signConsent(apiSession as ApiSession, consentId);
      setLatestConsent(row);
      setMessage("consent sign completed.");
      if (selectedAdmission?.id) await loadAdmissionWork(selectedAdmission.id);
      await refresh();
    } catch (err: any) {
      setError(err.message || "Unable to complete consent sign.");
    } finally {
      setBusy("");
    }
  }

  async function finalizeDischargeEntry(dischargeId: string) {
    setBusy("discharge finalize");
    setError("");
    setMessage("");
    try {
      const row = await ipApi.finalizeDischargeSummary(
        apiSession as ApiSession,
        dischargeId,
      );
      setLatestDischarge(row);
      setMessage("discharge finalize completed.");
      if (selectedAdmission?.id) await loadAdmissionWork(selectedAdmission.id);
      await refresh();
    } catch (err: any) {
      setError(err.message || "Unable to complete discharge finalize.");
    } finally {
      setBusy("");
    }
  }

  async function createMedicationOrder(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!selectedAdmission) return;
    const fd = new FormData(form);
    const payload = {
      medicine_name: String(fd.get("medicine_name") || ""),
      dosage: String(fd.get("dosage") || "") || undefined,
      frequency: String(fd.get("frequency") || "") || undefined,
      route: String(fd.get("route") || "") || undefined,
      start_date: String(fd.get("start_date") || today()),
      end_date: String(fd.get("end_date") || "") || undefined,
      unit_amount: Number(fd.get("unit_amount") || 0),
    };
    setBusy("medication order");
    setError("");
    setMessage("");
    try {
      if (!apiSession)
        throw new Error("Backend login is required for medication orders.");
      await ipApi.createMedicationOrder(
        apiSession,
        selectedAdmission.id,
        payload,
      );
      await loadAdmissionWork(selectedAdmission.id);
      setMessage("Medication order saved.");
      form.reset();
    } catch (err: any) {
      setError(err.message || "Unable to save medication order.");
    } finally {
      setBusy("");
    }
  }

  async function administerMedication(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!selectedAdmission) return;
    const fd = new FormData(form);
    const orderId = String(fd.get("medication_order_id") || "");
    const payload = {
      administered_at: String(fd.get("administered_at") || "") || undefined,
      quantity: Number(fd.get("quantity") || 1),
      status: String(fd.get("status") || "given"),
      notes: String(fd.get("notes") || "") || undefined,
    };
    setBusy("medication administration");
    setError("");
    setMessage("");
    try {
      if (!apiSession)
        throw new Error(
          "Backend login is required for medication administration.",
        );
      await ipApi.createMedicationAdministration(
        apiSession,
        selectedAdmission.id,
        orderId,
        payload,
      );
      await loadAdmissionWork(selectedAdmission.id);
      setMessage("Medicine administration recorded.");
      form.reset();
    } catch (err: any) {
      setError(err.message || "Unable to record medicine administration.");
    } finally {
      setBusy("");
    }
  }

  async function generateInvoice() {
    if (!selectedAdmission || !apiSession) return;
    setBusy("invoice");
    setError("");
    setMessage("");
    try {
      const detail: any = await ipApi.generateAdmissionInvoice(
        apiSession,
        selectedAdmission.id,
      );
      setIpInvoice(detail);
      setMessage(
        `IP invoice ${detail.invoice.invoice_number} generated for ${inr(detail.invoice.total_amount)}.`,
      );
      await refresh();
      await loadAdmissionWork(selectedAdmission.id);
    } catch (err: any) {
      setError(err.message || "Unable to generate IP invoice.");
    } finally {
      setBusy("");
    }
  }

  return {
    refresh,
    submitAdmission,
    postWork,
    signConsentEntry,
    finalizeDischargeEntry,
    createMedicationOrder,
    administerMedication,
    generateInvoice,
  };
}
