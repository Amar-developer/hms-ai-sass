"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as physiotherapyApi from "./physiotherapy.api";

type UsePhysiotherapyDataParams = {
  apiSession: ApiSession | null | undefined;
};

/**
 * Owns the tenant-scoped physiotherapy lookups: cases, the equipment
 * master, physiotherapist practitioners, and the doctor-fee rules used to
 * default a session's charge. Exposes `loadPhysio` so callers can refresh
 * (or overwrite `setCases` locally, e.g. after a consent upload).
 */
export function usePhysiotherapyData({ apiSession }: UsePhysiotherapyDataParams) {
  const [cases, setCases] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [practitioners, setPractitioners] = useState<any[]>([]);
  const [feeRules, setFeeRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadPhysio() {
    if (!apiSession) return;
    setError("");
    setLoading(true);
    try {
      const [caseRows, equipmentRows, practitionerRows, feeRuleRows] =
        await Promise.all([
          physiotherapyApi.listCases(apiSession),
          physiotherapyApi.listEquipment(apiSession),
          physiotherapyApi.listPractitioners(apiSession).catch(() => []),
          physiotherapyApi.listDoctorFeeRules(apiSession).catch(() => []),
        ]);
      setCases(caseRows);
      setEquipment(equipmentRows);
      setPractitioners(practitionerRows);
      setFeeRules(feeRuleRows);
    } catch (err: any) {
      setError(err.message || "Unable to load physiotherapy module.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPhysio();
  }, [apiSession?.tenantId]);

  return {
    cases,
    setCases,
    equipment,
    practitioners,
    feeRules,
    loading,
    dataError: error,
    loadPhysio,
  };
}
