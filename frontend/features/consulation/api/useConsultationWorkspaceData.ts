"use client";

import { useEffect, useRef, useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as consulationApi from "./consulation.api";

const EMPTY_CATALOG: any[] = [];

function stableCatalog(value: any[]) {
  return Array.isArray(value) && value.length ? value : EMPTY_CATALOG;
}

function catalogSignature(value: any[]) {
  if (!Array.isArray(value) || value.length === 0) return "";
  return value
    .map((row: any) =>
      [
        row?.id,
        row?.slug,
        row?.item_name,
        row?.name,
        row?.strength,
        row?.code,
      ]
        .filter(Boolean)
        .join(":"),
    )
    .join("|");
}

type UseConsultationWorkspaceDataParams = {
  apiSession: ApiSession | null | undefined;
  patient: any;
  branchId?: string;
  medicineCatalog: any[];
  labCatalog: any[];
  medicineSearch: string;
  labSearch: string;
};

/**
 * Owns the consultation workspace's own data needs, separate from the
 * dashboard-level catalogs it's seeded with: live medicine/lab search as
 * the doctor types and the patient's
 * printable ID number when the parent hasn't loaded it yet.
 */
export function useConsultationWorkspaceData({
  apiSession,
  patient,
  branchId,
  medicineCatalog,
  labCatalog,
  medicineSearch,
  labSearch,
}: UseConsultationWorkspaceDataParams) {
  const apiSessionRef = useRef(apiSession);
  apiSessionRef.current = apiSession;
  const tenantId = apiSession?.tenantId;
  const accessToken = apiSession?.accessToken;
  const medicineCatalogSignature = catalogSignature(medicineCatalog);
  const labCatalogSignature = catalogSignature(labCatalog);
  const [availableMedicineCatalog, setAvailableMedicineCatalog] = useState<
    any[]
  >(stableCatalog(medicineCatalog));
  const [medicineCatalogLoading, setMedicineCatalogLoading] = useState(false);
  const [medicineCatalogError, setMedicineCatalogError] = useState("");
  const [availableLabCatalog, setAvailableLabCatalog] = useState<any[]>(
    stableCatalog(labCatalog),
  );
  const [externalLabLoading, setExternalLabLoading] = useState(false);
  const [externalLabError, setExternalLabError] = useState("");
  const [patientNumberFallback, setPatientNumberFallback] = useState("");

  useEffect(() => {
    setAvailableMedicineCatalog(stableCatalog(medicineCatalog));
  }, [medicineCatalogSignature]);

  useEffect(() => {
    setAvailableLabCatalog(stableCatalog(labCatalog));
  }, [labCatalogSignature]);

  useEffect(() => {
    setPatientNumberFallback("");
    const session = apiSessionRef.current;
    if (!session || !patient?.id || patient?.patient_number) return;
    let alive = true;
    consulationApi
      .getPatient(session, patient.id)
      .then((detail: any) => {
        if (alive) setPatientNumberFallback(detail?.patient_number || "");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [patient?.id, patient?.patient_number, tenantId, accessToken]);

  useEffect(() => {
    const session = apiSessionRef.current;
    if (!session?.tenantId) {
      setAvailableMedicineCatalog([]);
      return;
    }
    const search = medicineSearch.trim();
    if (search.length < 2) {
      setAvailableMedicineCatalog(stableCatalog(medicineCatalog));
      setMedicineCatalogLoading(false);
      setMedicineCatalogError("");
      return;
    }
    let alive = true;
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        setMedicineCatalogLoading(true);
        setMedicineCatalogError("");
        try {
          const rows = await consulationApi.listAvailableMedicines(
            session,
            search,
            controller.signal,
          );
          if (alive)
            setAvailableMedicineCatalog(Array.isArray(rows) ? rows : []);
        } catch (err: any) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          if (alive) {
            setAvailableMedicineCatalog([]);
            setMedicineCatalogError(
              err?.message || "Could not load medicine catalog.",
            );
          }
        } finally {
          if (alive) setMedicineCatalogLoading(false);
        }
      },
      250,
    );
    return () => {
      alive = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [tenantId, accessToken, medicineSearch, medicineCatalogSignature]);

  useEffect(() => {
    const session = apiSessionRef.current;
    if (!session?.tenantId) {
      setAvailableLabCatalog([]);
      return;
    }
    let alive = true;
    const search = labSearch.trim();
    const timer = window.setTimeout(
      async () => {
        setExternalLabLoading(true);
        setExternalLabError("");
        try {
          const rows = await consulationApi.listAvailableLabTests(session, {
            branchId,
            search: search || undefined,
          });
          if (alive) setAvailableLabCatalog(Array.isArray(rows) ? rows : []);
        } catch (err: any) {
          if (alive) {
            setAvailableLabCatalog([]);
            setExternalLabError(
              err?.message || "Could not load the available lab tests.",
            );
          }
        } finally {
          if (alive) setExternalLabLoading(false);
        }
      },
      search ? 250 : 0,
    );
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [tenantId, accessToken, branchId, labSearch, labCatalogSignature]);

  return {
    availableMedicineCatalog,
    medicineCatalogLoading,
    medicineCatalogError,
    availableLabCatalog,
    externalLabLoading,
    externalLabError,
    patientNumberFallback,
  };
}
