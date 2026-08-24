"use client";

import { useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as patientsApi from "./patients.api";

type UsePatientDetailDataParams = {
  canReadPhysiotherapy: boolean;
  canReadIp: boolean;
  canReadHomeCare: boolean;
  canReadIntelligence: boolean;
  setBusy: (busy: boolean) => void;
  setMessage: (message: string) => void;
  // Seeds the patient/IP-admissions state synchronously from the last
  // successful load for this id — see headerCache below.
  initialId?: string;
};

// Module-scope, keyed by patient id: survives the full component remount
// the App Router does on every route change (PatientFlow's tabs are real
// routes), so switching tabs on an already-visited patient can seed the
// header (photo/name/admitted badge) instantly instead of it reverting to
// the "not loaded yet" placeholder for the ~1s the refetch takes.
const headerCache = new Map<string, { patient: any; ipAdmissions: any[] }>();

/**
 * Owns the full patient detail bundle shown on the detail/edit pages:
 * the record itself plus every linked-module read (consultations, lab,
 * pharmacy, physiotherapy, IP, membership, invoices, family, intelligence).
 */
export function usePatientDetailData({
  canReadPhysiotherapy,
  canReadIp,
  canReadHomeCare,
  canReadIntelligence,
  setBusy,
  setMessage,
  initialId,
}: UsePatientDetailDataParams) {
  const cachedHeader = initialId ? headerCache.get(initialId) : undefined;
  const [selectedDetail, setSelectedDetail] = useState<any>(
    cachedHeader?.patient ?? null,
  );
  const [summary, setSummary] = useState<any>(null);
  const [consultations, setConsultations] = useState<any[]>([]);
  const [labOrders, setLabOrders] = useState<any[]>([]);
  const [homeCareBookings, setHomeCareBookings] = useState<any[]>([]);
  const [pharmacyIssues, setPharmacyIssues] = useState<any[]>([]);
  const [physioCases, setPhysioCases] = useState<any[]>([]);
  const [patientIpAdmissions, setPatientIpAdmissions] = useState<any[]>(
    cachedHeader?.ipAdmissions ?? [],
  );
  const [membershipPlans, setMembershipPlans] = useState<any[]>([]);
  const [membershipEnrollments, setMembershipEnrollments] = useState<any[]>(
    [],
  );
  const [patientInvoices, setPatientInvoices] = useState<any[]>([]);
  const [patientCommunications, setPatientCommunications] = useState<any[]>([]);
  const [familyRelationships, setFamilyRelationships] = useState<any[]>([]);
  const [patientIntelligence, setPatientIntelligence] = useState<any>(null);
  const [patientIntelligenceError, setPatientIntelligenceError] =
    useState("");

  async function loadPatientDetail(
    scopedSession: ApiSession | null | undefined,
    id: string,
  ) {
    if (!scopedSession || !id) return;
    setBusy(true);
    setConsultations([]);
    setLabOrders([]);
    setHomeCareBookings([]);
    setPharmacyIssues([]);
    setPhysioCases([]);
    setPatientIpAdmissions([]);
    setMembershipEnrollments([]);
    setPatientInvoices([]);
    setPatientCommunications([]);
    setFamilyRelationships([]);
    setPatientIntelligence(null);
    setPatientIntelligenceError("");
    try {
      const [
        detail,
        summaryData,
        consultationRows,
        labRows,
        homeCareRows,
        pharmacyRows,
        physioRows,
        ipRows,
        planRows,
        enrollmentRows,
        invoiceRows,
        communicationRows,
        familyRows,
        intelligenceData,
      ] = await Promise.all([
        patientsApi.fetchPatient(scopedSession, id),
        patientsApi.fetchPatientSummary(scopedSession, id),
        patientsApi
          .fetchPatientConsultations(scopedSession, id)
          .catch(() => []),
        patientsApi.fetchPatientLabOrders(scopedSession, id).catch(() => []),
        canReadHomeCare
          ? patientsApi
              .fetchPatientHomeCareBookings(scopedSession, id, {
                suppressErrorReportStatuses: [402, 403, 404],
              })
              .catch(() => [])
          : Promise.resolve([]),
        patientsApi
          .fetchPatientPharmacyIssues(scopedSession, id)
          .catch(() => []),
        canReadPhysiotherapy
          ? patientsApi
              .fetchPatientPhysioCases(scopedSession, id, {
                suppressErrorReportStatuses: [402, 403, 404],
              })
              .catch(() => [])
          : Promise.resolve([]),
        canReadIp
          ? patientsApi
              .fetchPatientIpAdmissions(scopedSession, id, {
                suppressErrorReportStatuses: [402, 403, 404],
              })
              .catch(() => [])
          : Promise.resolve([]),
        patientsApi.fetchMembershipPlans(scopedSession).catch(() => []),
        patientsApi
          .fetchMembershipEnrollments(scopedSession, id)
          .catch(() => []),
        patientsApi.fetchPatientInvoices(scopedSession, id).catch(() => []),
        patientsApi.fetchPatientCommunications(scopedSession, id).catch(() => []),
        patientsApi
          .fetchFamilyRelationships(scopedSession, id)
          .catch(() => []),
        canReadIntelligence
          ? patientsApi.fetchPatientIntelligence(scopedSession, id).catch(
              (err: any) => {
                setPatientIntelligenceError(
                  err?.message || "Patient Intelligence could not be loaded.",
                );
                return null;
              },
            )
          : Promise.resolve(null),
      ]);
      const ipAdmissions = Array.isArray(ipRows) ? ipRows : [];
      setSelectedDetail(detail);
      setSummary(summaryData);
      setConsultations(Array.isArray(consultationRows) ? consultationRows : []);
      setLabOrders(Array.isArray(labRows) ? labRows : []);
      setHomeCareBookings(Array.isArray(homeCareRows) ? homeCareRows : []);
      setPharmacyIssues(Array.isArray(pharmacyRows) ? pharmacyRows : []);
      setPhysioCases(Array.isArray(physioRows) ? physioRows : []);
      setPatientIpAdmissions(ipAdmissions);
      if (detail?.id) {
        headerCache.set(detail.id, { patient: detail, ipAdmissions });
      }
      setMembershipPlans(Array.isArray(planRows) ? planRows : []);
      setMembershipEnrollments(
        Array.isArray(enrollmentRows) ? enrollmentRows : [],
      );
      setPatientInvoices(Array.isArray(invoiceRows) ? invoiceRows : []);
      setPatientCommunications(
        Array.isArray(communicationRows) ? communicationRows : [],
      );
      setFamilyRelationships(Array.isArray(familyRows) ? familyRows : []);
      setPatientIntelligence(intelligenceData);
    } catch (err: any) {
      setMessage(err.message || "Could not load patient details.");
    } finally {
      setBusy(false);
    }
  }

  return {
    selectedDetail,
    setSelectedDetail,
    summary,
    consultations,
    labOrders,
    homeCareBookings,
    pharmacyIssues,
    physioCases,
    patientIpAdmissions,
    membershipPlans,
    membershipEnrollments,
    patientInvoices,
    patientCommunications,
    familyRelationships,
    setFamilyRelationships,
    patientIntelligence,
    setPatientIntelligence,
    patientIntelligenceError,
    loadPatientDetail,
  };
}
