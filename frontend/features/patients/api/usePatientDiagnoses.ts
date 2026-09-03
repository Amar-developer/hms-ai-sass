"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as patientsApi from "./patients.api";

type UsePatientDiagnosesParams = {
  apiSession: ApiSession | null | undefined;
  patientId: string;
};

/**
 * A patient's diagnosis history, flattened across every consultation —
 * backs the Diagnosis section of the Patient History module.
 */
export function usePatientDiagnoses({
  apiSession,
  patientId,
}: UsePatientDiagnosesParams) {
  const [diagnoses, setDiagnoses] = useState<any[]>([]);
  const [diagnosesLoading, setDiagnosesLoading] = useState(false);

  const refetchDiagnoses = useCallback(async () => {
    if (!apiSession || !patientId) return;
    setDiagnosesLoading(true);
    try {
      const rows = await patientsApi.fetchPatientDiagnoses(
        apiSession,
        patientId,
      );
      setDiagnoses(Array.isArray(rows) ? rows : []);
    } catch {
      setDiagnoses([]);
    } finally {
      setDiagnosesLoading(false);
    }
  }, [apiSession, patientId]);

  useEffect(() => {
    refetchDiagnoses();
  }, [refetchDiagnoses]);

  return { diagnoses, diagnosesLoading, refetchDiagnoses };
}
