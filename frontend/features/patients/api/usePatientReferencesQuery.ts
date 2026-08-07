"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ApiSession } from "@/lib/api";
import { fetchPatientReferences } from "@/features/patients/components/PatientSearchSelect";

/**
 * Resolves patient name/detail records for a known set of ids (e.g. the
 * patient_ids referenced by a module's own invoices/admissions/orders)
 * instead of depending on the shell preload's global reference cache.
 * Patient rosters can be large, so this deliberately never fetches a bulk
 * list — only the ids the caller actually asks for, chunked and deduped
 * via the same `fetchPatientReferences` used by PatientSearchSelect.
 */
const EMPTY_PATIENT_REFERENCES: any[] = [];

export function usePatientReferencesQuery(
  apiSession: ApiSession | null | undefined,
  patientIds: Array<string | null | undefined>,
) {
  const idKey = useMemo(
    () =>
      [...new Set(patientIds.filter(Boolean).map(String))].sort().join(","),
    [patientIds],
  );

  const query = useQuery<any[]>({
    queryKey: ["patient-references", apiSession?.tenantId, idKey],
    queryFn: () =>
      fetchPatientReferences(apiSession as ApiSession, idKey.split(",")),
    enabled: Boolean(apiSession) && idKey.length > 0,
  });

  const patients = query.data ?? EMPTY_PATIENT_REFERENCES;

  const patientMap = useMemo(
    () => new Map(patients.map((p: any) => [p.id, p])),
    [patients],
  );

  return { patients, patientMap, isLoading: query.isLoading };
}
