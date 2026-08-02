"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as consulationApi from "./consulation.api";

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
 * the doctor types, the popular-items suggestion strip, and the patient's
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
  const [availableMedicineCatalog, setAvailableMedicineCatalog] = useState<
    any[]
  >(medicineCatalog);
  const [medicineCatalogLoading, setMedicineCatalogLoading] = useState(false);
  const [medicineCatalogError, setMedicineCatalogError] = useState("");
  const [availableLabCatalog, setAvailableLabCatalog] = useState<any[]>(
    Array.isArray(labCatalog) ? labCatalog : [],
  );
  const [externalLabLoading, setExternalLabLoading] = useState(false);
  const [externalLabError, setExternalLabError] = useState("");
  const [popularMedicines, setPopularMedicines] = useState<any[]>([]);
  const [popularLabTests, setPopularLabTests] = useState<any[]>([]);
  const [patientNumberFallback, setPatientNumberFallback] = useState("");

  useEffect(() => {
    setAvailableMedicineCatalog(
      Array.isArray(medicineCatalog) ? medicineCatalog : [],
    );
  }, [medicineCatalog]);

  useEffect(() => {
    setAvailableLabCatalog(Array.isArray(labCatalog) ? labCatalog : []);
  }, [labCatalog]);

  useEffect(() => {
    setPatientNumberFallback("");
    if (!apiSession || !patient?.id || patient?.patient_number) return;
    let alive = true;
    consulationApi
      .getPatient(apiSession, patient.id)
      .then((detail: any) => {
        if (alive) setPatientNumberFallback(detail?.patient_number || "");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [patient?.id, patient?.patient_number, apiSession?.tenantId]);

  useEffect(() => {
    if (!apiSession?.tenantId) {
      setAvailableMedicineCatalog([]);
      return;
    }
    const search = medicineSearch.trim();
    if (search.length < 2) {
      setAvailableMedicineCatalog(
        Array.isArray(medicineCatalog) ? medicineCatalog : [],
      );
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
            apiSession,
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
  }, [apiSession, apiSession?.tenantId, medicineSearch]);

  useEffect(() => {
    if (!apiSession?.tenantId) {
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
          const rows = await consulationApi.listAvailableLabTests(apiSession, {
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
  }, [apiSession, apiSession?.tenantId, branchId, labSearch]);

  useEffect(() => {
    if (!apiSession?.tenantId) {
      setPopularMedicines([]);
      setPopularLabTests([]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const [meds, labs] = await Promise.all([
          consulationApi.listPopularMedicines(apiSession).catch(() => []),
          consulationApi.listPopularLabTests(apiSession).catch(() => []),
        ]);
        if (!alive) return;
        setPopularMedicines(Array.isArray(meds) ? meds : []);
        setPopularLabTests(Array.isArray(labs) ? labs : []);
      } catch {
        if (alive) {
          setPopularMedicines([]);
          setPopularLabTests([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [apiSession, apiSession?.tenantId]);

  return {
    availableMedicineCatalog,
    medicineCatalogLoading,
    medicineCatalogError,
    availableLabCatalog,
    externalLabLoading,
    externalLabError,
    popularMedicines,
    popularLabTests,
    patientNumberFallback,
  };
}
