"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as patientsApi from "./patients.api";

type UsePatientVitalsParams = {
  apiSession: ApiSession | null | undefined;
  patientId: string;
};

/**
 * Vitals history (BP, pulse, SpO2, temp, height, weight) behind the patient
 * Overview BMI chart — the single source of truth for a patient's vitals,
 * shared with the appointment intake form. Fetches the full history once per
 * patient and exposes `createVital` for recording a new reading.
 */
export function usePatientVitals({
  apiSession,
  patientId,
}: UsePatientVitalsParams) {
  const [vitals, setVitals] = useState<any[]>([]);
  const [vitalsLoading, setVitalsLoading] = useState(false);
  const [savingVital, setSavingVital] = useState(false);

  const refetchVitals = useCallback(async () => {
    if (!apiSession || !patientId) return;
    setVitalsLoading(true);
    try {
      const rows = await patientsApi.fetchPatientVitals(apiSession, patientId);
      setVitals(Array.isArray(rows) ? rows : []);
    } catch {
      setVitals([]);
    } finally {
      setVitalsLoading(false);
    }
  }, [apiSession, patientId]);

  useEffect(() => {
    refetchVitals();
  }, [refetchVitals]);

  async function createVital(payload: {
    heightCm: number;
    weightKg: number;
    bp?: string;
    pulseBpm?: number;
    spo2Percent?: number;
    temperatureF?: number;
    recordedAt?: string;
    notes?: string;
  }) {
    if (!apiSession || !patientId) return false;
    setSavingVital(true);
    try {
      await patientsApi.createPatientVital(apiSession, patientId, {
        height_cm: payload.heightCm,
        weight_kg: payload.weightKg,
        bp: payload.bp || null,
        pulse_bpm: payload.pulseBpm ?? null,
        spo2_percent: payload.spo2Percent ?? null,
        temperature_f: payload.temperatureF ?? null,
        recorded_at: payload.recordedAt || undefined,
        notes: payload.notes || null,
      });
      await refetchVitals();
      return true;
    } catch {
      return false;
    } finally {
      setSavingVital(false);
    }
  }

  // Only readings that carry both height & weight can plot a BMI point — a
  // patient may otherwise have vitals rows (e.g. a BP-only appointment
  // intake) that don't unlock the BMI graph yet.
  const bmiReadings = useMemo(
    () =>
      vitals
        .filter((vital: any) => vital.height_cm && vital.weight_kg)
        .map((vital: any) => ({
          date: String(vital.recorded_at).slice(0, 10),
          heightCm: Number(vital.height_cm),
          weightKg: Number(vital.weight_kg),
        })),
    [vitals],
  );

  return {
    vitals,
    vitalsLoading,
    savingVital,
    refetchVitals,
    createVital,
    bmiReadings,
  };
}
