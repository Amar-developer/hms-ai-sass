import {
  Card,
  Button,
  SearchableSelect,
  Input,
} from "../../../app/components/common/ui";
import { FormField } from "../../../app/components/FormElements";
import { NumberField, DateField } from "../../../app/components/FormElements";
import { paymentMethodOptions } from "@/lib/options";
import { useEffect, useMemo, useRef, useState } from "react";
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
    formState: { errors, isDirty },
  } = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      fullName: patientField(patient, "full_name", "fullName") || "",
      mobile: patientField(patient, "mobile") || "",
      branchId:
        patientField(patient, "branch_id", "branchId") || defaultBranchId || "",
      gender: patientField(patient, "gender") || "select a gender",
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
      whatsappConsentStatus:
        patientField(
          patient,
          "whatsapp_consent_status",
          "whatsappConsentStatus",
        ) || "not_recorded",
      whatsappConsentSource:
        patientField(
          patient,
          "whatsapp_consent_source",
          "whatsappConsentSource",
        ) || "",
      whatsappPreferredLanguage:
        (patientField(
          patient,
          "whatsapp_preferred_language",
          "whatsappPreferredLanguage",
        ) || "en") === "tenant_default"
          ? "en"
          : patientField(
              patient,
              "whatsapp_preferred_language",
              "whatsappPreferredLanguage",
            ) || "en",
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
    // Never overwrite fields the user is actively editing: if this fires
    // again after mount (e.g. a parent re-render passes a new `patient`
    // reference), a dirty form must keep the user's unsaved input instead
    // of silently reverting to server data underneath them.
    if (isDirty) return;
    reset({
      fullName: patientField(patient, "full_name", "fullName") || "",
      mobile: patientField(patient, "mobile") || "",
      branchId:
        patientField(patient, "branch_id", "branchId") || defaultBranchId || "",
      gender: patientField(patient, "gender") || genders[0][0],
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
      whatsappConsentStatus:
        patientField(
          patient,
          "whatsapp_consent_status",
          "whatsappConsentStatus",
        ) || "not_recorded",
      whatsappConsentSource:
        patientField(
          patient,
          "whatsapp_consent_source",
          "whatsappConsentSource",
        ) || "",
      whatsappPreferredLanguage:
        (patientField(
          patient,
          "whatsapp_preferred_language",
          "whatsappPreferredLanguage",
        ) || "en") === "tenant_default"
          ? "en"
          : patientField(
              patient,
              "whatsapp_preferred_language",
              "whatsappPreferredLanguage",
            ) || "en",
    });
  }, [patient, defaultBranchId, reset]);

  const dateOfBirth = watch("dateOfBirth");
  const whatsappConsentStatus = watch("whatsappConsentStatus");
  const dateOfBirthRegistration = register("dateOfBirth");

  // Skip the initial mount: defaultValues/reset already computed the
  // correct ageYears (from date_of_birth, or from age_years for patients
  // registered by age only). Without this guard, this effect still runs
  // once on mount and, seeing an empty dateOfBirth, immediately wipes out
  // that correct value — breaking every age-only patient's edit form.
  const skipFirstDobEffect = useRef(true);
  useEffect(() => {
    if (skipFirstDobEffect.current) {
      skipFirstDobEffect.current = false;
      return;
    }
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
        <FormField label="Mobile Number">
          <Input
            type="text"
            inputMode="numeric"
            maxLength={10}
            placeholder="Enter patient mobile number"
            {...register("mobile", {
              onChange: (e) => {
                e.target.value = e.target.value.replace(/\D/g, "");
              },
            })}
          />

          <FormError error={errors.mobile?.message} />
          <p className="mt-1 text-[11px] text-slate-500">
            Primary mobile numbers must be unique for each patient.
          </p>
        </FormField>
        <FormField label="Branch" required>
          <SearchableSelect
            value={watch("branchId")}
            onChange={(value) =>
              setValue("branchId", value, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
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
          <FormError error={errors.branchId?.message} />
        </FormField>
        <FormField label="Gender" required>
          <SearchableSelect
            value={watch("gender")}
            searchable={false}
            options={genders.map(([value, label]) => ({
              value,
              label,
            }))}
            onChange={(value) =>
              setValue("gender", value, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
          <FormError error={errors.gender?.message} />
        </FormField>
        <FormField label="Date of Birth">
          <Input
            type="date"
            max={today}
            name={dateOfBirthRegistration.name}
            value={dateOfBirth || ""}
            onChange={dateOfBirthRegistration.onChange}
            onBlur={dateOfBirthRegistration.onBlur}
          />
        </FormField>
        <FormField label="Age Years" required>
          <Input
            type="number"
            min="0"
            max="130"
            placeholder="Age"
            {...register("ageYears")}
          />
          <FormError error={errors.ageYears?.message} />
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
        <FormField label="Alternate Phone Number">
          <Input
            type="text"
            inputMode="numeric"
            maxLength={10}
            {...register("alternateMobile", {
              onChange: (e) => {
                e.target.value = e.target.value.replace(/\D/g, "");
              },
            })}
            placeholder="Enter shared family contact number"
          />
          <FormError error={errors.alternateMobile?.message} />
          <p className="mt-1 text-[11px] text-slate-500">
            A family member&apos;s existing mobile number can be used here.
          </p>
        </FormField>
        <FormField label="Email">
          <Input {...register("email")} placeholder="Enter patient email" />
          <FormError error={errors.email?.message} />
        </FormField>
        <FormField label="WhatsApp preference">
          <SearchableSelect
            value={whatsappConsentStatus}
            searchable={false}
            options={[
              { value: "not_recorded", label: "Not recorded" },
              { value: "opted_in", label: "Patient opted in" },
              { value: "opted_out", label: "Patient opted out" },
            ]}
            onChange={(value) => {
              setValue("whatsappConsentStatus", value as any, {
                shouldDirty: true,
                shouldValidate: true,
              });
              if (value === "not_recorded") {
                setValue("whatsappConsentSource", "", {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }
            }}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            An explicit opt-out blocks every patient WhatsApp notification.
          </p>
        </FormField>
        {whatsappConsentStatus !== "not_recorded" && (
          <FormField label="Preference source (optional)">
            <SearchableSelect
              value={watch("whatsappConsentSource") || ""}
              searchable={false}
              options={[
                { value: "", label: "Select source" },
                { value: "patient_verbal", label: "Patient verbal" },
                { value: "patient_written", label: "Patient written" },
                { value: "digital", label: "Digital consent" },
                { value: "imported", label: "Imported record" },
              ]}
              onChange={(value) =>
                setValue("whatsappConsentSource", value, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
            <FormError error={errors.whatsappConsentSource?.message} />
          </FormField>
        )}
        <FormField label="Message language">
          <SearchableSelect
            value={watch("whatsappPreferredLanguage")}
            searchable={false}
            options={[
              { value: "en", label: "English (default)" },
              { value: "ta", label: "Tamil" },
            ]}
            onChange={(value) =>
              setValue("whatsappPreferredLanguage", value as any, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
          <p className="mt-1 text-[11px] text-slate-500">
            English is used unless Tamil is selected for this patient.
          </p>
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
          <FormField label="Address" required>
            <Input
              {...register("address")}
              placeholder="Enter patient Address"
            />
            <FormError error={errors.address?.message} />
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

  function resetForm() {
    setPlanId("");
    setBranchId(patient?.branch_id || "");
    setStartsOn(new Date().toISOString().slice(0, 10));
    setPaidAmount("");
    setPaymentMethod("cash");
  }

  async function handleSubmit(e: any) {
    e.preventDefault();
    if (!selectedPlan || loading) return;
    const enrolled = await onSubmit({
      planId,
      branchId,
      startsOn,
      paidAmount,
      paymentMethod,
    });
    if (enrolled) resetForm();
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
        <Button disabled={loading || !selectedPlan}>
          {loading ? "Saving..." : "Enroll & Create Invoice"}
        </Button>
      </div>
    </form>
  );
}
