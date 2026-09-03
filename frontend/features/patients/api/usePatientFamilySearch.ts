"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as patientsApi from "./patients.api";

type UsePatientFamilySearchParams = {
  apiSession: ApiSession | null | undefined;
  patientId: string;
  familyRelationships: any[];
};

/**
 * Search-as-you-type patient lookup that backs the "Family Patient"
 * SearchableSelect on the patient detail page — excludes the current
 * patient and anyone already linked, and resets whenever the selected
 * patient or its linked-family list changes.
 */
export function usePatientFamilySearch({
  apiSession,
  patientId,
  familyRelationships,
}: UsePatientFamilySearchParams) {
  const [familyPatientId, setFamilyPatientId] = useState("");
  const [familyRelationship, setFamilyRelationship] = useState("father");
  const [familyNotes, setFamilyNotes] = useState("");
  const [familyPatientOptions, setFamilyPatientOptions] = useState<any[]>([]);
  const [familyPatientSearchLoading, setFamilyPatientSearchLoading] =
    useState(false);

  async function searchFamilyPatients(query = "") {
    if (!apiSession) return;
    setFamilyPatientSearchLoading(true);
    try {
      const params = new URLSearchParams({
        limit: "25",
        active_only: "true",
      });
      if (query.trim()) params.set("q", query.trim());
      const rows = await patientsApi.searchPatients(apiSession, params);
      const linkedIds = new Set(
        familyRelationships.map((row: any) => row.related_patient_id),
      );
      setFamilyPatientOptions(
        (Array.isArray(rows) ? rows : [])
          .filter((row: any) => row.id !== patientId && !linkedIds.has(row.id))
          .map((row: any) => ({
            value: row.id,
            label: row.full_name || row.patient_number || row.id,
            sublabel: `${row.patient_number || row.id}${row.contact_mobile || row.mobile ? ` · ${row.contact_mobile || row.mobile}` : ""}`,
          })),
      );
    } catch {
      setFamilyPatientOptions([]);
    } finally {
      setFamilyPatientSearchLoading(false);
    }
  }

  function resetFamilyForm() {
    setFamilyPatientId("");
    setFamilyRelationship("father");
    setFamilyNotes("");
  }

  useEffect(() => {
    resetFamilyForm();
    searchFamilyPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, familyRelationships.length, apiSession?.tenantId]);

  return {
    familyPatientId,
    setFamilyPatientId,
    familyRelationship,
    setFamilyRelationship,
    familyNotes,
    setFamilyNotes,
    familyPatientOptions,
    familyPatientSearchLoading,
    searchFamilyPatients,
    resetFamilyForm,
  };
}
