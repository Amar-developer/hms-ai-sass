"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { Button, Input } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import {
  PatientFormFields,
  patientFormPayload,
} from "@/features/patients/PatientFormFields";
import { searchPatients } from "@/lib/hmsLogic";
import {
  isActivePatientRecord,
  patientDisplayMobile,
  patientDisplayName,
  patientDisplayNumber,
} from "@/utils/patient/helpers";

export function patientLookupLabel(patient: any) {
  if (!patient) return "";
  return [patientDisplayName(patient), patientDisplayNumber(patient), patientDisplayMobile(patient)]
    .filter(Boolean)
    .join(" · ");
}

export function NewPatientForm({
  busy,
  branches,
  defaultBranchId,
  searchValue,
  onSave,
  onCancel,
  submitLabel = "Save Patient",
  description = "Save this record to select the patient and continue.",
}: any) {
  const normalizedSearch = String(searchValue || "").trim();
  const patientDefaults = normalizedSearch
    ? /^[+\d][\d\s()-]*$/.test(normalizedSearch)
      ? { mobile: normalizedSearch }
      : { full_name: normalizedSearch }
    : undefined;

  function handleSubmit(e: any) {
    e.preventDefault();
    onSave(patientFormPayload(new FormData(e.currentTarget)));
  }

  return (
    <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/40 p-4">
      <div className="flex justify-between gap-3">
        <div>
          <h4 className="font-bold">Create New Patient</h4>
          <p className="mt-1 table-data text-slate-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border p-2"
          title="Cancel"
        >
          <X size={16} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 md:grid-cols-3">
        <PatientFormFields
          patient={patientDefaults}
          branches={branches || []}
          defaultBranchId={defaultBranchId}
        />
        <div className="flex flex-wrap gap-2 md:col-span-3">
          <Button disabled={busy}>{busy ? "Saving..." : submitLabel}</Button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border px-2 py-2 text-xs font-bold lg:px-4 lg:py-3 lg:text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export function PatientLookupField({
  label = "Patient",
  patients,
  searchValue,
  onSearchChange,
  selectedPatient,
  onSelect,
  onClear,
  onCreatePatient,
  branches,
  defaultBranchId,
  busy,
  required = false,
  placeholder = "Search patient name, mobile, or patient ID",
  createDescription,
}: any) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const query = String(searchValue || "").trim();
  const matches = useMemo(() => {
    if (!query || selectedPatient) return [];
    return searchPatients(patients || [], query).filter(isActivePatientRecord).slice(0, 8);
  }, [patients, query, selectedPatient]);

  function selectPatient(patient: any) {
    onSelect(patient);
    setCreating(false);
    setOpen(false);
  }

  async function savePatient(data: any) {
    const saved = await onCreatePatient(data);
    if (saved) {
      selectPatient(saved);
      onSearchChange("");
    }
  }

  return (
    <div>
      <FormField label={label} required={required}>
        {selectedPatient ? (
          <div className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span>
              <b className="block text-xs text-slate-900">
                {patientDisplayName(selectedPatient)}
              </b>
              <span className="text-xs text-slate-500">
                {patientDisplayNumber(selectedPatient)
                  ? `${patientDisplayNumber(selectedPatient)} · `
                  : ""}
                {patientDisplayMobile(selectedPatient)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                onClear?.();
                setCreating(false);
                setOpen(false);
              }}
              className="text-xs font-bold text-blue-700"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400"
              size={17}
            />
            <Input
              value={searchValue}
              onFocus={() => setOpen(true)}
              onChange={(event: any) => {
                onSearchChange(event.target.value);
                setOpen(true);
                setCreating(false);
              }}
              onKeyDown={(event: any) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setOpen(false);
                }
              }}
              placeholder={placeholder}
              autoComplete="off"
              required={required}
              className="rounded-lg py-3 pl-10 pr-10 text-xs"
            />
            {searchValue && (
              <button
                type="button"
                onClick={() => {
                  onSearchChange("");
                  setCreating(false);
                }}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                aria-label="Clear patient search"
              >
                <X size={16} />
              </button>
            )}
            {open && query && !creating && (
              <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
                {query.length < 2 && (
                  <p className="px-3 py-3 text-xs text-slate-500">
                    Enter at least 2 characters to search.
                  </p>
                )}
                {query.length >= 2 &&
                  matches.map((patient: any) => (
                    <button
                      key={patient.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectPatient(patient)}
                      className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-3 text-left hover:bg-slate-50"
                    >
                      <span>
                        <b className="block text-xs text-slate-900">
                          {patientDisplayName(patient)}
                        </b>
                        <span className="text-xs text-slate-500">
                          {patientDisplayNumber(patient)
                            ? `${patientDisplayNumber(patient)} · `
                            : ""}
                          {patientDisplayMobile(patient)}
                        </span>
                      </span>
                      <span className="text-xs font-bold text-blue-600">
                        Select
                      </span>
                    </button>
                  ))}
                {query.length >= 2 && matches.length === 0 && (
                  <p className="px-3 py-2 table-data text-slate-500">
                    No active patient found.
                  </p>
                )}
                {query.length >= 2 && (
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setOpen(false);
                      setCreating(true);
                    }}
                    className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-3 text-left text-xs font-bold text-blue-700 hover:bg-blue-50"
                  >
                    <span className="text-lg leading-none">+</span>
                    Create a new Patient
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </FormField>
      {creating && !selectedPatient && (
        <NewPatientForm
          busy={busy}
          branches={branches}
          defaultBranchId={defaultBranchId}
          searchValue={searchValue}
          onSave={savePatient}
          onCancel={() => setCreating(false)}
          description={createDescription}
        />
      )}
    </div>
  );
}
