import { PractitionerPicker } from "../components/PractitionerPicker";
import { useEffect, useState } from "react";
import { ALL_BRANCHES,weekdays } from "../constants";
import { FormField,NumberField,TextField, TimeField } from "@/app/components/FormElements";
import { Plus, X } from "lucide-react";
import { Card, Button, SearchableSelect, Field } from "@/app/components/common/ui";
import { useForm, Controller, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ScheduleFormValues, scheduleSchema } from "../schedule.schema";
import { FormError } from "../../../app/components/common/FormError";

export function ScheduleForm({
  title,
  schedule,
  branches,
  departments,
  doctors,
  busy,
  onSubmit,
  back,
}: any) {
  const defaultRanges = schedule?.schedules?.length
    ? schedule.schedules
        .filter((row: any) => row.is_active !== false)
        .map((row: any) => ({
          start: String(row.start_time || "09:00").slice(0, 5),
          end: String(row.end_time || "13:00").slice(0, 5),
          isActive: row.is_active !== false,
        }))
    : [
        {
          start: String(schedule?.start_time || "09:00").slice(0, 5),
          end: String(schedule?.end_time || "13:00").slice(0, 5),
          isActive: schedule?.is_active !== false,
        },
      ];

// Add this before useForm
const defaultWeekdays: string[] = Array.from(
  new Set(
    (schedule?.schedules || [schedule])
      .filter(Boolean)
      .map((row: any) => String(row?.weekday ?? 0))
  )
);

// Then in defaultValues:
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      practitionerId: schedule?.practitioner_id || "",
      branchId: schedule?.branch_id || "",
      departmentId: schedule?.department_id || "",
     weekdays: defaultWeekdays.length ? defaultWeekdays : [String(schedule?.weekday ?? 0)],
      ranges: defaultRanges.length
        ? defaultRanges
        : [{ start: "09:00", end: "13:00", isActive: true }],
      slotMinutes: String(schedule?.slot_minutes || 15),
      roomNumber: schedule?.room_number ? String(schedule.room_number) : "",
    },
  });

  const [selectedDays, setSelectedDays] = useState<string[]>(defaultWeekdays);
  const [ranges, setRanges] = useState(defaultRanges);
  const [dayToAdd, setDayToAdd] = useState("");

  const selectedDoctorId = watch("practitionerId");
  const selectedBranchId = watch("branchId");
  const selectedDepartmentId = watch("departmentId");

  // Sync local state → RHF
  useEffect(() => {
    setValue("weekdays", selectedDays, { shouldValidate: true });
  }, [selectedDays, setValue]);

  useEffect(() => {
    setValue("ranges", ranges, { shouldValidate: true });
  }, [ranges, setValue]);

  const selectedDoctor = doctors.find((d: any) => d.id === selectedDoctorId);
  const doctorBranchIds = selectedDoctor?.branch_ids || [];
  const doctorBranches = branches.filter((b: any) =>
    doctorBranchIds.includes(b.id),
  );
  const isSingleBranchDoctor = doctorBranches.length === 1;

  const applyDoctorLinks = (doctorId: string) => {
    const doctor = doctors.find((item: any) => item.id === doctorId);
    if (!doctor) return;

    const branchIds = doctor.branch_ids || [];
    const departmentIds = doctor.department_ids || [];

    setValue("branchId", branchIds[0] || "", { shouldValidate: true });
    setValue("departmentId", departmentIds[0] || "", { shouldValidate: true });
  };

  useEffect(() => {
    if (selectedDoctorId) applyDoctorLinks(selectedDoctorId);
  }, [selectedDoctorId]);

  // Weekday helpers
  const addDay = (value: string) => {
    if (value && !selectedDays.includes(value)) {
      setSelectedDays((prev) => [...prev, value]);
    }
    setDayToAdd("");
  };

  const removeDay = (value: string) => {
    if (selectedDays.length > 1) {
      setSelectedDays((prev) => prev.filter((d) => d !== value));
    }
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
    onSubmit(data); // Now properly typed
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

      <form
        onSubmit={handleSubmit(onFormSubmit)}
        className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        {/* Doctor */}
        <div className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
            Doctor
          </span>
          <Controller
            name="practitionerId"
            control={control}
            render={({ field }) => (
              <PractitionerPicker
                doctors={doctors}
                value={field.value}
                onChange={(id) => {
                  field.onChange(id);
                }}
              />
            )}
          />
          <FormError error={errors.practitionerId?.message} />
        </div>

        {/* Branch */}
        <Field label="Branch">
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
        </Field>

        {/* Department */}
        <Field label="Medical Department">
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
        </Field>

        {/* Weekdays */}
        <div className="md:col-span-2 xl:col-span-3">
          <div className="grid gap-3 md:grid-cols-[260px_1fr] md:items-end">
            <FormField label="Add Weekday">
              <SearchableSelect
                value={dayToAdd}
                onChange={addDay}
                options={[
                  { value: "", label: "Select day" },
                  ...weekdays
                    .filter(([v]) => !selectedDays.includes(v))
                    .map(([value, label]) => ({ value, label })),
                ]}
              />
            </FormField>

            <div className="flex min-h-[40px] flex-wrap items-end gap-2">
              {selectedDays.map((value) => {
                const label =
                  weekdays.find(([day]) => day === value)?.[1] || value;
                return (
                  <span
                    key={value}
                    className="inline-flex items-center gap-2 border border-slate-200 bg-white rounded-lg px-4 py-2.5 text-sm font-bold text-slate-800"
                  >
                    {label}
                    <button
                      type="button"
                      onClick={() => removeDay(value)}
                      className="text-slate-500 hover:text-red-600"
                    >
                      <X size={14} />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
          <FormError error={errors.weekdays?.message} />
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

        {/* Slot Minutes & Room */}
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

        <div>
          <Controller
            name="roomNumber"
            control={control}
            render={({ field }) => (
              <NumberField
                label="Room Number"
                {...field}
                min={1}
                placeholder="012"
              />
            )}
          />
          <FormError error={errors.roomNumber?.message} />
        </div>

        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3">
          <Button disabled={busy} type="submit" className="save-button">
            {busy
              ? "Saving..."
              : schedule
                ? "Save Schedule"
                : "Create Schedule"}
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
