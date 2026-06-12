"use client";

import { useEffect, useState } from "react";
import { Field, Input, Select } from "@/components/common/ui";

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

function calculateAgeYears(dateOfBirth: string) {
  if (!dateOfBirth) return "";
  const dob = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDelta = today.getMonth() - dob.getMonth();
  if (
    monthDelta < 0 ||
    (monthDelta === 0 && today.getDate() < dob.getDate())
  ) {
    age -= 1;
  }
  return age >= 0 && age <= 130 ? String(age) : "";
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
  const [selectedBranchId, setSelectedBranchId] = useState(
    patientField(patient, "branch_id", "branchId") || defaultBranchId || "",
  );
  const [dateOfBirth, setDateOfBirth] = useState(
    patientField(patient, "date_of_birth", "dateOfBirth"),
  );
  const [status, setStatus] = useState(patient?.status || "active");
  const calculatedAge = dateOfBirth
    ? calculateAgeYears(dateOfBirth)
    : patientField(patient, "age_years", "ageYears");
  const branchOptions = [...branches];
  if (
    selectedBranchId &&
    !branchOptions.some((branch) => branch.id === selectedBranchId)
  ) {
    branchOptions.unshift({ id: selectedBranchId, name: "Selected branch" });
  }
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
          placeholder='Enter patient full name'
        />
      </Field>
      <Field label="Mobile">
        <Input name="mobile" defaultValue={patient?.mobile || ""} placeholder='Enter patient mobile number'/>
      </Field>
      <Field label="Branch">
        <Select
          name="branchId"
          value={selectedBranchId}
          onChange={(event: any) => setSelectedBranchId(event.target.value)}
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
          value={dateOfBirth}
          onChange={(event: any) => setDateOfBirth(event.target.value)}
        />
      </Field>
      <Field label="Age Years">
        <Input
          name="ageYears"
          type="number"
          min="0"
          max="130"
          value={calculatedAge}
          readOnly
        />
      </Field>
      <Field label="Guardian Name">
        <Input
          name="guardianName"
          defaultValue={patientField(patient, "guardian_name", "guardianName")}
          placeholder='Enter guardian name'
        />
      </Field>
      <Field label="Guardian Mobile">
        <Input
          name="guardianMobile"
          defaultValue={patientField(patient, "guardian_mobile", "guardianMobile")}
          placeholder='Enter guardian mobile'
        />
      </Field>
      <Field label="Alternate Mobile">
        <Input
          name="alternateMobile"
          defaultValue={patientField(patient, "alternate_mobile", "alternateMobile")}
          placeholder='Enter guardian mobile number'
        />
      </Field>
      <Field label="Email">
        <Input
          name="email"
          type="email"
          defaultValue={patientField(patient, "email")}
          placeholder='Enter patient email'
        />
      </Field>
      <Field label="Area">
        <Input name="area" defaultValue={patientField(patient, "area")} placeholder='Enter patient area'/>
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
            placeholder='Enter patient Address'
          />
        </Field>
      </div>
    </>
  );
}
