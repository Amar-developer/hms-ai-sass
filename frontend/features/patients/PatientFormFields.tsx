"use client";

import { useEffect, useState } from "react";
import {
  Field,
  Input,
  SearchableSelect,
} from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { BranchOption, calculateAgeYears,
  patientDateInputValue,
  patientField,
  todayInputValue, } from "./helpers";
import { bloodGroups,genders } from "./constants";



export function PatientFormFields({
  patient,
  branches,
  defaultBranchId,
  includeStatus = false,
}: {
  patient?: any;
  branches: BranchOption[];
  defaultBranchId?: string;
  includeStatus?: boolean;
}) {
  const today = todayInputValue();
  const [selectedBranchId, setSelectedBranchId] = useState(
    patientField(patient, "branch_id", "branchId") || defaultBranchId || "",
  );
  const [dateOfBirth, setDateOfBirth] = useState(
    patientDateInputValue(
      patientField(patient, "date_of_birth", "dateOfBirth"),
    ),
  );
  const [ageYears, setAgeYears] = useState(() => {
    const birthDate = patientDateInputValue(
      patientField(patient, "date_of_birth", "dateOfBirth"),
    );
    return birthDate
      ? calculateAgeYears(birthDate)
      : String(patientField(patient, "age_years", "ageYears") || "");
  });
  const [status, setStatus] = useState(patient?.status || "active");
  const [mobile, setMobile] = useState(patientField(patient, "mobile") || "");
  const [gender, setGender] = useState(patientField(patient, "gender") || "");

  const [bloodGroup, setBloodGroup] = useState(
    patientField(patient, "blood_group", "bloodGroup") || "",
  );
  const branchOptions = [...branches];
  if (
    selectedBranchId &&
    !branchOptions.some((branch) => branch.id === selectedBranchId)
  ) {
    branchOptions.unshift({ id: selectedBranchId, name: "Selected branch" });
  }
  useEffect(() => {
    setSelectedBranchId(
      patientField(patient, "branch_id", "branchId") || defaultBranchId || "",
    );
    setDateOfBirth(
      patientDateInputValue(
        patientField(patient, "date_of_birth", "dateOfBirth"),
      ),
    );
    const birthDate = patientDateInputValue(
      patientField(patient, "date_of_birth", "dateOfBirth"),
    );
    setAgeYears(
      birthDate
        ? calculateAgeYears(birthDate)
        : String(patientField(patient, "age_years", "ageYears") || ""),
    );
    setStatus(patient?.status || "active");
    setGender(patientField(patient, "gender") || "");
    setBloodGroup(patientField(patient, "blood_group", "bloodGroup") || "");
  }, [patient?.id, patient?.updated_at, defaultBranchId]);
  useEffect(() => {
    if (selectedBranchId || !branchOptions.length) return;
    const nextBranchId =
      (defaultBranchId &&
        branchOptions.some((branch) => branch.id === defaultBranchId) &&
        defaultBranchId) ||
      branchOptions[0]?.id ||
      "";
    if (nextBranchId) setSelectedBranchId(nextBranchId);
  }, [branchOptions, defaultBranchId, selectedBranchId]);

  return (
    <>
      <Field label="Full Name">
        <Input
          name="fullName"
          defaultValue={patientField(patient, "full_name", "fullName")}
          required
          placeholder="Enter patient full name"
        />
      </Field>
      <Field label="Mobile Number">
        <Input
          name="mobile"
          mobileNumber
          value={mobile}
          onChange={(e: any) => setMobile(e.target.value)}
          placeholder="Enter patient mobile number"

        />
      </Field>
      <FormField label="Branch">
        <SearchableSelect
          name="branchId"
          value={selectedBranchId}
          onChange={setSelectedBranchId}
          searchable={branchOptions.length > 8}
          placeholder="Select branch"
          options={
            branchOptions.length === 0
              ? [{ value: "", label: "No branches available" }]
              : branchOptions.map((branch) => ({
                  value: branch.id,
                  label: branch.name,
                }))
          }
        />
      </FormField>
      <FormField label="Gender">
        <SearchableSelect
          name="gender"
          value={gender}
          searchable={false}
          options={genders.map(([value, label]) => ({
            value,
            label,
          }))}
          onChange={setGender}
        />
      </FormField>
      <Field label="Date of Birth">
        <Input
          name="dateOfBirth"
          type="date"
          max={today}
          value={dateOfBirth}
          onChange={(event: any) => {
            const nextDate = event.target.value;
            setDateOfBirth(nextDate);
            setAgeYears(nextDate ? calculateAgeYears(nextDate) : "");
          }}
          //
        />
      </Field>
      <Field label="Age Years">
        <Input
          name="ageYears"
          type="number"
          min="0"
          max="130"
          value={ageYears}
          onChange={(event: any) => setAgeYears(event.target.value)}
          placeholder="Age"
        />
      </Field>
      <Field label="Secondary Mobile Number">
        <Input
          name="alternateMobile"
          inputMode="numeric"
          maxLength={10}
          defaultValue={patientField(
            patient,
            "alternate_mobile",
            "alternateMobile",
          )}
          placeholder="Enter secondary patient mobile number"

        />
      </Field>
      <Field label="Email">
        <Input
          name="email"
          type="email"
          defaultValue={patientField(patient, "email")}
          placeholder="Enter patient email"
        />
      </Field>
      <Field label="Area">
        <Input
          name="area"
          defaultValue={patientField(patient, "area")}
          placeholder="Enter patient area"
        />
      </Field>
      <Field label="Blood Group">
        <SearchableSelect
          name="bloodGroup"
          value={bloodGroup}
          searchable={false}
          options={bloodGroups.map(([value, label]) => ({
            value,
            label,
          }))}
          onChange={setBloodGroup}
        />
      </Field>
      {includeStatus && (
        <Field label="Status">
          <SearchableSelect
            name="status"
            value={status}
            onChange={setStatus}
            searchable={false}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
              { value: "deceased", label: "Deceased" },
            ]}
          />
        </Field>
      )}
      <div className="md:col-span-2 xl:col-span-3">
        <Field label="Address">
          <Input
            name="address"
            defaultValue={patientField(patient, "address")}
            placeholder="Enter patient Address"
          />
        </Field>
      </div>
    </>
  );
}
