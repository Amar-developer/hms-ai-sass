import { PractitionerPicker } from "../components/PractitionerPicker";
import React, { useEffect, useState } from "react";
import { ALL_BRANCHES } from "../constants";
import { FormField, NumberField, TimeField } from "@/app/components/FormElements";
import { Plus, X } from "lucide-react";
import {
  Card,
  Button,
  SearchableSelect,
} from "@/app/components/common/ui";
import { useForm, Controller, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ScheduleFormValues, scheduleSchema } from "../schedule.schema";
import { FormError } from "../../../app/components/common/FormError";
import {
  WeekdayMode,
  WeekdaySelector,
} from "@/app/components/common/WeekdaySelector";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import { toWeekdayMode } from "../helpers";

export function ScheduleForm({
  title,
  schedule,
  branches,
  departments,
  doctors,
  busy,
  error,
  onSubmit,
  back,
}: any) {
  const defaultRanges = React.useMemo(
    () => [
      {
        start: String(schedule?.start_time || "09:00").slice(0, 5),
        end: String(schedule?.end_time || "13:00").slice(0, 5),
        isActive: schedule?.is_active !== false,
      },
    ],
    [schedule],
  );

  const defaultWeekdays: string[] = (schedule?.weekdays || []).map(String);
  const defaultWeekdayMode = toWeekdayMode(schedule?.mode);

  const [mode, setMode] = useState<WeekdayMode>(defaultWeekdayMode);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      practitionerId: schedule?.practitioner_id || "",
      branchId: schedule?.branch_id || "",
      departmentId: schedule?.department_id || "",
      weekdayMode: defaultWeekdayMode,
      weekdays: defaultWeekdays,
      ranges: defaultRanges,
      slotMinutes: String(schedule?.slot_minutes || 15),
    },
  });

  const [ranges, setRanges] = useState(defaultRanges);

  // `schedule` can arrive asynchronously after this form has already
  // mounted (e.g. a direct URL to an edit link, before the schedule list
  // loads), so react-hook-form's initial defaultValues — and the `ranges`/
  // `mode` local state seeded from it — would otherwise stay stuck on
  // blank/default values. Re-sync everything once the real record shows up.
  useEffect(() => {
    if (!schedule?.id) return;
    const weekdayMode = toWeekdayMode(schedule?.mode);
    const weekdayValues: string[] = (schedule?.weekdays || []).map(String);
    const rangeValues = [
      {
        start: String(schedule?.start_time || "09:00").slice(0, 5),
        end: String(schedule?.end_time || "13:00").slice(0, 5),
        isActive: schedule?.is_active !== false,
      },
    ];
    reset({
      practitionerId: schedule?.practitioner_id || "",
      branchId: schedule?.branch_id || "",
      departmentId: schedule?.department_id || "",
      weekdayMode,
      weekdays: weekdayValues,
      ranges: rangeValues,
      slotMinutes: String(schedule?.slot_minutes || 15),
    });
    setRanges(rangeValues);
    setMode(weekdayMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule?.id]);

  const selectedDoctorId = watch("practitionerId");
  const selectedBranchId = watch("branchId");
  const selectedDays = watch("weekdays");

  useEffect(() => {
    setValue("ranges", ranges, { shouldValidate: true });
  }, [ranges, setValue]);

  const selectedDoctor = doctors.find((d: any) => d.id === selectedDoctorId);
  const doctorBranchIds = selectedDoctor?.branch_ids || [];
  const doctorBranches = branches.filter((b: any) =>
    doctorBranchIds.includes(b.id),
  );
  const isSingleBranchDoctor = doctorBranches.length === 1;

  // Only auto-fills defaults for a genuine user pick (wired into the picker's
  // onChange below) — NOT reactive to every `practitionerId` change, since
  // the edit-resync effect above also sets `practitionerId` programmatically
  // via `reset()`, and this would otherwise clobber the just-restored
  // branch/department (e.g. a doctor's second department) with their first
  // one on every edit-page load.
  const applyDoctorLinks = (doctorId: string) => {
    const doctor = doctors.find((item: any) => item.id === doctorId);
    if (!doctor) return;

    const branchIds = doctor.branch_ids || [];
    const departmentIds = doctor.department_ids || [];

    setValue("branchId", branchIds[0] || "", { shouldValidate: true });
    setValue("departmentId", departmentIds[0] || "", { shouldValidate: true });
  };

  // Range helpers
  const updateRange = (index: number, key: string, value: any) => {
    setRanges((prev) =>
      prev.map((range, i) =>
        i === index ? { ...range, [key]: value } : range,
      ),
    );
  };

  const addRange = () => {
    setRanges((prev) => [
      ...prev,
      { start: "17:00", end: "19:00", isActive: true },
    ]);
  };

  const removeRange = (index: number) => {
    if (ranges.length > 1) {
      setRanges((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const onFormSubmit: SubmitHandler<ScheduleFormValues> = (data) => {
    onSubmit(data);
  };

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="card-title font-bold">{title}</h3>
          <p className="card-desc text-slate-500">
            {schedule
              ? "Update weekly consultation timing"
              : "Create new schedule"}
          </p>
        </div>
        <button type="button" onClick={back} className="close-button font-bold">
          Back to Schedules
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm font-bold text-red-500">{error}</p>
      )}

      <form
        onSubmit={handleSubmit(onFormSubmit)}
        className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        {/* Doctor */}
        <div className="block">
          <FormField label="Doctor" required>
            <Controller
              name="practitionerId"
              control={control}
              render={({ field }) => (
                <PractitionerPicker
                  doctors={doctors}
                  value={field.value}
                  onChange={(id) => {
                    field.onChange(id);
                    applyDoctorLinks(id);
                  }}
                />
              )}
            />
            <FormError error={errors.practitionerId?.message} />
          </FormField>
        </div>

        {/* Branch */}
        <FormField label="Branch" required>
          <Controller
            name="branchId"
            control={control}
            render={({ field }) => (
              <>
                {isSingleBranchDoctor ? (
                  <SearchableSelect
                    value={field.value}
                    onChange={() => {}}
                    disabled
                    options={doctorBranches.map((b: any) => ({
                      value: b.id,
                      label: b.name,
                    }))}
                  />
                ) : (
                  <SearchableSelect
                    value={field.value}
                    onChange={field.onChange}
                    required
                    disabled={!selectedDoctorId}
                    options={[
                      ...(doctorBranches.length > 1
                        ? [{ value: ALL_BRANCHES, label: "All branches" }]
                        : []),
                      ...doctorBranches.map((b: any) => ({
                        value: b.id,
                        label: b.name,
                      })),
                    ]}
                  />
                )}
              </>
            )}
          />
          <FormError error={errors.branchId?.message} />
        </FormField>

        {/* Department */}
        <FormField label="Medical Department" required>
          <Controller
            name="departmentId"
            control={control}
            render={({ field }) => (
              <SearchableSelect
                value={field.value}
                onChange={field.onChange}
                disabled={!selectedDoctorId}
                options={
                  selectedDoctor?.department_ids
                    ?.map((id: string) => {
                      const dept = departments.find((d: any) => d.id === id);
                      return dept ? { value: dept.id, label: dept.name } : null;
                    })
                    .filter(Boolean) || []
                }
              />
            )}
          />
          <FormError error={errors.departmentId?.message} />
        </FormField>

        {/* Weekdays */}
        <div className="md:col-span-2 xl:col-span-3">
          <div className="grid gap-3 md:grid-cols-3">
            <FormField label="Weekdays" required>
              <WeekdaySelector
                mode={mode}
                selectedDays={selectedDays}
                onModeChange={(nextMode) => {
                  setMode(nextMode);
                  setValue("weekdayMode", nextMode, {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                }}
                onDaysChange={(days) =>
                  setValue("weekdays", days, {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
              />
              <FormError error={errors.weekdayMode?.message || errors.weekdays?.message} />
            </FormField>

            <div>
              <Controller
                name="slotMinutes"
                control={control}
                render={({ field }) => (
                  <NumberField
                    label="Slot Minutes"
                    {...field}
                    min={1}
                    max={240}
                    required
                  />
                )}
              />
              <FormError error={errors.slotMinutes?.message} />
            </div>
          </div>
        </div>

        {/* Time Ranges */}
        <div className="md:col-span-2 xl:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Time Ranges
            </p>
            <button
              type="button"
              onClick={addRange}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold"
            >
              <Plus size={14} /> Add Range
            </button>
          </div>

          {ranges.map((range, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[1fr_1fr_180px_auto] md:items-end mb-3"
            >
              <Controller
                name={`ranges.${index}.start` as const}
                control={control}
                render={({ field }) => (
                  <TimeField
                    label={`Start Time ${index + 1}`}
                    {...field}
                    required
                  />
                )}
              />
              <Controller
                name={`ranges.${index}.end` as const}
                control={control}
                render={({ field }) => (
                  <TimeField
                    label={`End Time ${index + 1}`}
                    {...field}
                    required
                  />
                )}
              />
              <Controller
                name={`ranges.${index}.isActive` as const}
                control={control}
                render={({ field }) => (
                  <FormField label={`Status ${index + 1}`}>
                    <SearchableSelect
                      value={String(field.value)}
                      onChange={(v) => field.onChange(v === "true")}
                      options={[
                        { value: "true", label: "Active" },
                        { value: "false", label: "Inactive" },
                      ]}
                    />
                  </FormField>
                )}
              />
              <button
                type="button"
                onClick={() => removeRange(index)}
                disabled={ranges.length === 1}
                className="close-button bg-white px-3 text-sm font-bold disabled:text-slate-300"
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <FormError error={errors.ranges?.message} />
        </div>

        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3">
          <Button disabled={busy} type="submit" className="save-button">
            <ButtonLoader loading={busy}>
              {busy
                ? "Saving..."
                : schedule
                  ? "Save Schedule"
                  : "Create Schedule"}
            </ButtonLoader>
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
