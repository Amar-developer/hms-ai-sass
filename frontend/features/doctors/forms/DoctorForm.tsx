import { FormError } from "@/app/components/common/FormError";
import {
  Button,
  Card,
  Field,
  Input,
  SearchableSelect,
} from "@/app/components/common/ui";
import {
  DoctorFormValues,
  doctorSchema,
} from "@/features/doctors/doctor.schema";
import {
  activeDoctorDepartmentFeeRules,
  activeDoctorFeeRule,
} from "../helpers";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { doctorTypes } from "../constants";
import { CheckboxGroup } from "../components/CheckboxGroup";
import { Plus, X } from "lucide-react";
import { NumberField, FormField } from "@/app/components/FormElements";

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
  onUploadSignature,
  back,
}: any) {
  const fallbackFeeRule = activeDoctorFeeRule(feeRules, doctor);
  const departmentFeeRules = activeDoctorDepartmentFeeRules(feeRules, doctor);

  // Better initial data
  const initialSpecialtyFees = React.useMemo(() => {
    if (!doctor) {
      return [
        {
          departmentId: "",
          fee: "",
          doctorSharePercentage: "70",
        },
      ];
    }

    const departmentFeeRules = activeDoctorDepartmentFeeRules(feeRules, doctor);

    const fallbackFeeRule = activeDoctorFeeRule(feeRules, doctor);

    if (doctor.department_ids?.length) {
      return doctor.department_ids.map((departmentId: string) => {
        const rule =
          departmentFeeRules.find(
            (r: any) => r.department_id === departmentId,
          ) || fallbackFeeRule;

        return {
          departmentId,
          fee: String(rule?.fee_amount ?? ""),
          doctorSharePercentage: String(rule?.doctor_share_percentage ?? 70),
        };
      });
    }

    return [
      {
        departmentId: "",
        fee: "",
        doctorSharePercentage: "70",
      },
    ];
  }, [doctor, feeRules]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    trigger,
    formState: { errors },
  } = useForm<DoctorFormValues>({
    resolver: zodResolver(doctorSchema),
    defaultValues: {
      userId: doctor?.user_id ?? "",
      fullName: doctor?.full_name ?? "",
      practitionerType: doctor?.practitioner_type ?? "doctor",
      registrationNumber: doctor?.registration_number ?? "",
      mobile: doctor?.mobile ?? "",
      email: doctor?.email ?? "",
      status: doctor?.status ?? "active",
      branchIds: doctor?.branch_ids ?? [],
      departmentIds: doctor?.department_ids ?? [],
      specialtyFees: initialSpecialtyFees,
      shareTaxWithDoctor: fallbackFeeRule?.share_tax_with_doctor ?? false,
    },
    mode: "onChange",
  });

  const [specialtyFees, setSpecialtyFees] = useState(initialSpecialtyFees);

  // Sync form values when specialtyFees changes
  useEffect(() => {
    setValue("specialtyFees", specialtyFees, { shouldValidate: true });
  }, [specialtyFees, setValue]);

  // Re-trigger validation when specialties change
  useEffect(() => {
    trigger("specialtyFees");
  }, [specialtyFees, trigger]);

  const practitionerType = watch("practitionerType");
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
    setValue("userId", userId);

    const user = users.find((row: any) => row.id === userId);
    if (!user) return;

    setValue("practitionerType", "doctor", { shouldValidate: true });
    setValue("fullName", user.name || "", { shouldValidate: true });
    setValue("email", user.email || "", { shouldValidate: true });
    setValue("mobile", user.mobile || "", { shouldValidate: true });

    if (user.branch_id) {
      setValue("branchIds", [user.branch_id], { shouldValidate: true });
    } else if (branches.length) {
      setValue(
        "branchIds",
        branches.map((branch: any) => branch.id),
        { shouldValidate: true },
      );
    }
  }

  const updateSpecialty = (index: number, key: string, value: string) => {
    setSpecialtyFees((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
  };

  const addSpecialty = () => {
    setSpecialtyFees((prev) => [
      ...prev,
      { departmentId: "", fee: "", doctorSharePercentage: "70" },
    ]);
  };

  const removeSpecialty = (index: number) => {
    if (specialtyFees.length === 1) return;
    setSpecialtyFees((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmitHandler = (data: DoctorFormValues) => {
    const validSpecialties = data.specialtyFees.filter((s) => s.departmentId);

    const primaryDepartment = departments.find(
      (d: any) => d.id === validSpecialties[0]?.departmentId,
    );

    onSubmit({
      ...data,
      primarySpecialty: primaryDepartment?.name || null,
      departmentIds: validSpecialties.map((s) => s.departmentId),
      specialtyFees: validSpecialties,
    });
  };

  useEffect(() => {
    setSpecialtyFees(initialSpecialtyFees);
    setValue("specialtyFees", initialSpecialtyFees);
  }, [initialSpecialtyFees, setValue]);
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="card-title font-bold">{title}</h3>
        </div>
        <button type="button" onClick={back} className="close-button font-bold">
          Back to Doctors
        </button>
      </div>
      <div className="rounded-lg p-3">
        <p className="text-xs font-semibold text-amber-700">
          Create a doctor user account first, then link it here using the
          "Linked Login User" field.
        </p>
      </div>
      <form
        onSubmit={handleSubmit(onSubmitHandler)}
        className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <FormField label="Full Name" required>
          <Input {...register("fullName")} placeholder="Dr. Priya Raman" />
          <FormError error={errors.fullName?.message} />
        </FormField>

        <FormField label="Doctor Type">
          <SearchableSelect
            value={watch("practitionerType")}
            onChange={(value) => setValue("practitionerType", value)}
            searchable={false}
            options={doctorTypes.map(([value, label]: any) => ({
              value,
              label,
            }))}
          />
        </FormField>

        <FormField label="Linked Login User" required>
          <SearchableSelect
            value={watch("userId")}
            onChange={applyLoginUser}
            searchable={doctorUsers.length > 8}
            placeholder="Select User"
            options={[
              { value: "", label: "Select User" },
              ...doctorUsers.map((user: any) => ({
                value: user.id,
                label: `${user.name} - ${user.email}`,
              })),
            ]}
          />
          <FormError error={errors.userId?.message} />
        </FormField>

        <FormField label="Registration Number">
          <Input {...register("registrationNumber")} placeholder="TNMC12345" />
          <FormError error={errors.registrationNumber?.message} />
        </FormField>

        <FormField label="Mobile" required>
          <Input {...register("mobile")} placeholder="Enter mobile" />
          <FormError error={errors.mobile?.message} />
        </FormField>

        <FormField label="Email" required>
          <Input
            type="email"
            {...register("email")}
            placeholder="Enter email"
          />
          <FormError error={errors.email?.message} />
        </FormField>

        {doctor && (
          <FormField label="Status">
            <SearchableSelect
              value={watch("status")}
              onChange={(value) => setValue("status", value)}
              searchable={false}
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
          </FormField>
        )}

        <FormField label="Share Tax with Doctor">
          <SearchableSelect
            value={watch("shareTaxWithDoctor") ? "true" : "false"}
            onChange={(value) =>
              setValue("shareTaxWithDoctor", value === "true", {
                shouldValidate: true,
              })
            }
            searchable={false}
            options={[
              { value: "true", label: "Yes" },
              { value: "false", label: "No" },
            ]}
          />
        </FormField>

        <div className="md:col-span-2 xl:col-span-3">
          <Controller
            name="branchIds"
            control={control}
            render={({ field }) => (
              <CheckboxGroup
                title="Branches"
                required
                rows={branches}
                value={field.value}
                onChange={field.onChange}
                empty="Create branches before mapping doctors."
                allLabel="All branches"
              />
            )}
          />
          <FormError error={errors.branchIds?.message} />
        </div>

        {/* Specialties & Fees Section */}
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
                    <FormField
                      label={
                        index === 0
                          ? "Primary Specialty"
                          : `Additional Specialty ${index}`
                      }
                    >
                      <SearchableSelect
                        value={row.departmentId}
                        onChange={(value) =>
                          updateSpecialty(index, "departmentId", value)
                        }
                        required
                        searchable={departments.length > 8}
                        placeholder="Select tenant department"
                        options={[
                          { value: "", label: "Select tenant department" },
                          ...departments.map((department: any) => ({
                            value: department.id,
                            label: department.name,
                            disabled: selectedElsewhere.has(department.id),
                          })),
                        ]}
                      />
                    </FormField>

                    <NumberField
                      label={
                        isPhysiotherapist
                          ? "Session Price"
                          : "OP Consultation Fee"
                      }
                      value={row.fee}
                      onChange={(value) => updateSpecialty(index, "fee", value)}
                      min={0}
                      placeholder="650"
                    />

                    <NumberField
                      label="Doctor Share %"
                      value={row.doctorSharePercentage}
                      onChange={(value) =>
                        updateSpecialty(index, "doctorSharePercentage", value)
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
          <Button disabled={busy} className="save-button" type="submit">
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
