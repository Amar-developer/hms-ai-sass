import { useEffect, useState } from "react";
import { Button,Card,Select,Field } from "../common/ui";
import { SelectField,TimeField,NumberField } from "../FormElements";
import { PractitionerPicker } from "@/features/scheduling/Shared";
import { ALL_BRANCHES, weekdays } from "@/utils/schedule/constants";
import { Plus, X } from "lucide-react";

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
  const scheduleRows = (
    schedule?.schedules?.length ? schedule.schedules : [schedule].filter(Boolean)
  ).filter((row: any) => row && row.is_active !== false);
  const initialDays = Array.from(
    new Set(scheduleRows.map((row: any) => String(row.weekday ?? 0))),
  ) as string[];
  const initialRanges = Array.from(
    scheduleRows
      .reduce((map: Map<string, any>, row: any) => {
        const start = String(row.start_time || "09:00").slice(0, 5);
        const end = String(row.end_time || "13:00").slice(0, 5);
        const isActive = row.is_active !== false;
        const key = `${start}|${end}`;
        const existing = map.get(key);
        if (existing) existing.isActive = existing.isActive || isActive;
        else map.set(key, { start, end, isActive });
        return map;
      }, new Map<string, any>())
      .values(),
  );
  const [selectedDays, setSelectedDays] = useState<string[]>(
    initialDays.length ? initialDays : [String(schedule?.weekday ?? 0)],
  );
  const [dayToAdd, setDayToAdd] = useState("");
  const [ranges, setRanges] = useState<any[]>(
    initialRanges.length
      ? initialRanges
      : [
          {
            start: String(schedule?.start_time || "09:00").slice(0, 5),
            end: String(schedule?.end_time || "13:00").slice(0, 5),
            isActive: schedule?.is_active !== false,
          },
        ],
  );
  const [selectedDoctorId, setSelectedDoctorId] = useState(
    schedule?.practitioner_id || "",
  );
  const [selectedBranchId, setSelectedBranchId] = useState(
    schedule?.branch_id || "",
  );
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(
    schedule?.department_id || "",
  );
  const [slotMinutes, setSlotMinutes] = useState(
    String(schedule?.slot_minutes || 15),
  );
  const [roomNumber, setRoomNumber] = useState(
    schedule?.room_number ? String(Number(schedule.room_number)) : "",
  );
  const applyDoctorLinks = (doctorId: string) => {
    const doctor = doctors.find((item: any) => item.id === doctorId);
    const branchIds = doctor?.branch_ids || [];
    const departmentIds = doctor?.department_ids || [];
    setSelectedBranchId((current) =>
      current && branchIds.includes(current) ? current : branchIds[0] || "",
    );
    setSelectedDepartmentId((current) =>
      current && departmentIds.includes(current)
        ? current
        : departmentIds[0] || "",
    );
  };
  useEffect(() => {
    if (selectedDoctorId) applyDoctorLinks(selectedDoctorId);
  }, [selectedDoctorId, doctors.length]);
  // Branch options are limited to the branches this doctor is mapped to.
  // Single-branch doctors get a fixed branch (no dropdown); multi-branch
  // doctors can pick a branch or schedule across "All branches".
  const selectedDoctorBranchIds =
    doctors.find((item: any) => item.id === selectedDoctorId)?.branch_ids || [];
  const doctorBranches = branches.filter((branch: any) =>
    selectedDoctorBranchIds.includes(branch.id),
  );
  const isSingleBranchDoctor = doctorBranches.length === 1;
  const addDay = (value: string) => {
    if (value && !selectedDays.includes(value))
      setSelectedDays((current) => [...current, value]);
    setDayToAdd("");
  };
  const removeDay = (value: string) =>
    setSelectedDays((current) =>
      current.length > 1 ? current.filter((item) => item !== value) : current,
    );
  const updateRange = (index: number, key: string, value: any) =>
    setRanges((current) =>
      current.map((range, itemIndex) =>
        itemIndex === index ? { ...range, [key]: value } : range,
      ),
    );
  const addRange = () =>
    setRanges((current) => [
      ...current,
      { start: "17:00", end: "19:00", isActive: true },
    ]);
  const removeRange = (index: number) =>
    setRanges((current) =>
      current.length > 1
        ? current.filter((_, itemIndex) => itemIndex !== index)
        : current,
    );
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="card-title font-bold">{title}</h3>
          <p className="card-desc text-slate-500">
            {schedule ? "Update weekly consultation timing for this doctor." : "Create weekly consultation timing for a doctor."}
          </p>
        </div>
        <button
          type="button"
          onClick={back}
          className="close-button font-bold"
        >
          Back to Schedules
        </button>
      </div>
      <form
        onSubmit={onSubmit}
        className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <div className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Doctor</span>
          <input type="hidden" name="practitionerId" value={selectedDoctorId} />
          <PractitionerPicker
            doctors={doctors}
            value={selectedDoctorId}
            onChange={(doctorId: string) => {
              setSelectedDoctorId(doctorId);
              applyDoctorLinks(doctorId);
            }}
          />
        </div>
        <div>
          <Field label="Branch">
            {isSingleBranchDoctor ? (
              <>
                {/* Single-branch doctor: branch is fixed, not selectable.
                    Disabled selects are excluded from FormData, so mirror the
                    value into a hidden input the submit handler reads. */}
                <input
                  type="hidden"
                  name="branchId"
                  value={selectedBranchId}
                />
                <Select value={selectedBranchId} disabled >
                  {doctorBranches.map((branch: any) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}

                </Select>
              </>
            ) : (
              <Select
                name="branchId"
                value={selectedBranchId}
                onChange={(event: any) => setSelectedBranchId(event.target.value)}
                required
                disabled={!selectedDoctorId}
              >
                <option value="">
                  {selectedDoctorId ? "Select branch" : "Select doctor first"}
                </option>
                {doctorBranches.length > 1 && (
                  <option value={ALL_BRANCHES}>All branches</option>
                )}
                {doctorBranches.map((branch: any) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Medical Department">
          <Select
            name="departmentId"
            value={selectedDepartmentId}
            onChange={(event: any) =>
              setSelectedDepartmentId(event.target.value)
            }
            required
            disabled={!selectedDoctorId}
          >
            <option value="">
              {selectedDoctorId
                ? "Select medical department"
                : "Select doctor first"}
            </option>
            {(doctors.find((item: any) => item.id === selectedDoctorId)
              ?.department_ids || []).map((departmentId: string) => {
                const department = departments.find(
                  (item: any) => item.id === departmentId,
                );
                return department ? (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ) : null;
              })}
          </Select>
        </Field>
        <div className="md:col-span-2 xl:col-span-3">
          <input type="hidden" name="weekday" value={selectedDays[0]} />
          {selectedDays.map((value) => (
            <input key={value} type="hidden" name="weekdays" value={value} />
          ))}
          <div className="grid gap-3 md:grid-cols-[260px_1fr] md:items-end">
            <SelectField
              label="Add Weekday"
              value={dayToAdd}
              onChange={addDay}
              options={[
                { value: "", label: "Select day" },
                ...weekdays
                  .filter(([value]) => !selectedDays.includes(value))
                  .map(([value, label]) => ({ value, label })),
              ]}
            />
            <div className="flex min-h-[50px] flex-wrap items-end gap-2">
              {selectedDays.map((value) => {
                const label =
                  weekdays.find(([day]) => day === value)?.[1] || value;
                return (
                  <span
                    key={value}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white close-button table-data font-bold text-slate-800"
                  >
                    {label}
                    <button
                      type="button"
                      onClick={() => removeDay(value)}
                      className="rounded-full p-1 text-slate-500 hover:bg-white hover:text-red-600"
                      aria-label={`Remove ${label}`}
                    >
                      <X size={14} />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
        <div className="md:col-span-2 xl:col-span-3">
          <input type="hidden" name="rangeCount" value={ranges.length} />
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Time Ranges
            </p>
            <button
              type="button"
              onClick={addRange}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold"
            >
              <Plus size={14} />
              Add Range
            </button>
          </div>
          <div className="grid gap-3">
            {ranges.map((range, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[1fr_1fr_180px_auto] md:items-end"
              >
                <div>
                  <TimeField
                    label={`Start Time ${index + 1}`}
                    value={range.start}
                    onChange={(v) => updateRange(index, "start", v)}
                    required
                  />
                  <input type="hidden" name={`startTime_${index}`} value={range.start} />
                </div>
                <div>
                  <TimeField
                    label={`End Time ${index + 1}`}
                    value={range.end}
                    onChange={(v) => updateRange(index, "end", v)}
                    required
                  />
                  <input type="hidden" name={`endTime_${index}`} value={range.end} />
                </div>
                <div>
                  <SelectField
                    label={`Status ${index + 1}`}
                    value={String(range.isActive)}
                    onChange={(v) => updateRange(index, "isActive", v === "true")}
                    options={[
                      { value: "true", label: "Active" },
                      { value: "false", label: "Inactive" },
                    ]}
                  />
                  <input type="hidden" name={`isActive_${index}`} value={String(range.isActive)} />
                </div>
                <button
                  type="button"
                  onClick={() => removeRange(index)}
                  disabled={ranges.length === 1}
                  className="close-button bg-white px-3 text-sm font-bold text-slate-700 disabled:text-slate-300"
                  aria-label="Remove time range"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div>
          <NumberField
            label="Slot Minutes"
            value={slotMinutes}
            onChange={setSlotMinutes}
            min={1}
            max={240}
          />
          <input type="hidden" name="slotMinutes" value={slotMinutes} />
        </div>
        <div>
          <NumberField
            label="Room Number"
            value={roomNumber}
            onChange={setRoomNumber}
            min={1}
            max={999}
            placeholder="012"
          />
          <input type="hidden" name="roomNumber" value={roomNumber} />
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3">
          <Button disabled={busy} className='save-button'>
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
