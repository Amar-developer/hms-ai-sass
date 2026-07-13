import {
  Card,
  Button,
  SearchableSelect,
  Input,
} from "../../../app/components/common/ui";
import { FormField } from "../../../app/components/FormElements";
import { NumberField, DateField } from "../../../app/components/FormElements";
import { paymentMethodOptions } from "@/lib/options";
import { useEffect, useMemo, useState } from "react";
import {
  calculateAgeYears,
  patientDateInputValue,
  patientField,
  todayInputValue,
} from "../helpers";
import { bloodGroups, genders, statusOptions } from "../constants";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PatientFormValues, patientSchema } from "../patient.schema";
import { FormError } from "../../../app/components/common/FormError";

export function PatientForm({
  title,
  patient,
  branches,
  defaultBranchId,
  busy,
  onSubmit,
  back,
}: any) {
  const {
    register,
    setValue,
    watch,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      fullName: patientField(patient, "full_name", "fullName") || "",
      mobile: patientField(patient, "mobile") || "",
      branchId:
        patientField(patient, "branch_id", "branchId") || defaultBranchId || "",
      gender: patientField(patient, "gender") || "",
      dateOfBirth: patientDateInputValue(
        patientField(patient, "date_of_birth", "dateOfBirth"),
      ),
      ageYears: patientDateInputValue(
        patientField(patient, "date_of_birth", "dateOfBirth"),
      )
        ? calculateAgeYears(
            patientDateInputValue(
              patientField(patient, "date_of_birth", "dateOfBirth"),
            ),
          )
        : String(patientField(patient, "age_years", "ageYears") || ""),
      guardianName:
        patientField(patient, "guardian_name", "guardianName") || "",
      guardianMobile:
        patientField(patient, "guardian_mobile", "guardianMobile") || "",
      alternateMobile:
        patientField(patient, "alternate_mobile", "alternateMobile") || "",
      email: patientField(patient, "email") || "",
      area: patientField(patient, "area") || "",
      bloodGroup: patientField(patient, "blood_group", "bloodGroup") || "",
      address: patientField(patient, "address") || "",
      status: patient?.status || "active",
    },
  });
  const today = todayInputValue();

  const branchOptions = useMemo(() => {
    const selectedBranchId = watch("branchId");

    const options = [...branches];

    if (selectedBranchId && !options.some((b) => b.id === selectedBranchId)) {
      options.unshift({
        id: selectedBranchId,
        name: "Selected branch",
      });
    }

    return options;
  }, [branches, watch("branchId")]);

  useEffect(() => {
    reset({
      fullName: patientField(patient, "full_name", "fullName") || "",
      mobile: patientField(patient, "mobile") || "",
      branchId:
        patientField(patient, "branch_id", "branchId") || defaultBranchId || "",
      gender: patientField(patient, "gender") || "",
      dateOfBirth: patientDateInputValue(
        patientField(patient, "date_of_birth", "dateOfBirth"),
      ),
      ageYears: patientDateInputValue(
        patientField(patient, "date_of_birth", "dateOfBirth"),
      )
        ? calculateAgeYears(
            patientDateInputValue(
              patientField(patient, "date_of_birth", "dateOfBirth"),
            ),
          )
        : String(patientField(patient, "age_years", "ageYears") || ""),
      guardianName:
        patientField(patient, "guardian_name", "guardianName") || "",
      guardianMobile:
        patientField(patient, "guardian_mobile", "guardianMobile") || "",
      alternateMobile:
        patientField(patient, "alternate_mobile", "alternateMobile") || "",
      email: patientField(patient, "email") || "",
      area: patientField(patient, "area") || "",
      bloodGroup: patientField(patient, "blood_group", "bloodGroup") || "",
      address: patientField(patient, "address") || "",
      status: patient?.status || "active",
    });
  }, [patient, defaultBranchId, reset]);

  const dateOfBirth = watch("dateOfBirth");

  useEffect(() => {
    if (!dateOfBirth) {
      setValue("ageYears", "");
      return;
    }

    setValue("ageYears", calculateAgeYears(dateOfBirth), {
      shouldValidate: true,
      shouldDirty: true,
    });
  }, [dateOfBirth, setValue]);

  return (
    <Card>
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center ">
        <div>
          <h3 className="card-title font-bold">{title}</h3>
          <p className="card-desc text-slate-500">
            {patient?.patient_number || "Create tenant-scoped patient record."}
          </p>
        </div>
        <button type="button" onClick={back} className="close-button font-bold">
          Back
        </button>
      </div>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <FormField label="Full Name" required>
          <Input
            {...register("fullName")}
            placeholder="Enter patient full name"
          />
          <FormError error={errors.fullName?.message} />
        </FormField>
        <FormField label="Mobile">
          <Input
            {...register("mobile")}
            placeholder="Enter patient mobile number"
          />
          <FormError error={errors.mobile?.message} />
        </FormField>
        <FormField label="Branch">
          <SearchableSelect
            value={watch("branchId")}
            onChange={(value) => setValue("branchId", value)}
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
            value={watch("gender")}
            searchable={false}
            options={genders.map(([value, label]) => ({
              value,
              label,
            }))}
            onChange={(value) => setValue("gender", value)}
          />
        </FormField>
        <FormField label="Date of Birth">
          <Input type="date" max={today} {...register("dateOfBirth")} />
        </FormField>
        <FormField label="Age Years">
          <Input
            type="number"
            min="0"
            max="130"
            placeholder="Age"
            {...register("ageYears")}
          />
        </FormField>
        <FormField label="Guardian Name">
          <Input
            {...register("guardianName")}
            placeholder="Enter guardian name"
          />
        </FormField>
        <FormField label="Guardian Mobile">
          <Input
            {...register("guardianMobile")}
            placeholder="Enter guardian mobile"
          />
        </FormField>
        <FormField label="Alternate Mobile">
          <Input
            {...register("alternateMobile")}
            placeholder="Enter guardian mobile number"
          />
        </FormField>
        <FormField label="Email">
          <Input {...register("email")} placeholder="Enter patient email" />
          <FormError error={errors.email?.message} />
        </FormField>
        <FormField label="Area">
          <Input {...register("area")} placeholder="Enter patient area" />
        </FormField>
        <FormField label="Blood Group">
          <SearchableSelect
            value={watch("bloodGroup")}
            searchable={false}
            options={bloodGroups.map(([value, label]) => ({
              value,
              label,
            }))}
            onChange={(value) => setValue("bloodGroup", value)}
          />
        </FormField>
        {Boolean(patient) && (
          <FormField label="Status">
            <SearchableSelect
              value={watch("status")}
              onChange={(value) => setValue("status", value)}
              searchable={false}
              options={statusOptions}
            />
          </FormField>
        )}
        <div className="md:col-span-2 xl:col-span-3">
          <FormField label="Address">
            <Input
              {...register("address")}
              placeholder="Enter patient Address"
            />
          </FormField>
        </div>

        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3">
          <Button disabled={busy}>
            {busy ? "Saving..." : patient ? "Save Patient" : "Create Patient"}
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

export function MembershipEnrollForm({
  membershipPlans,
  patient,
  branches = [],
  loading,
  onSubmit,
}: any) {
  const activePlans = membershipPlans.filter((plan: any) => plan.is_active);
  const [planId, setPlanId] = useState("");
  const [branchId, setBranchId] = useState(patient?.branch_id || "");
  const [startsOn, setStartsOn] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const selectedPlan = activePlans.find((plan: any) => plan.id === planId);
  const branchOptions = useMemo(() => {
    const options = branches.map((branch: any) => ({
      value: branch.id,
      label: branch.name || branch.branch_name || branch.id,
    }));
    if (branchId && !options.some((option: any) => option.value === branchId)) {
      options.unshift({
        value: branchId,
        label: patient?.branch?.name || patient?.branch_name || branchId,
      });
    }
    return [{ value: "", label: "Select branch" }, ...options];
  }, [branches, branchId, patient?.branch?.name, patient?.branch_name]);

  useEffect(() => {
    if (!selectedPlan) return;
    setPaidAmount(String(Number(selectedPlan.price_amount || 0)));
  }, [selectedPlan]);

  function handleSubmit(e: any) {
    e.preventDefault();
    onSubmit({ planId, branchId, startsOn, paidAmount, paymentMethod });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 grid gap-3 md:grid-cols-5">
      <FormField label="Plan">
        <SearchableSelect
          value={planId}
          onChange={setPlanId}
          searchable={activePlans.length > 8}
          placeholder="Select plan"
          options={[
            { value: "", label: "Select plan" },
            ...activePlans.map((plan: any) => ({
              value: plan.id,
              label: `${plan.name} · ₹${Number(plan.price_amount || 0).toLocaleString("en-IN")}`,
            })),
          ]}
        />
      </FormField>
      <FormField label="Branch">
        <SearchableSelect
          value={branchId}
          onChange={setBranchId}
          searchable={branchOptions.length > 8}
          options={branchOptions}
        />
      </FormField>
      <DateField label="Starts On" value={startsOn} onChange={setStartsOn} />
      <NumberField
        label="Amount Paid Now"
        value={paidAmount}
        onChange={setPaidAmount}
        min={0}
        placeholder="Auto-filled from plan"
      />
      <FormField label="Payment Method">
        <SearchableSelect
          value={paymentMethod}
          onChange={setPaymentMethod}
          searchable={false}
          options={[...paymentMethodOptions]}
        />
      </FormField>
      <div className="md:col-span-5">
        <Button disabled={loading || activePlans.length === 0}>
          {loading ? "Saving..." : "Enroll & Create Invoice"}
        </Button>
      </div>
    </form>
  );
}
