
import { useState } from "react";
import { Card,Field,Select,Input,Button } from "../common/ui";
import { NumberField,SelectField } from "../FormElements";
import { doctorTypes } from "@/utils/doctors/constants";
import { CheckboxGroup } from "./Shared";
import {
  activeDoctorDepartmentFeeRules,
  activeDoctorFeeRule,
} from "@/utils/doctors/helpers";
import { Plus, X } from "lucide-react";

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
  const departmentFeeRules = activeDoctorDepartmentFeeRules(feeRules, doctor);
  const fallbackFeeRule = activeDoctorFeeRule(feeRules, doctor);
  const orderedDepartmentIds = [...initialDepartmentIds].sort((a, b) => {
    const primary = String(doctor?.primary_specialty || "").toLowerCase();
    const aName = String(
      departments.find((department: any) => department.id === a)?.name || "",
    ).toLowerCase();
    const bName = String(
      departments.find((department: any) => department.id === b)?.name || "",
    ).toLowerCase();
    return Number(bName === primary) - Number(aName === primary);
  });
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
  const [specialtyFees, setSpecialtyFees] = useState<any[]>(
    orderedDepartmentIds.length
      ? orderedDepartmentIds.map((departmentId: string) => ({
          departmentId,
          fee: String(
            departmentFeeRules.find(
              (rule: any) => rule.department_id === departmentId,
            )?.fee_amount ??
              fallbackFeeRule?.fee_amount ??
              "",
          ),
          doctorSharePercentage: String(
            departmentFeeRules.find(
              (rule: any) => rule.department_id === departmentId,
            )?.doctor_share_percentage ??
              fallbackFeeRule?.doctor_share_percentage ??
              70,
          ),
        }))
      : [{ departmentId: "", fee: "", doctorSharePercentage: "70" }],
  );
  const [registrationNumber, setRegistrationNumber] = useState(
    doctor?.registration_number || "",
  );
  const [status, setStatus] = useState(doctor?.status || "active");
  const [shareTaxWithDoctor, setShareTaxWithDoctor] = useState(
    String(
      departmentFeeRules[0]?.share_tax_with_doctor ??
        fallbackFeeRule?.share_tax_with_doctor ??
        false,
    ),
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
  const updateSpecialty = (index: number, key: string, value: string) =>
    setSpecialtyFees((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row,
      ),
    );
  const addSpecialty = () =>
    setSpecialtyFees((current) => [
      ...current,
      { departmentId: "", fee: "", doctorSharePercentage: "70" },
    ]);
  const removeSpecialty = (index: number) =>
    setSpecialtyFees((current) =>
      current.length > 1
        ? current.filter((_, rowIndex) => rowIndex !== index)
        : current,
    );
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
          const configuredSpecialties = specialtyFees.filter(
            (row) => row.departmentId,
          );
          if (configuredSpecialties.length === 0) {
            window.alert("Select at least one specialty.");
            return;
          }
          if (
            new Set(
              configuredSpecialties.map((row) => row.departmentId),
            ).size !== configuredSpecialties.length
          ) {
            window.alert(
              "The same specialty cannot be added more than once for this doctor.",
            );
            return;
          }
          if (
            configuredSpecialties.some(
              (row) => row.fee === "" || Number(row.fee) < 0,
            )
          ) {
            window.alert("Enter a valid OP consultation fee for every specialty.");
            return;
          }
          if (
            configuredSpecialties.some(
              (row) =>
                row.doctorSharePercentage === "" ||
                Number(row.doctorSharePercentage) < 0 ||
                Number(row.doctorSharePercentage) > 100,
            )
          ) {
            window.alert(
              "Enter a doctor share from 0 to 100 for every specialty.",
            );
            return;
          }
          const fd = new FormData(event.currentTarget);
          const primaryDepartment = departments.find(
            (department: any) =>
              department.id === configuredSpecialties[0].departmentId,
          );
          onSubmit({
            userId: selectedUserId,
            fullName,
            practitionerType,
            primarySpecialty: primaryDepartment?.name || null,
            registrationNumber: fd.get("registrationNumber") || "",
            mobile,
            email,
            status,
            branchIds: selectedBranches,
            departmentIds: configuredSpecialties.map(
              (row) => row.departmentId,
            ),
            specialtyFees: configuredSpecialties,
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
            mobileNumber
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
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="table-data font-bold text-slate-900">
                  Specialties & Consultation Prices
                </h4>
                <p className="mt-1 text-xs text-slate-500">
                  The first row is the primary specialty. Each specialty can
                  have a different consultation fee and doctor share.
                </p>
              </div>
              <button
                type="button"
                onClick={addSpecialty}
                disabled={specialtyFees.length >= departments.length}
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold disabled:text-slate-300"
              >
                <Plus size={14} />
                Add Specialty
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              {specialtyFees.map((row, index) => {
                const selectedElsewhere = new Set(
                  specialtyFees
                    .filter((_, rowIndex) => rowIndex !== index)
                    .map((item) => item.departmentId)
                    .filter(Boolean),
                );
                return (
                  <div
                    key={index}
                    className="grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_220px_180px_auto] md:items-end"
                  >
                    <Field
                      label={
                        index === 0
                          ? "Primary Specialty"
                          : `Additional Specialty ${index}`
                      }
                    >
                      <Select
                        value={row.departmentId}
                        onChange={(event: any) =>
                          updateSpecialty(
                            index,
                            "departmentId",
                            event.target.value,
                          )
                        }
                        required
                      >
                        <option value="">Select tenant department</option>
                        {departments.map((department: any) => (
                          <option
                            key={department.id}
                            value={department.id}
                            disabled={selectedElsewhere.has(department.id)}
                          >
                            {department.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <NumberField
                      label={
                        isPhysiotherapist
                          ? "Session Price"
                          : "OP Consultation Fee"
                      }
                      value={row.fee}
                      onChange={(value) =>
                        updateSpecialty(index, "fee", value)
                      }
                      min={0}
                      required
                      placeholder="650"
                    />
                    <NumberField
                      label="Doctor Share %"
                      value={row.doctorSharePercentage}
                      onChange={(value) =>
                        updateSpecialty(
                          index,
                          "doctorSharePercentage",
                          value,
                        )
                      }
                      min={0}
                      max={100}
                      required
                      placeholder="70"
                    />
                    <button
                      type="button"
                      onClick={() => removeSpecialty(index)}
                      disabled={specialtyFees.length === 1}
                      className="close-button bg-white disabled:text-slate-300"
                      aria-label={`Remove specialty ${index + 1}`}
                    >
                      <X size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
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
