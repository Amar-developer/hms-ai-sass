
import { useState } from "react";
import { Card,Field,Select,Input,Button } from "../common/ui";
import { NumberField,SelectField } from "../FormElements";
import { doctorTypes } from "@/utils/doctors/constants";
import { CheckboxGroup } from "./Shared";
import { activeDoctorFeeRule } from "@/utils/doctors/helpers";

export function DoctorForm({
  title,
  doctor,
  branches,
  departments,
  users,
  doctors,
  feeRules,
  busy,
  onSubmit,
  back,
}: any) {
  const initialDepartmentIds = doctor?.department_ids || [];
  const initialDepartmentName =
    departments.find(
      (department: any) => department.id === initialDepartmentIds[0],
    )?.name || "";
  const [practitionerType, setPractitionerType] = useState(
    doctor?.practitioner_type || "doctor",
  );
  const [selectedUserId, setSelectedUserId] = useState(doctor?.user_id || "");
  const [fullName, setFullName] = useState(doctor?.full_name || "");
  const [email, setEmail] = useState(doctor?.email || "");
  const [mobile, setMobile] = useState(doctor?.mobile || "");
  const [selectedBranches, setSelectedBranches] = useState<string[]>(
    doctor?.branch_ids || [],
  );
  const [selectedDepartments, setSelectedDepartments] =
    useState<string[]>(initialDepartmentIds);
  const [primarySpecialty, setPrimarySpecialty] = useState(
    doctor?.primary_specialty || initialDepartmentName,
  );
  const [specialtyTouched, setSpecialtyTouched] = useState(
    Boolean(doctor?.primary_specialty),
  );
  const activeFeeRule = activeDoctorFeeRule(feeRules, doctor);
  const [registrationNumber, setRegistrationNumber] = useState(
    doctor?.registration_number || "",
  );
  const [status, setStatus] = useState(doctor?.status || "active");
  const [consultationFee, setConsultationFee] = useState(
    String(activeFeeRule?.fee_amount ?? ""),
  );
  const [doctorSharePercentage, setDoctorSharePercentage] = useState(
    String(activeFeeRule?.doctor_share_percentage ?? 70),
  );
  const [shareTaxWithDoctor, setShareTaxWithDoctor] = useState(
    String(activeFeeRule?.share_tax_with_doctor ?? false),
  );

  const isPhysiotherapist = practitionerType === "physiotherapist";
  const linkedUserIds = new Set(
    (doctors || [])
      .filter((row: any) => row.id !== doctor?.id)
      .map((row: any) => row.user_id)
      .filter(Boolean),
  );
  const doctorUsers = users.filter(
    (user: any) =>
      user.id === doctor?.user_id ||
      (user.is_active !== false &&
        user.user_type === "doctor" &&
        !linkedUserIds.has(user.id)),
  );
  function applyLoginUser(userId: string) {
    setSelectedUserId(userId);
    const user = users.find((row: any) => row.id === userId);
    if (!user) return;
    setPractitionerType("doctor");
    setFullName(user.name || "");
    setEmail(user.email || "");
    setMobile(user.mobile || "");
    if (user.branch_id) setSelectedBranches([user.branch_id]);
    else if (branches.length) setSelectedBranches(branches.map((branch: any) => branch.id));
  }
  function handleDepartmentsChange(next: string[]) {
    const previousFirst =
      departments.find(
        (department: any) => department.id === selectedDepartments[0],
      )?.name || "";
    const nextFirst =
      departments.find((department: any) => department.id === next[0])?.name ||
      "";
    setSelectedDepartments(next);
    if (
      !specialtyTouched ||
      !primarySpecialty ||
      primarySpecialty === previousFirst
    ) {
      setPrimarySpecialty(nextFirst);
      setSpecialtyTouched(false);
    }
  }
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="card-title font-bold">{title}</h3>
          {/* <p className="table-data text-slate-500">
            {doctor?.id ||
              "Map doctor to branch and medical department availability."}
          </p> */}
        </div>
        <button
          type="button"
          onClick={back}
          className="close-button font-bold"
        >
          Back to Doctors
        </button>
      </div>
      <form
        onSubmit={(event: any) => {
          event.preventDefault();
          if (branches.length > 0 && selectedBranches.length === 0) {
            window.alert(
              "Select at least one branch (or tick 'All branches') so the doctor can be booked.",
            );
            return;
          }
          const fd = new FormData(event.currentTarget);
          onSubmit({
            userId: selectedUserId,
            fullName,
            practitionerType,
            primarySpecialty,
            registrationNumber: fd.get("registrationNumber") || "",
            mobile,
            email,
            status,
            branchIds: selectedBranches,
            departmentIds: selectedDepartments,
            consultationFee,
            doctorSharePercentage,
            shareTaxWithDoctor,
          });
        }}
        className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <Field label="Full Name">
          <Input
            name="fullName"
            value={fullName}
            onChange={(event: any) => setFullName(event.target.value)}
            required
            placeholder="Dr. Priya Raman"
          />
        </Field>
        <Field label="Doctor Type">
          <Select
            name="practitionerType"
            value={practitionerType}
            onChange={(event: any) => setPractitionerType(event.target.value)}
          >
            {doctorTypes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Linked Login User">
          <Select
            name="userId"
            value={selectedUserId}
            onChange={(event: any) => applyLoginUser(event.target.value)}
          >
            <option value="">No login linked</option>
            {doctorUsers.map((user: any) => (
              <option key={user.id} value={user.id}>
                {user.name} - {user.email}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Primary Specialty">
          <Input
            name="primarySpecialty"
            value={primarySpecialty}
            onChange={(event: any) => {
              setPrimarySpecialty(event.target.value);
              setSpecialtyTouched(true);
            }}
            placeholder="General Medicine"
          />
        </Field>
        <Field label="Registration Number">
          <Input
            name="registrationNumber"
            defaultValue={doctor?.registration_number || ""}
            placeholder="TNMC12345"
          />
        </Field>
        <Field label="Mobile">
          <Input
            name="mobile"
            value={mobile}
            onChange={(event: any) => setMobile(event.target.value)}
            placeholder='Enter mobile'
          />
        </Field>
        <Field label="Email">
          <Input
            name="email"
            type="email"
            value={email}
            onChange={(event: any) => setEmail(event.target.value)}
            placeholder='Enter email'
          />
        </Field>
        {doctor && (
          <SelectField
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
        )}
        <NumberField
          label={
            isPhysiotherapist
              ? "Physiotherapy / Session Price"
              : "OP Consultation Fee"
          }
          value={consultationFee}
          onChange={setConsultationFee}
          min={0}
          placeholder="600"
        />
        <NumberField
          label="Doctor Share %"
          value={doctorSharePercentage}
          onChange={setDoctorSharePercentage}
          min={0}
          max={100}
          placeholder="70"
        />
        <SelectField
          label="Tax Sharing"
          value={shareTaxWithDoctor}
          onChange={setShareTaxWithDoctor}
          options={[
            { value: "false", label: "Clinic keeps tax" },
            { value: "true", label: "Share tax by ratio" },
          ]}
        />
        <div className="md:col-span-2 xl:col-span-3">
          <CheckboxGroup
            title="Branches"
            name="branchIds"
            rows={branches}
            selected={selectedBranches}
            onChange={setSelectedBranches}
            empty="Create branches before mapping doctors."
            allLabel="All branches"
          />
        </div>
        <div className="md:col-span-2 xl:col-span-3">
          <CheckboxGroup
            title="Medical Departments"
            name="departmentIds"
            rows={departments}
            selected={selectedDepartments}
            onChange={handleDepartmentsChange}
            empty="Create medical departments before mapping doctors."
          />
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3">
          <Button disabled={busy}>
            {busy ? "Saving..." : doctor ? "Save Doctor" : "Create Doctor"}
          </Button>
          <button
            type="button"
            onClick={back}
            className="close-button font-bold"
          >
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
