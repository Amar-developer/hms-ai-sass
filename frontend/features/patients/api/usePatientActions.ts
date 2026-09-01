"use client";

import type { ApiSession } from "@/lib/api";
import { toRow, todayInputValue } from "../helpers";
import * as patientsApi from "./patients.api";

function setPendingMessage(id: string, text: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    "medizinhub.patientPendingMessage",
    JSON.stringify({ id, message: text, at: Date.now() }),
  );
}

type UsePatientActionsParams = {
  apiSession: ApiSession | null | undefined;
  scopedSession: ApiSession | null | undefined;
  selectedId: string;
  selected: any;
  branchId?: string;
  setBusy: (busy: boolean) => void;
  setMessage: (message: string) => void;
  setConfirm: (value: any) => void;
  setRows: (updater: (previous: any[]) => any[]) => void;
  setSelectedDetail: (value: any) => void;
  setPatientIntelligence: (updater: (previous: any) => any) => void;
  loadPatientDetail: (
    scopedSession: ApiSession | null | undefined,
    id: string,
  ) => Promise<void>;
  syncSharedPatient: (patient: any) => void;
  setPatients?: (updater: (previous: any[]) => any[]) => void;
  refreshPatients: () => Promise<void>;
  loadLiveData?: (session: ApiSession) => void | Promise<unknown>;
  openDetail: (id: string) => void;
};

/**
 * Patient write actions: create/update the record, upload a photo, run
 * WhatsApp engagement/manual-refill intelligence actions, activate/
 * deactivate, enroll membership, and manage family relationships.
 */
export function usePatientActions({
  apiSession,
  scopedSession,
  selectedId,
  selected,
  branchId,
  setBusy,
  setMessage,
  setConfirm,
  setRows,
  setSelectedDetail,
  setPatientIntelligence,
  loadPatientDetail,
  syncSharedPatient,
  setPatients,
  refreshPatients,
  loadLiveData,
  openDetail,
}: UsePatientActionsParams) {
  async function createPatient(data: any) {
    if (!scopedSession) return;
    setBusy(true);
    setMessage("");
    try {
      const created = await patientsApi.createPatient(scopedSession, {
        branch_id: data.branchId || null,
        full_name: data.fullName,
        mobile: data.mobile || null,
        alternate_mobile: data.alternateMobile || null,
        guardian_name: data.guardianName || null,
        guardian_mobile: data.guardianMobile || null,
        email: data.email || null,
        gender: data.gender || "unknown",
        date_of_birth: data.dateOfBirth || null,
        age_years: data.ageYears ? Number(data.ageYears) : null,
        area: data.area || null,
        address: data.address || null,
        blood_group: data.bloodGroup || null,
        whatsapp_consent_status: data.whatsappConsentStatus || "not_recorded",
        whatsapp_consent_source: data.whatsappConsentSource || null,
        whatsapp_preferred_language: data.whatsappPreferredLanguage || "en",
        sms_consent_status: data.smsConsentStatus || "not_recorded",
        sms_consent_source: data.smsConsentSource || null,
        sms_preferred_language: data.smsPreferredLanguage || "en",
      });
      if (data.familyRelatedPatientId) {
        await patientsApi.createFamilyRelationship(scopedSession, created.id, {
          related_patient_id: data.familyRelatedPatientId,
          relationship: data.familyRelationship || "family",
          notes: data.familyNotes || null,
        });
      }
      setRows((previous: any[]) => [
        toRow(created),
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      syncSharedPatient(created);
      await refreshPatients();
      setPendingMessage(
        created.id,
        data.familyRelatedPatientId
          ? `Patient created and family relationship linked: ${created.full_name}`
          : `Patient created: ${created.full_name}`,
      );
      openDetail(created.id);
    } catch (err: any) {
      setMessage(err.message || "Could not create patient.");
    } finally {
      setBusy(false);
    }
  }

  async function updatePatient(data: any) {
    if (!scopedSession || !selectedId) return;
    setBusy(true);
    setMessage("");
    try {
      const updated = await patientsApi.updatePatient(
        scopedSession,
        selectedId,
        {
          branch_id: data.branchId || null,
          full_name: data.fullName,
          mobile: data.mobile || null,
          alternate_mobile: data.alternateMobile || null,
          guardian_name: data.guardianName || null,
          guardian_mobile: data.guardianMobile || null,
          email: data.email || null,
          gender: data.gender || "unknown",
          date_of_birth: data.dateOfBirth || null,
          age_years: data.ageYears ? Number(data.ageYears) : null,
          area: data.area || null,
          address: data.address || null,
          blood_group: data.bloodGroup || null,
          status: data.status || "active",
          whatsapp_consent_status: data.whatsappConsentStatus || "not_recorded",
          whatsapp_consent_source: data.whatsappConsentSource || null,
          whatsapp_preferred_language: data.whatsappPreferredLanguage || "en",
          sms_consent_status: data.smsConsentStatus || "not_recorded",
          sms_consent_source: data.smsConsentSource || null,
          sms_preferred_language: data.smsPreferredLanguage || "en",
        },
      );
      if (data.familyRelatedPatientId) {
        await patientsApi.createFamilyRelationship(scopedSession, selectedId, {
          related_patient_id: data.familyRelatedPatientId,
          relationship: data.familyRelationship || "family",
          notes: data.familyNotes || null,
        });
      }
      setRows((previous: any[]) => [
        toRow(updated),
        ...previous.filter((row: any) => row.id !== updated.id),
      ]);
      syncSharedPatient(updated);
      setSelectedDetail(updated);
      await refreshPatients();
      setPendingMessage(
        updated.id,
        data.familyRelatedPatientId
          ? "Patient updated and family relationship linked."
          : "Patient updated.",
      );
      openDetail(updated.id);
    } catch (err: any) {
      setMessage(err.message || "Could not update patient.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (!scopedSession || !selectedId) return;
    const fd = new FormData();
    fd.append("file", file);
    setBusy(true);
    setMessage("");
    try {
      const updated = await patientsApi.uploadPatientPhoto(
        scopedSession,
        selectedId,
        fd,
      );
      setSelectedDetail(updated);
      setRows((previous: any[]) => [
        toRow(updated),
        ...previous.filter((row: any) => row.id !== updated.id),
      ]);
      syncSharedPatient(updated);
      setMessage("Photo uploaded.");
    } catch (err: any) {
      setMessage(err.message || "Could not upload photo.");
    } finally {
      setBusy(false);
    }
  }

  async function sendEngagementAction(actionId: string) {
    if (!scopedSession || !actionId) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await patientsApi.sendEngagementAction(
        scopedSession,
        actionId,
      );
      setPatientIntelligence((previous: any) => ({
        ...previous,
        engagement_actions: (previous?.engagement_actions || []).map(
          (action: any) =>
            action.id === actionId
              ? {
                  ...action,
                  status: result.status || "queued",
                  notification_event_id: result.notification_event_id,
                }
              : action,
        ),
      }));
      setMessage("Personalized WhatsApp message queued.");
    } catch (err: any) {
      setMessage(err.message || "Could not queue the WhatsApp message.");
    } finally {
      setBusy(false);
    }
  }

  async function saveManualPrescriptionDate(
    expectedRefillOn: string | null,
    notes: string,
    autoSchedule = false,
  ) {
    if (!scopedSession || !selectedId) return;
    setBusy(true);
    setMessage("");
    try {
      await patientsApi.saveManualRefill(scopedSession, selectedId, {
        expected_refill_on: expectedRefillOn || null,
        auto_schedule: autoSchedule,
        notes: notes || null,
      });
      const intelligenceData = await patientsApi.fetchPatientIntelligence(
        scopedSession,
        selectedId,
      );
      setPatientIntelligence(() => intelligenceData);
      setSelectedDetail((current: any) =>
        current
          ? {
              ...current,
              monthly_tracking_enabled: Boolean(
                expectedRefillOn || current.monthly_lab_on,
              ),
              monthly_refill_on: expectedRefillOn || null,
              monthly_refill_notes: notes || null,
            }
          : current,
      );
      setMessage(
        expectedRefillOn
          ? "Monthly prescription date saved and intelligence rules recalculated."
          : autoSchedule
            ? "Monthly prescription tracking enabled and next date set automatically."
          : "Manual monthly prescription date cleared.",
      );
    } catch (err: any) {
      setMessage(
        err.message || "Could not save the monthly prescription date.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveManualLabDate(
    expectedLabOn: string | null,
    labTestName: string,
    notes: string,
    autoSchedule = false,
  ) {
    if (!scopedSession || !selectedId) return;
    setBusy(true);
    setMessage("");
    try {
      await patientsApi.saveManualLab(scopedSession, selectedId, {
        expected_lab_on: expectedLabOn || null,
        auto_schedule: autoSchedule,
        lab_test_name: labTestName || null,
        notes: notes || null,
      });
      const intelligenceData = await patientsApi.fetchPatientIntelligence(
        scopedSession,
        selectedId,
      );
      setPatientIntelligence(() => intelligenceData);
      setSelectedDetail((current: any) =>
        current
          ? {
              ...current,
              monthly_tracking_enabled: Boolean(
                expectedLabOn || current.monthly_refill_on,
              ),
              monthly_lab_on: expectedLabOn || null,
              monthly_lab_test_name: labTestName || null,
              monthly_lab_notes: notes || null,
            }
          : current,
      );
      setMessage(
        expectedLabOn
          ? "Monthly lab test date saved and tracking rules recalculated."
          : autoSchedule
            ? "Monthly lab tracking enabled and next date set automatically."
          : "Manual monthly lab test date cleared.",
      );
    } catch (err: any) {
      setMessage(err.message || "Could not save the monthly lab test date.");
    } finally {
      setBusy(false);
    }
  }

  async function deactivatePatient(row: any) {
    if (!scopedSession) return;
    setBusy(true);
    setMessage("");
    try {
      await patientsApi.deletePatient(scopedSession, row.id);
      setRows((previous: any[]) =>
        previous.map((item: any) =>
          item.id === row.id ? { ...item, status: "inactive" } : item,
        ),
      );
      setPatients?.((previous: any[]) =>
        previous.map((item: any) =>
          item.id === row.id ? { ...item, status: "inactive" } : item,
        ),
      );
      if (selectedId === row.id)
        setSelectedDetail((current: any) => ({
          ...current,
          status: "inactive",
        }));
      setMessage("Patient deleted/deactivated.");
    } catch (err: any) {
      setMessage(err.message || "Could not delete patient.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function activatePatient(row: any) {
    if (!scopedSession) return;
    setBusy(true);
    setMessage("");
    try {
      const updated = await patientsApi.updatePatient(scopedSession, row.id, {
        status: "active",
      });
      setRows((previous: any[]) =>
        previous.map((item: any) =>
          item.id === row.id ? { ...item, status: updated.status } : item,
        ),
      );
      syncSharedPatient(updated);
      if (selectedId === row.id) setSelectedDetail(updated);
      setMessage("Patient activated.");
    } catch (err: any) {
      setMessage(err.message || "Could not activate patient.");
    } finally {
      setBusy(false);
    }
  }

  async function enrollMembership(data: any) {
    if (!scopedSession || !selectedId) return false;
    if (!data.planId) {
      setMessage("Select membership plan.");
      return false;
    }
    setBusy(true);
    setMessage("");
    try {
      await patientsApi.enrollMembership(scopedSession, {
        branch_id: data.branchId || selected?.branch_id || branchId,
        patient_id: selectedId,
        plan_id: data.planId,
        starts_on: data.startsOn || todayInputValue(),
        paid_amount:
          data.paidAmount !== "" ? Number(data.paidAmount) : undefined,
        payment_method: data.paymentMethod || "cash",
        created_by_user_id: apiSession?.user?.id,
      });
      await Promise.all([
        loadPatientDetail(scopedSession, selectedId),
        loadLiveData?.(scopedSession),
      ]);
      setMessage("Patient membership enrolled and purchase invoice created.");
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not enroll membership.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function updateMembershipBenefitUsage(enrollment: any, usage: any) {
    if (!scopedSession || !selectedId) return false;
    setBusy(true);
    setMessage("");
    try {
      await patientsApi.updateMembershipBenefitUsage(
        scopedSession,
        enrollment.id,
        usage,
      );
      await loadPatientDetail(scopedSession, selectedId);
      setMessage("Patient membership benefit usage updated.");
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not update membership benefit usage.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createFamilyRelationship(data: any) {
    if (!scopedSession || !selectedId) return false;
    if (!data.relatedPatientId) {
      setMessage("Enter the existing family patient ID.");
      return false;
    }
    setBusy(true);
    setMessage("");
    try {
      await patientsApi.createFamilyRelationship(scopedSession, selectedId, {
        related_patient_id: data.relatedPatientId,
        relationship: data.relationship || "family",
        notes: data.notes || null,
      });
      await loadPatientDetail(scopedSession, selectedId);
      setMessage(
        "Family relationship linked. Membership benefits can now be shared.",
      );
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not link family relationship.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function deleteFamilyRelationship(relationshipId: string) {
    if (!scopedSession || !selectedId || !relationshipId) return;
    setBusy(true);
    setMessage("");
    try {
      await patientsApi.deleteFamilyRelationship(
        scopedSession,
        selectedId,
        relationshipId,
      );
      await loadPatientDetail(scopedSession, selectedId);
      setMessage("Family relationship removed.");
    } catch (err: any) {
      setMessage(err.message || "Could not remove family relationship.");
    } finally {
      setBusy(false);
    }
  }

  return {
    createPatient,
    updatePatient,
    uploadPhoto,
    sendEngagementAction,
    saveManualPrescriptionDate,
    saveManualLabDate,
    deactivatePatient,
    activatePatient,
    enrollMembership,
    updateMembershipBenefitUsage,
    createFamilyRelationship,
    deleteFamilyRelationship,
  };
}
