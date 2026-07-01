"use client";

import { useEffect, useState } from "react";
import { Field, Input, Select } from "@/app/components/common/ui";
import {
  calculateAgeYears,
  patientDateInputValue,
} from "@/utils/patient/helpers";

type BranchOption = {
  id: string;
  name: string;
};

export type PatientFormPayload = {
  branchId: string;
  fullName: string;
  mobile: string;
  alternateMobile: string;
  email: string;
  gender: string;
  dateOfBirth: string;
  ageYears: string;
  guardianName: string;
  guardianMobile: string;
  area: string;
  address: string;
  bloodGroup: string;
  status: string;
};

const genders = [
  ["", "Select gender"],
  ["male", "Male"],
  ["female", "Female"],
  ["other", "Other"],
  ["unknown", "Unknown"],
] as const;

const bloodGroups = [
  ["", "Select blood group"],
  ["A+", "A+"],
  ["A-", "A-"],
  ["B+", "B+"],
  ["B-", "B-"],
  ["AB+", "AB+"],
  ["AB-", "AB-"],
  ["O+", "O+"],
  ["O-", "O-"],
] as const;

function formValue(fd: FormData, key: string) {
  return String(fd.get(key) || "").trim();
}

export function patientFormPayload(fd: FormData): PatientFormPayload {
  return {
    branchId: formValue(fd, "branchId"),
    fullName: formValue(fd, "fullName"),
    mobile: formValue(fd, "mobile"),
    alternateMobile: formValue(fd, "alternateMobile"),
    email: formValue(fd, "email"),
    gender: formValue(fd, "gender") || "unknown",
    dateOfBirth: formValue(fd, "dateOfBirth"),
    ageYears: formValue(fd, "ageYears"),
    guardianName: formValue(fd, "guardianName"),
    guardianMobile: formValue(fd, "guardianMobile"),
    area: formValue(fd, "area"),
    address: formValue(fd, "address"),
    bloodGroup: formValue(fd, "bloodGroup"),
    status: formValue(fd, "status") || "active",
  };
}

function patientField(patient: any, snakeKey: string, camelKey?: string) {
  return patient?.[snakeKey] ?? patient?.[camelKey || snakeKey] ?? "";
}

function todayInputValue() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}

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
          className="search-input"
        />
      </Field>
      <Field label="Mobile">
        <Input
          name="mobile"
          mobileNumber
          value={mobile}
          onChange={(e: any) => setMobile(e.target.value)}
          placeholder="Enter patient mobile number"
          className="search-input"
        />
      </Field>
      <Field label="Branch">
        <Select
          name="branchId"
          value={selectedBranchId}
          onChange={(event: any) => setSelectedBranchId(event.target.value)}
          className="select-input"
        >
          {branchOptions.length === 0 && (
            <option value="">No branches available</option>
          )}
          {branchOptions.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Gender">
        <Select
          name="gender"
          defaultValue={patientField(patient, "gender")}
          className="select-input"
        >
          {genders.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
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
          className='search-input'
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
          placeholder='Age'
          className='search-input'
        />
      </Field>
      <Field label="Guardian Name">
        <Input
          name="guardianName"
          defaultValue={patientField(patient, "guardian_name", "guardianName")}
          placeholder="Enter guardian name"
          className='search-input'
        />
      </Field>
      <Field label="Guardian Mobile">
        <Input
          name="guardianMobile"
          defaultValue={patientField(
            patient,
            "guardian_mobile",
            "guardianMobile",
          )}
          placeholder="Enter guardian mobile"
          className='search-input'
        />
      </Field>
      <Field label="Alternate Mobile">
        <Input
          name="alternateMobile"
          defaultValue={patientField(
            patient,
            "alternate_mobile",
            "alternateMobile",
          )}
          placeholder="Enter guardian mobile number"
          className='search-input'
        />
      </Field>
      <Field label="Email">
        <Input
          name="email"
          type="email"
          defaultValue={patientField(patient, "email")}
          placeholder="Enter patient email"
          className='search-input'
        />
      </Field>
      <Field label="Area">
        <Input
          name="area"
          defaultValue={patientField(patient, "area")}
          placeholder="Enter patient area"
          className='search-input'
        />
      </Field>
      <Field label="Blood Group">
        <Select
          name="bloodGroup"
          defaultValue={patientField(patient, "blood_group", "bloodGroup")}
        >
          {bloodGroups.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      {includeStatus && (
        <Field label="Status">
          <Select
            name="status"
            value={status}
            onChange={(event: any) => setStatus(event.target.value)}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="deceased">Deceased</option>
          </Select>
        </Field>
      )}
      <div className="md:col-span-2 xl:col-span-3">
        <Field label="Address">
          <Input
            name="address"
            defaultValue={patientField(patient, "address")}
            placeholder="Enter patient Address"
            className='search-input'
          />
        </Field>
      </div>
    </>
  );
}
