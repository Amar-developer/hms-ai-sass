"use client";

import { useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as patientsApi from "./patients.api";

type UsePatientDetailDataParams = {
  canReadPhysiotherapy: boolean;
  canReadIp: boolean;
  canReadIntelligence: boolean;
  setBusy: (busy: boolean) => void;
  setMessage: (message: string) => void;
};

/**
 * Owns the full patient detail bundle shown on the detail/edit pages:
 * the record itself plus every linked-module read (consultations, lab,
 * pharmacy, physiotherapy, IP, membership, invoices, family, intelligence).
 */
export function usePatientDetailData({
  canReadPhysiotherapy,
  canReadIp,
  canReadIntelligence,
  setBusy,
  setMessage,
}: UsePatientDetailDataParams) {
  const [selectedDetail, setSelectedDetail] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [consultations, setConsultations] = useState<any[]>([]);
  const [labOrders, setLabOrders] = useState<any[]>([]);
  const [pharmacyIssues, setPharmacyIssues] = useState<any[]>([]);
  const [physioCases, setPhysioCases] = useState<any[]>([]);
  const [patientIpAdmissions, setPatientIpAdmissions] = useState<any[]>([]);
  const [membershipPlans, setMembershipPlans] = useState<any[]>([]);
  const [membershipEnrollments, setMembershipEnrollments] = useState<any[]>(
    [],
  );
  const [patientInvoices, setPatientInvoices] = useState<any[]>([]);
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
    setPharmacyIssues([]);
    setPhysioCases([]);
    setPatientIpAdmissions([]);
    setMembershipEnrollments([]);
    setPatientInvoices([]);
    setFamilyRelationships([]);
    setPatientIntelligence(null);
    setPatientIntelligenceError("");
    try {
      const [
        detail,
        summaryData,
        consultationRows,
        labRows,
        pharmacyRows,
        physioRows,
        ipRows,
        planRows,
        enrollmentRows,
        invoiceRows,
        familyRows,
        intelligenceData,
      ] = await Promise.all([
        patientsApi.fetchPatient(scopedSession, id),
        patientsApi.fetchPatientSummary(scopedSession, id),
        patientsApi
          .fetchPatientConsultations(scopedSession, id)
          .catch(() => []),
        patientsApi.fetchPatientLabOrders(scopedSession, id).catch(() => []),
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
      setSelectedDetail(detail);
      setSummary(summaryData);
      setConsultations(Array.isArray(consultationRows) ? consultationRows : []);
      setLabOrders(Array.isArray(labRows) ? labRows : []);
      setPharmacyIssues(Array.isArray(pharmacyRows) ? pharmacyRows : []);
      setPhysioCases(Array.isArray(physioRows) ? physioRows : []);
      setPatientIpAdmissions(Array.isArray(ipRows) ? ipRows : []);
      setMembershipPlans(Array.isArray(planRows) ? planRows : []);
      setMembershipEnrollments(
        Array.isArray(enrollmentRows) ? enrollmentRows : [],
      );
      setPatientInvoices(Array.isArray(invoiceRows) ? invoiceRows : []);
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
    pharmacyIssues,
    physioCases,
    patientIpAdmissions,
    membershipPlans,
    membershipEnrollments,
    patientInvoices,
    familyRelationships,
    setFamilyRelationships,
    patientIntelligence,
    setPatientIntelligence,
    patientIntelligenceError,
    loadPatientDetail,
  };
}
