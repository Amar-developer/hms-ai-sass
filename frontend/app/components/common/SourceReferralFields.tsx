"use client";

import { useMemo } from "react";

import { SearchPicker } from "@/app/components/clinicalRows";
import { FormField } from "@/app/components/FormElements";
import { SearchableSelect } from "@/app/components/common/ui";
import { usePatientSearch } from "@/features/patients/components/PatientSearchSelect";
import {
  patientDisplayMobile,
  patientDisplayName,
  patientDisplayNumber,
  patientPickerLabel,
} from "@/features/patients/helpers";
import type { ApiSession } from "@/lib/api";
import {
  patientFlagBadgeData,
  patientValueTierFlags,
} from "@/features/patients/components/PatientFlagBadges";

export const ACQUISITION_SOURCE_OPTIONS = [
  { value: "direct", label: "Direct" },
  { value: "referral", label: "Referral" },
  { value: "google", label: "Google" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "website", label: "Website" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "ads", label: "Ads" },
  { value: "campaign", label: "Campaign" },
  { value: "other", label: "Other" },
] as const;

type SourceReferralFieldsProps = {
  apiSession: ApiSession | null;
  patients?: any[];
  source: string;
  onSourceChange: (value: string) => void;
  referrerName: string;
  referrerPatientId: string;
  onReferrerChange: (name: string, patientId: string) => void;
  sourceError?: string;
  referrerError?: string;
};

export function SourceReferralFields({
  apiSession,
  patients = [],
  source,
  onSourceChange,
  referrerName,
  referrerPatientId,
  onReferrerChange,
  sourceError,
  referrerError,
}: SourceReferralFieldsProps) {
  const { patients: searchResults, loading } = usePatientSearch({
    apiSession,
    query: referrerName,
    selectedPatientId: referrerPatientId,
    initialPatients: patients,
  });
  const patientOptions = useMemo(() => {
    const rows = new Map<string, any>();
    [...patients, ...searchResults].forEach((patient: any) => {
      if (patient?.id) rows.set(String(patient.id), patient);
    });
    return [...rows.values()].map((patient: any) => ({
      value: String(patient.id),
      label: patientPickerLabel(patient),
      item: patient,
      badges: patientValueTierFlags(patient.intelligence_flags).map(
        patientFlagBadgeData,
      ),
    }));
  }, [patients, searchResults]);

  return (
    <>
      <FormField label="Source" required error={sourceError}>
        <SearchableSelect
          required
          searchable={false}
          value={source}
          onChange={(nextSource: string) => {
            onSourceChange(nextSource);
            if (nextSource !== "referral") onReferrerChange("", "");
          }}
          options={[...ACQUISITION_SOURCE_OPTIONS]}
        />
      </FormField>

      {source === "referral" && (
        <FormField label="Referrer Name" required error={referrerError}>
          <SearchPicker
            value={referrerPatientId}
            inputValue={referrerName}
            onInputValueChange={(name: string) => onReferrerChange(name, "")}
            onChange={(patientId: string, patient: any) =>
              onReferrerChange(patientDisplayName(patient), patientId)
            }
            updateInputOnSelect={false}
            onUseTyped={(name: string) => onReferrerChange(name, "")}
            options={patientOptions}
            loading={loading}
            placeholder="Search patient or enter a new name"
            getSearchText={(patient: any) =>
              [
                patientDisplayName(patient),
                patientDisplayNumber(patient),
                patientDisplayMobile(patient),
              ]
                .filter(Boolean)
                .join(" ")
            }
          />
        </FormField>
      )}
    </>
  );
}
