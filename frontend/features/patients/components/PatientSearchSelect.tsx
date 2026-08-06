"use client";

import { useEffect, useMemo, useState } from "react";

import { SearchableSelect } from "@/app/components/common/ui";
import {
  LIVE_DATA_CHANGED_EVENT,
  apiFetch,
  type ApiSession,
} from "@/lib/api";
import {
  isActivePatientRecord,
  patientDisplayMobile,
  patientDisplayName,
  patientDisplayNumber,
} from "@/features/patients/helpers";
import { searchPatients } from "@/lib/hmsLogic";
import type { PatientReference } from "@/lib/contracts";
import { mapWithConcurrency } from "@/lib/concurrency";

const MIN_QUERY_LENGTH = 2;
const SEARCH_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 300;
const CACHE_TTL_MS = 30_000;
const EMPTY_PATIENTS: PatientReference[] = [];

type CachedSearch = { expiresAt: number; rows: PatientReference[] };
const searchCache = new Map<string, CachedSearch>();

function cacheKey(
  tenantId: string,
  userId: string,
  query: string,
  activeOnly: boolean,
) {
  return `${tenantId}:${userId}:${activeOnly ? "active" : "all"}:${query
    .trim()
    .toLocaleLowerCase()}`;
}

function clearTenantPatientSearchCache(tenantId: string) {
  for (const key of searchCache.keys()) {
    if (key.startsWith(`${tenantId}:`)) searchCache.delete(key);
  }
}

function patientOption(patient: PatientReference) {
  const number = patientDisplayNumber(patient);
  const mobile = patientDisplayMobile(patient);
  return {
    value: String(patient.id),
    label: patientDisplayName(patient) || number || "Patient",
    sublabel: [number, mobile].filter(Boolean).join(" · "),
  };
}

function mergePatients(...groups: PatientReference[][]) {
  const rows = new Map<string, PatientReference>();
  groups.flat().forEach((patient) => {
    if (patient?.id) rows.set(String(patient.id), patient);
  });
  return [...rows.values()];
}

export async function fetchPatientReferences(
  apiSession: ApiSession,
  patientIds: Array<string | null | undefined>,
): Promise<PatientReference[]> {
  const ids = [...new Set(patientIds.filter(Boolean).map(String))];
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += 100) {
    chunks.push(ids.slice(index, index + 100));
  }
  const responses = await mapWithConcurrency(
    chunks,
    (chunk) => {
      const params = new URLSearchParams();
      chunk.forEach((id) => params.append("ids", id));
      return apiFetch<PatientReference[]>(
        `/patients/references?${params}`,
        apiSession,
      );
    },
    4,
  );
  return mergePatients(
    ...responses.map((rows) => (Array.isArray(rows) ? rows : [])),
  );
}

export function usePatientSearch({
  apiSession,
  query,
  selectedPatientId = "",
  initialPatients = EMPTY_PATIENTS,
  activeOnly = true,
}: {
  apiSession: ApiSession | null;
  query: string;
  selectedPatientId?: string;
  initialPatients?: PatientReference[];
  activeOnly?: boolean;
}) {
  const [results, setResults] = useState<PatientReference[]>([]);
  const [selectedPatient, setSelectedPatient] =
    useState<PatientReference | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const normalizedQuery = query.trim();

  useEffect(() => {
    if (!apiSession?.tenantId) return;
    const tenantId = apiSession.tenantId;
    const handlePatientChange = (event: Event) => {
      const detail = (event as CustomEvent<{ tenantId?: string; path?: string }>)
        .detail;
      if (detail?.tenantId && detail.tenantId !== tenantId) return;
      if (!String(detail?.path || "").startsWith("/patients")) return;
      clearTenantPatientSearchCache(tenantId);
      setRevision((current) => current + 1);
    };
    window.addEventListener(LIVE_DATA_CHANGED_EVENT, handlePatientChange);
    return () =>
      window.removeEventListener(LIVE_DATA_CHANGED_EVENT, handlePatientChange);
  }, [apiSession?.tenantId]);

  useEffect(() => {
    const localPatient = initialPatients.find(
      (patient) => String(patient?.id) === String(selectedPatientId),
    );
    if (localPatient) {
      setSelectedPatient(localPatient);
      return;
    }
    const resultPatient = results.find(
      (patient) => String(patient?.id) === String(selectedPatientId),
    );
    if (resultPatient) {
      setSelectedPatient(resultPatient);
      return;
    }
    if (!apiSession || !selectedPatientId) {
      setSelectedPatient(null);
      return;
    }

    const controller = new AbortController();
    apiFetch<PatientReference>(
      `/patients/${encodeURIComponent(selectedPatientId)}`,
      apiSession,
      { signal: controller.signal },
    )
      .then(setSelectedPatient)
      .catch((error) => {
        if (error?.name !== "AbortError") setSelectedPatient(null);
      });
    return () => controller.abort();
  }, [
    apiSession?.tenantId,
    initialPatients,
    results,
    selectedPatientId,
    revision,
  ]);

  useEffect(() => {
    if (normalizedQuery.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      setFailed(false);
      return;
    }
    if (!apiSession) {
      setResults(
        searchPatients(initialPatients, normalizedQuery).slice(0, SEARCH_LIMIT),
      );
      setLoading(false);
      setFailed(false);
      return;
    }

    const key = cacheKey(
      apiSession.tenantId,
      String(apiSession.user?.id || apiSession.email),
      normalizedQuery,
      activeOnly,
    );
    const cached = searchCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      setResults(cached.rows);
      setLoading(false);
      setFailed(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const params = new URLSearchParams({
          q: normalizedQuery,
          active_only: String(activeOnly),
          limit: String(SEARCH_LIMIT),
        });
        const response = await apiFetch<PatientReference[]>(
          `/patients?${params}`,
          apiSession,
          { signal: controller.signal },
        );
        const rows = Array.isArray(response) ? response : [];
        searchCache.set(key, {
          rows,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
        setResults(rows);
      } catch (error: any) {
        if (error?.name !== "AbortError") {
          setResults([]);
          setFailed(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    activeOnly,
    apiSession?.email,
    apiSession?.tenantId,
    initialPatients,
    normalizedQuery,
    revision,
  ]);

  const patients = useMemo(() => {
    const selected = selectedPatient ? [selectedPatient] : [];
    const searchableRows = activeOnly
      ? results.filter(isActivePatientRecord)
      : results;
    return mergePatients(selected, searchableRows);
  }, [activeOnly, results, selectedPatient]);

  return { patients, selectedPatient, loading, failed };
}

export function PatientSearchSelect({
  apiSession,
  value = "",
  onChange,
  onPatientSelect,
  initialPatients = EMPTY_PATIENTS,
  activeOnly = true,
  name,
  placeholder = "Select patient",
  searchPlaceholder = "Search name, patient ID, or mobile",
  disabled = false,
  required = false,
  error,
  className = "",
}: {
  apiSession: ApiSession | null;
  value?: string;
  onChange: (patientId: string) => void;
  onPatientSelect?: (patient: PatientReference | null) => void;
  initialPatients?: PatientReference[];
  activeOnly?: boolean;
  name?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const { patients, loading, failed } = usePatientSearch({
    apiSession,
    query,
    selectedPatientId: value,
    initialPatients,
    activeOnly,
  });
  const options = useMemo(() => patients.map(patientOption), [patients]);

  function select(nextValue: string) {
    onChange(nextValue);
    onPatientSelect?.(
      patients.find((patient) => String(patient.id) === nextValue) || null,
    );
    setQuery("");
  }

  const emptyText = failed
    ? "Patient search failed. Try again."
    : query.trim().length < MIN_QUERY_LENGTH
      ? "Enter at least 2 characters."
      : "No active patient found.";

  return (
    <>
      <SearchableSelect
        value={value}
        onChange={select}
        options={options}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        emptyText={emptyText}
        maxOptions={SEARCH_LIMIT}
        disabled={disabled || !apiSession}
        required={required}
        error={error}
        loading={loading}
        onSearchChange={setQuery}
        className={className}
      />
      {name && <input type="hidden" name={name} value={value} />}
    </>
  );
}
