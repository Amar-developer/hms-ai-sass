"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as consulationApi from "./consulation.api";

const EMPTY_MEDICINE_CATALOG: any[] = [];

type UseConsultationDataParams = {
  apiSession: ApiSession | null | undefined;
  branchId?: string;
  departmentId?: string;
  doctorScopePractitionerId?: string;
};

/**
 * Owns the read-only lookups the doctor dashboard needs: the scoped
 * practitioner list, clinical note templates, and the medicine/lab
 * catalogs used to seed prescription suggestions.
 */
export function useConsultationData({
  apiSession,
  branchId,
  departmentId,
  doctorScopePractitionerId,
}: UseConsultationDataParams) {
  const [scopedPractitioners, setScopedPractitioners] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [labCatalog, setLabCatalog] = useState<any[]>([]);

  useEffect(() => {
    if (!apiSession?.tenantId) return;
    if (doctorScopePractitionerId) {
      setScopedPractitioners([]);
      return;
    }
    let alive = true;
    consulationApi
      .listPractitioners(apiSession, { branchId, departmentId })
      .then((rows: any) => {
        if (alive) setScopedPractitioners(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (alive) setScopedPractitioners([]);
      });
    return () => {
      alive = false;
    };
  }, [apiSession?.tenantId, branchId, departmentId, doctorScopePractitionerId]);

  useEffect(() => {
    if (!apiSession) {
      setTemplates([]);
      return;
    }
    let alive = true;
    consulationApi
      .listClinicalTemplates(apiSession, departmentId)
      .then((rows: any) => {
        if (alive) setTemplates(rows);
      })
      .catch(() => {
        if (alive) setTemplates([]);
      });
    return () => {
      alive = false;
    };
  }, [apiSession?.tenantId, departmentId]);

  useEffect(() => {
    if (!apiSession) return;
    let alive = true;
    consulationApi
      .listAvailableLabTests(apiSession, { branchId })
      .then((tests) => {
        if (alive) setLabCatalog(Array.isArray(tests) ? tests : []);
      })
      .catch(() => {
        if (alive) setLabCatalog([]);
      });
    return () => {
      alive = false;
    };
  }, [apiSession?.tenantId, branchId]);

  // Medicine suggestions are supplied by prescription history. The full
  // external catalog is queried by ConsultationWorkspace only after the
  // doctor types at least two characters.
  return {
    scopedPractitioners,
    templates,
    medicineCatalog: EMPTY_MEDICINE_CATALOG,
    labCatalog,
  };
}

/**
 * Resolves the consultation record for the selected appointment — by id
 * when it's already known, otherwise by looking it up from the
 * appointment id first. Returns null when there's nothing saved yet.
 */
export async function fetchConsultationDetail(
  apiSession: ApiSession,
  appointmentId: string,
  consultationId?: string,
) {
  let resolvedId = consultationId || "";
  if (!resolvedId) {
    const rows = await consulationApi.findConsultationByAppointment(
      apiSession,
      appointmentId,
    );
    resolvedId = (rows as any)?.[0]?.id || "";
  }
  if (!resolvedId) return null;
  return consulationApi.getConsultation(apiSession, resolvedId);
}

export function fetchPatientDetail(apiSession: ApiSession, patientId: string) {
  return consulationApi.getPatient(apiSession, patientId);
}
