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

// Module-scope, keyed by patient id: Patient is rendered from
// app/(shell)/(app)/patients/layout.tsx so it survives tab switches, but a
// hard refresh or a fresh navigation into a patient's detail view still
// mounts it from scratch. This seeds the header (photo/name/admitted badge)
// instantly from the last successful load for that id instead of reverting
// to the "not loaded yet" placeholder for the ~1s the refetch takes.
const headerCache = new Map<string, { patient: any; ipAdmissions: any[] }>();

// Same idea, for the rest of the linked-module bundle (consultations, labs,
// invoices, etc.), and also no longer clearing these to [] at the start of
// a refetch (see loadPatientDetail below) — both matter for a fresh mount,
// and the second one also keeps rows on screen during any background
// refetch of an already-mounted instance.
type DetailBundle = {
  summary: any;
  consultations: any[];
  labOrders: any[];
  homeCareBookings: any[];
  pharmacyIssues: any[];
  physioCases: any[];
  membershipPlans: any[];
  membershipEnrollments: any[];
  patientInvoices: any[];
  patientCommunications: any[];
  familyRelationships: any[];
  patientIntelligence: any;
};
const detailCache = new Map<string, DetailBundle>();

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
  const cachedBundle = initialId ? detailCache.get(initialId) : undefined;
  const [selectedDetail, setSelectedDetail] = useState<any>(
    cachedHeader?.patient ?? null,
  );
  const [summary, setSummary] = useState<any>(cachedBundle?.summary ?? null);
  const [consultations, setConsultations] = useState<any[]>(
    cachedBundle?.consultations ?? [],
  );
  const [labOrders, setLabOrders] = useState<any[]>(
    cachedBundle?.labOrders ?? [],
  );
  const [homeCareBookings, setHomeCareBookings] = useState<any[]>(
    cachedBundle?.homeCareBookings ?? [],
  );
  const [pharmacyIssues, setPharmacyIssues] = useState<any[]>(
    cachedBundle?.pharmacyIssues ?? [],
  );
  const [physioCases, setPhysioCases] = useState<any[]>(
    cachedBundle?.physioCases ?? [],
  );
  const [patientIpAdmissions, setPatientIpAdmissions] = useState<any[]>(
    cachedHeader?.ipAdmissions ?? [],
  );
  const [membershipPlans, setMembershipPlans] = useState<any[]>(
    cachedBundle?.membershipPlans ?? [],
  );
  const [membershipEnrollments, setMembershipEnrollments] = useState<any[]>(
    cachedBundle?.membershipEnrollments ?? [],
  );
  const [patientInvoices, setPatientInvoices] = useState<any[]>(
    cachedBundle?.patientInvoices ?? [],
  );
  const [patientCommunications, setPatientCommunications] = useState<any[]>(
    cachedBundle?.patientCommunications ?? [],
  );
  const [familyRelationships, setFamilyRelationships] = useState<any[]>(
    cachedBundle?.familyRelationships ?? [],
  );
  const [patientIntelligence, setPatientIntelligence] = useState<any>(
    cachedBundle?.patientIntelligence ?? null,
  );
  const [patientIntelligenceError, setPatientIntelligenceError] =
    useState("");

  async function loadPatientDetail(
    scopedSession: ApiSession | null | undefined,
    id: string,
  ) {
    if (!scopedSession || !id) return;
    // Deliberately not resetting the row/state arrays to [] here: this runs
    // on every tab switch (the App Router remounts the component on every
    // route change), and clearing first made every table flash empty until
    // the refetch below resolved. Previous rows — from this render's cached
    // seed or the last load — stay on screen until fresh data replaces them.
    setBusy(true);
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
      const bundle: DetailBundle = {
        summary: summaryData,
        consultations: Array.isArray(consultationRows) ? consultationRows : [],
        labOrders: Array.isArray(labRows) ? labRows : [],
        homeCareBookings: Array.isArray(homeCareRows) ? homeCareRows : [],
        pharmacyIssues: Array.isArray(pharmacyRows) ? pharmacyRows : [],
        physioCases: Array.isArray(physioRows) ? physioRows : [],
        membershipPlans: Array.isArray(planRows) ? planRows : [],
        membershipEnrollments: Array.isArray(enrollmentRows)
          ? enrollmentRows
          : [],
        patientInvoices: Array.isArray(invoiceRows) ? invoiceRows : [],
        patientCommunications: Array.isArray(communicationRows)
          ? communicationRows
          : [],
        familyRelationships: Array.isArray(familyRows) ? familyRows : [],
        patientIntelligence: intelligenceData,
      };
      setSelectedDetail(detail);
      setSummary(bundle.summary);
      setConsultations(bundle.consultations);
      setLabOrders(bundle.labOrders);
      setHomeCareBookings(bundle.homeCareBookings);
      setPharmacyIssues(bundle.pharmacyIssues);
      setPhysioCases(bundle.physioCases);
      setPatientIpAdmissions(ipAdmissions);
      if (detail?.id) {
        headerCache.set(detail.id, { patient: detail, ipAdmissions });
        detailCache.set(detail.id, bundle);
      }
      setMembershipPlans(bundle.membershipPlans);
      setMembershipEnrollments(bundle.membershipEnrollments);
      setPatientInvoices(bundle.patientInvoices);
      setPatientCommunications(bundle.patientCommunications);
      setFamilyRelationships(bundle.familyRelationships);
      setPatientIntelligence(bundle.patientIntelligence);
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
