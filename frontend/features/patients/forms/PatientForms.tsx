import {
  Card,
  Button,
  SearchableSelect,
  Input,
} from "../../../app/components/common/ui";
import { FormField } from "../../../app/components/FormElements";
import { NumberField, DateField } from "../../../app/components/FormElements";
import { paymentMethodOptions } from "@/lib/options";
import { ApiSession, apiFetch } from "@/lib/api";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  calculateAgeYears,
  calculateDobFromAge,
  patientDateInputValue,
  patientField,
  todayInputValue,
} from "../helpers";
import {
  bloodGroups,
  genders,
  language_options,
  familyRelationshipOptions,
  source_options,
  statusOptions,
  whatsup_options,
} from "../constants";
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
  error,
  onSubmit,
  back,
  apiSession,
  familyRelationships = [],
}: any & { apiSession?: ApiSession | null }) {
  const {
    register,
    getValues,
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
      alternateMobile:
        patientField(patient, "alternate_mobile", "alternateMobile") || "",
      guardianName:
        patientField(patient, "guardian_name", "guardianName") || "",
      guardianMobile:
        patientField(patient, "guardian_mobile", "guardianMobile") || "",
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
      monthlyTrackingEnabled: Boolean(
        patientField(patient, "monthly_tracking_enabled", "monthlyTrackingEnabled"),
      ),
      monthlyRefillOn: patientDateInputValue(
        patientField(patient, "monthly_refill_on", "monthlyRefillOn"),
      ),
      monthlyRefillNotes:
        patientField(patient, "monthly_refill_notes", "monthlyRefillNotes") || "",
      monthlyLabOn: patientDateInputValue(
        patientField(patient, "monthly_lab_on", "monthlyLabOn"),
      ),
      monthlyLabTestName:
        patientField(patient, "monthly_lab_test_name", "monthlyLabTestName") || "",
      monthlyLabNotes:
        patientField(patient, "monthly_lab_notes", "monthlyLabNotes") || "",
      familyRelatedPatientId: "",
      familyRelationship: "father",
      familyNotes: "",
    },
  });
  const today = todayInputValue();
  const updatingFromAge = useRef(false);
  const monthlyTrackingEnabled = Boolean(watch("monthlyTrackingEnabled"));
  const familyRelatedPatientId = watch("familyRelatedPatientId");
  const [familyPatientOptions, setFamilyPatientOptions] = useState<any[]>([]);
  const [familyPatientSearchLoading, setFamilyPatientSearchLoading] =
    useState(false);
  // Set right before the resync effect below calls reset(), so the DOB
  // watch-effect further down knows the resulting dateOfBirth change came
  // from server data, not the user — otherwise it would call setValue with
  // shouldDirty:true as a side effect, permanently marking the form dirty
  // and blocking every future corrective reset() for this patient.
  const justResetRef = useRef(false);

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
    justResetRef.current = true;
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
      alternateMobile:
        patientField(patient, "alternate_mobile", "alternateMobile") || "",
      guardianName:
        patientField(patient, "guardian_name", "guardianName") || "",
      guardianMobile:
        patientField(patient, "guardian_mobile", "guardianMobile") || "",
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
      monthlyTrackingEnabled: Boolean(
        patientField(patient, "monthly_tracking_enabled", "monthlyTrackingEnabled"),
      ),
      monthlyRefillOn: patientDateInputValue(
        patientField(patient, "monthly_refill_on", "monthlyRefillOn"),
      ),
      monthlyRefillNotes:
        patientField(patient, "monthly_refill_notes", "monthlyRefillNotes") || "",
      monthlyLabOn: patientDateInputValue(
        patientField(patient, "monthly_lab_on", "monthlyLabOn"),
      ),
      monthlyLabTestName:
        patientField(patient, "monthly_lab_test_name", "monthlyLabTestName") || "",
      monthlyLabNotes:
        patientField(patient, "monthly_lab_notes", "monthlyLabNotes") || "",
      familyRelatedPatientId: "",
      familyRelationship: "father",
      familyNotes: "",
    });
  }, [patient, defaultBranchId, reset]);

  async function searchFamilyPatients(query = "") {
    if (!apiSession) return;
    setFamilyPatientSearchLoading(true);
    try {
      const params = new URLSearchParams({
        limit: "25",
        active_only: "true",
      });
      if (query.trim()) params.set("q", query.trim());
      const rows = await apiFetch(`/patients?${params.toString()}`, apiSession);
      const linkedIds = new Set(
        familyRelationships.map((row: any) => row.related_patient_id),
      );
      setFamilyPatientOptions(
        (Array.isArray(rows) ? rows : [])
          .filter((row: any) => row.id !== patient?.id && !linkedIds.has(row.id))
          .map((row: any) => ({
            value: row.id,
            label: row.full_name || row.patient_number || row.id,
            sublabel: `${row.patient_number || row.id}${row.contact_mobile || row.mobile ? ` · ${row.contact_mobile || row.mobile}` : ""}`,
          })),
      );
    } catch {
      setFamilyPatientOptions([]);
    } finally {
      setFamilyPatientSearchLoading(false);
    }
  }

  useEffect(() => {
    setValue("familyRelatedPatientId" as any, "", { shouldDirty: false });
    setValue("familyRelationship" as any, "father", { shouldDirty: false });
    setValue("familyNotes" as any, "", { shouldDirty: false });
    searchFamilyPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient?.id, apiSession?.tenantId, familyRelationships.length]);

  useEffect(() => {
    const currentBranchId = getValues("branchId");
    const currentBranchIsValid = branches.some(
      (branch: any) => branch.id === currentBranchId,
    );
    if (currentBranchIsValid) return;

    const nextBranchId = branches.some(
      (branch: any) => branch.id === defaultBranchId,
    )
      ? defaultBranchId
      : branches[0]?.id;
    if (!nextBranchId) return;

    // Branches load after the form can already be edited. Repair only the
    // branch field so late API data never clears patient details already typed.
    setValue("branchId", nextBranchId, {
      shouldDirty: false,
      shouldValidate: true,
    });
  }, [branches, defaultBranchId, getValues, setValue]);

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

    if (updatingFromAge.current) {
      updatingFromAge.current = false;
      return;
    }

    if (justResetRef.current) {
      justResetRef.current = false;
      return;
    }

    if (!dateOfBirth) {
      setValue("ageYears", "", {
        shouldDirty: true,
      });
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
      {error && (
        <p className="mt-3 text-sm font-bold text-red-500">{error}</p>
      )}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-4 space-y-3"
      >
        <section className="rounded-lg border border-slate-200 bg-white p-3">
          <div>
            <h4 className="text-sm font-black text-slate-900">Basic Details</h4>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="Full Name" required>
              <Input
                {...register("fullName")}
                placeholder="Enter patient full name"
              />
              <FormError error={errors.fullName?.message} />
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
            <FormField label="Age Years" required>
              <Input
                type="number"
                min="0"
                max="100"
                placeholder="Age"
                {...register("ageYears", {
                  onChange: (e) => {
                    const age = e.target.value;
                    if (!age) {
                      setValue("dateOfBirth", "", {
                        shouldDirty: true,
                      });
                      return;
                    }
                    const numericAge = Number(age);
                    if (numericAge >= 0 && numericAge <= 100) {
                      updatingFromAge.current = true;
                      setValue("dateOfBirth", calculateDobFromAge(numericAge), {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }
                  },
                })}
              />
              <FormError error={errors.ageYears?.message} />
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
            </FormField>
            <FormField label="Secondary Mobile Number">
              <Input
                type="text"
                inputMode="numeric"
                maxLength={10}
                {...register("alternateMobile", {
                  onChange: (e) => {
                    e.target.value = e.target.value.replace(/\D/g, "");
                  },
                })}
                placeholder="Enter secondary patient mobile number"
              />
              <FormError error={errors.alternateMobile?.message} />
            </FormField>
            <FormField label="Guardian Name">
              <Input
                {...register("guardianName")}
                placeholder="Enter guardian or caregiver name"
              />
            </FormField>
            <FormField label="Guardian Mobile Number">
              <Input
                type="text"
                inputMode="numeric"
                maxLength={10}
                {...register("guardianMobile", {
                  onChange: (e) => {
                    e.target.value = e.target.value.replace(/\D/g, "");
                  },
                })}
                placeholder="Enter guardian mobile number"
              />
              <FormError error={errors.guardianMobile?.message} />
            </FormField>
            <FormField label="Email">
              <Input {...register("email")} placeholder="Enter patient email" />
              <FormError error={errors.email?.message} />
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
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div>
            <h4 className="text-sm font-black text-slate-900">
              WhatsApp Preference
            </h4>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="WhatsApp preference">
              <SearchableSelect
                value={whatsappConsentStatus}
                searchable={false}
                options={whatsup_options}
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
            </FormField>
            {whatsappConsentStatus !== "not_recorded" && (
              <FormField label="Preference source (optional)">
                <SearchableSelect
                  value={watch("whatsappConsentSource") || ""}
                  searchable={false}
                  options={source_options}
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
                options={language_options}
                onChange={(value) =>
                  setValue("whatsappPreferredLanguage", value as any, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
            </FormField>
          </div>
        </section>

        <section className="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h4 className="text-sm font-black text-slate-900">
                Monthly Patient Tracking
              </h4>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={monthlyTrackingEnabled}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black transition-colors ${
                monthlyTrackingEnabled
                  ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                  : "border-slate-300 bg-white text-slate-500"
              }`}
              onClick={() => {
                const next = !monthlyTrackingEnabled;
                setValue("monthlyTrackingEnabled", next, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                if (!next) {
                  setValue("monthlyRefillOn", "", { shouldDirty: true });
                  setValue("monthlyRefillNotes", "", { shouldDirty: true });
                  setValue("monthlyLabOn", "", { shouldDirty: true });
                  setValue("monthlyLabTestName", "", { shouldDirty: true });
                  setValue("monthlyLabNotes", "", { shouldDirty: true });
                }
              }}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  monthlyTrackingEnabled ? "bg-emerald-600" : "bg-slate-400"
                }`}
              />
              {monthlyTrackingEnabled ? "Monthly Patient On" : "Monthly Patient Off"}
            </button>
          </div>
          {monthlyTrackingEnabled ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <FormField label="Next monthly medicine refill">
                <Input type="date" {...register("monthlyRefillOn")} />
              </FormField>
              <FormField label="Next monthly lab test">
                <Input type="date" {...register("monthlyLabOn")} />
              </FormField>
            </div>
          ) : (
            null
          )}
        </section>

        {apiSession && (
          <section className="rounded-lg border border-slate-200 bg-white p-3">
            <div>
              <h4 className="text-sm font-black text-slate-900">
                Family Relationship
              </h4>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.2fr_180px_1fr]">
              <FormField label="Family Patient">
                <SearchableSelect
                  value={familyRelatedPatientId || ""}
                  onChange={(value) =>
                    setValue("familyRelatedPatientId" as any, value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  options={familyPatientOptions}
                  loading={familyPatientSearchLoading}
                  onSearchChange={searchFamilyPatients}
                  placeholder="Select existing patient"
                  searchPlaceholder="Search by name, ID, or mobile"
                  emptyText="No matching patient found."
                />
              </FormField>
              <FormField label="Relationship">
                <SearchableSelect
                  value={watch("familyRelationship" as any) || "father"}
                  onChange={(value) =>
                    setValue("familyRelationship" as any, value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  options={familyRelationshipOptions}
                  searchable={false}
                  placeholder="Select relationship"
                />
              </FormField>
              <FormField label="Notes">
                <Input
                  {...register("familyNotes" as any)}
                  placeholder="Optional note"
                />
              </FormField>
            </div>
          </section>
        )}

        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} className='save-button'>
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
  const [startsOn, setStartsOn] = useState(todayInputValue());
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
    setStartsOn(todayInputValue());
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
        disabled
        hint="Fixed from the selected membership plan"
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
        <Button disabled={loading || !selectedPlan} className='save-button'>
          {loading ? "Saving..." : "Enroll & Create Invoice"}
        </Button>
      </div>
    </form>
  );
}
