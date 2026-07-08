"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { bookingSchema, BookingFormValues } from "../validations/homecare.schema";
import {
  DateField,
  FormField,
  NumberField,
  SearchableSelectField,
  TextareaField,
} from "@/app/components/FormElements";
import {
  ActionButton,
  Button,
  Card,
  Input,
  SearchableSelect,
} from "@/app/components/common/ui";
import { FormError } from "@/app/components/common/FormError";
import { PatientLookupField } from "@/app/components/patient/PatientLookupCreate";
import { displayDate, today } from "@/utils/helper";
import { bookingTypeOptions, emptyLine, recurrenceOptions, statuses } from "@/utils/homecare/constants";
import {
  dayCount,
  money,
  patientSearchLabel,
  recurrenceEndDate,
} from "@/utils/homecare/helpers";

const homeCareHourPrices: Record<string, string> = {
  "2": "500",
  "4": "800",
  "8": "1000",
  "10": "1100",
  "12": "1200",
  "24": "1500",
};

const homeCareHourOptions = Object.entries(homeCareHourPrices).map(
  ([value, price]) => ({
    value,
    label: `${value} hours - ${money(price)}`,
  }),
);

function patientLocation(patient: any) {
  return [
    patient?.address,
    patient?.area,
    patient?.city,
    patient?.district,
    patient?.state,
    patient?.pincode,
    patient?.pin_code,
  ]
    .filter(Boolean)
    .join(", ");
}

type BookingFormProps = {
  patients: any[];
  services: any[];
  visitServices: any[];
  serviceLoadError: string;
  editing?: any;
  branchId?: string;
  busy: boolean;
  patientCreateBusy: boolean;
  lineItems: any[];
  setLineItems: (updater: any) => void;
  onCreatePatient: (data: any) => Promise<any>;
  onSubmit: (data: BookingFormValues) => void | boolean | Promise<void | boolean>;
  onCancel: () => void;
};

export function BookingForm({
  patients,
  services,
  visitServices,
  serviceLoadError,
  editing,
  branchId,
  busy,
  patientCreateBusy,
  lineItems,
  setLineItems,
  onCreatePatient,
  onSubmit,
  onCancel,
}: BookingFormProps) {
  const [patientSearch, setPatientSearch] = useState("");
  const [lookupPatient, setLookupPatient] = useState<any>(null);

  const {
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      patient_id: "",
      booking_type: "home_care",
      recurrence: "daily",
      start_date: today(),
      end_date: today(),
      status: "requested",
      location: "",
      notes: "",
    },
  });

  // Reset the whole form (and the local patient-lookup state) whenever we
  // start editing a different booking, or drop back to creating a new one.
  useEffect(() => {
    if (editing) {
      const isVisitBooking = editing.booking_type
        ? editing.booking_type === "home_visit"
        : editing.services?.some((row: any) => {
            const service = services.find(
              (item: any) => item.id === row.service_id,
            );
            return String(service?.code || "")
              .toUpperCase()
              .startsWith("HV");
          });
      reset({
        patient_id: editing.patient_id || "",
        booking_type: isVisitBooking ? "home_visit" : "home_care",
        recurrence: editing.recurrence || "daily",
        start_date: editing.start_date || today(),
        end_date: editing.end_date || "",
        status: editing.status || "requested",
        location: editing.location || "",
        notes: editing.notes || "",
      });
      const bookingPatient = patients.find(
        (p: any) => p.id === editing.patient_id,
      );
      setLookupPatient(bookingPatient || null);
      setPatientSearch(patientSearchLabel(bookingPatient));
    } else {
      reset({
        patient_id: "",
        booking_type: "home_care",
        recurrence: "daily",
        start_date: today(),
        end_date: today(),
        status: "requested",
        location: "",
        notes: "",
      });
      setLookupPatient(null);
      setPatientSearch("");
    }
  }, [editing, services, patients, reset]);

  const patientId = watch("patient_id");
  const bookingType = watch("booking_type");
  const recurrence = watch("recurrence");
  const startDate = watch("start_date");
  const endDate = watch("end_date");

  const isHomeVisitBooking = bookingType === "home_visit";
  const visibleServices = isHomeVisitBooking ? visitServices : [];
  const days = dayCount(startDate, endDate);
  const formLineTotal = lineItems.reduce(
    (sum: number, row: any) =>
      sum +
      (isHomeVisitBooking
        ? Number(row.quantity || 0) * Number(row.unit_amount || 0) * days
        : Number(row.unit_amount || 0) * days),
    0,
  );

  // Auto-compute the end date from recurrence, unless the user picked "custom".
  useEffect(() => {
    if (recurrence === "custom") return;
    setValue("end_date", recurrenceEndDate(startDate, recurrence));
  }, [startDate, recurrence, setValue]);

  const selectedLookupPatient =
    (patientId && patients.find((p: any) => p.id === patientId)) ||
    lookupPatient;

  function selectPatient(patient: any) {
    const location = patientLocation(patient);
    setLookupPatient(patient);
    setValue("patient_id", patient.id);
    if (location) setValue("location", location);
    setPatientSearch(patientSearchLabel(patient));
  }

  function changeBookingType(value: "home_care" | "home_visit") {
    setValue("booking_type", value);
    const isVisit = value === "home_visit";
    const firstVisitService = visitServices[0];
    setLineItems([
      isVisit && firstVisitService
        ? {
            ...emptyLine,
            quantity: "1",
            service_id: firstVisitService.id,
            description: firstVisitService.name,
            unit_amount: String(firstVisitService.default_price || 0),
          }
        : isVisit
          ? { ...emptyLine, quantity: "1", unit_amount: "0" }
          : { ...emptyLine },
    ]);
  }

  function setLine(index: number, key: string, value: any) {
    setLineItems((rows: any[]) =>
      rows.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, [key]: value };
        if (key === "service_id") {
          const service = services.find((item: any) => item.id === value);
          next.description = service?.name || "";
          next.unit_amount = String(service?.default_price || 0);
        }
        if (
          !isHomeVisitBooking &&
          key === "quantity" &&
          homeCareHourPrices[String(value)]
        ) {
          next.unit_amount = homeCareHourPrices[String(value)];
        }
        return next;
      }),
    );
  }

  function addLine() {
    setLineItems((rows: any[]) => [...rows, { ...emptyLine }]);
  }

  function removeLine(index: number) {
    setLineItems((rows: any[]) => rows.filter((_: any, i: number) => i !== index));
  }

  const submitBooking = handleSubmit(async (data) => {
    const result = await onSubmit(data);
    if (result !== false) {
      reset({
        patient_id: "",
        booking_type: "home_care",
        recurrence: "daily",
        start_date: today(),
        end_date: today(),
        status: "requested",
        location: "",
        notes: "",
      });
      setLookupPatient(null);
      setPatientSearch("");
    }
  });

  return (
    <Card>
      <div className="flex justify-between gap-3">
        <div>
          <h3 className="card-title font-bold">
            {editing ? "Edit Booking" : "New Booking"}
          </h3>
          <p className="card-desc text-slate-500">
            Patient-linked home care / visit plan with location, service
            lines, and schedule.
          </p>
        </div>
        <ActionButton onClick={onCancel}>Back to list</ActionButton>
      </div>
      <div className="mt-5">
        <PatientLookupField
          label="Patient Search"
          patients={patients}
          searchValue={patientSearch}
          onSearchChange={(value: string) => {
            setPatientSearch(value);
            if (patientId) {
              setValue("patient_id", "");
              setLookupPatient(null);
            }
          }}
          selectedPatient={selectedLookupPatient}
          onSelect={selectPatient}
          onClear={() => {
            setValue("patient_id", "");
            setPatientSearch("");
            setLookupPatient(null);
          }}
          onCreatePatient={onCreatePatient}
          branches={branchId ? [{ id: branchId, name: "Current branch" }] : []}
          defaultBranchId={branchId}
          busy={patientCreateBusy}
          required={!patientId}
          placeholder="Search patient name or mobile number"
          createDescription="Save this record to select the patient and continue the booking."
        />
        <FormError error={errors.patient_id?.message} />
      </div>
      <form onSubmit={submitBooking} className="mt-3 grid gap-3 md:grid-cols-4">
        <FormField label="Booking Type">
          <Controller
            name="booking_type"
            control={control}
            render={({ field }) => (
              <SearchableSelect
                value={field.value}
                onChange={changeBookingType}
                options={bookingTypeOptions.map(([value, label]) => ({
                  value,
                  label,
                }))}
                placeholder="Select booking type"
                searchable={false}
              />
            )}
          />
        </FormField>

        <FormField label="Recurrence">
          <Controller
            name="recurrence"
            control={control}
            render={({ field }) => (
              <SearchableSelect
                value={field.value}
                onChange={field.onChange}
                options={recurrenceOptions.map(([value, label]) => ({
                  value,
                  label,
                }))}
                placeholder="Select recurrence"
                searchable={false}
              />
            )}
          />
        </FormField>
        <Controller
          name="start_date"
          control={control}
          render={({ field }) => (
            <DateField
              label="Start Date"
              value={field.value}
              onChange={field.onChange}
              error={errors.start_date?.message}
            />
          )}
        />
        <Controller
          name="end_date"
          control={control}
          render={({ field }) => (
            <DateField
              label="End Date"
              value={field.value || ""}
              onChange={field.onChange}
              disabled={recurrence !== "custom"}
            />
          )}
        />

        <FormField label="Status">
          <Controller
            name="status"
            control={control}
            render={({ field }) => (
              <SearchableSelect
                value={field.value}
                onChange={field.onChange}
                options={statuses.map(([value, label]) => ({
                  value,
                  label,
                }))}
                placeholder="Select status"
                searchable={false}
              />
            )}
          />
        </FormField>
        <div className="grid gap-3 md:col-span-4 md:grid-cols-2">
          <Controller
            name="location"
            control={control}
            render={({ field }) => (
              <TextareaField
                label="Location"
                value={field.value || ""}
                onChange={field.onChange}
                placeholder="Patient address or manual location"
                rows={3}
              />
            )}
          />
          <Controller
            name="notes"
            control={control}
            render={({ field }) => (
              <TextareaField
                label="Notes"
                value={field.value || ""}
                onChange={field.onChange}
                rows={3}
              />
            )}
          />
        </div>
        <div className="md:col-span-4 rounded-2xl bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase text-slate-500">
              {isHomeVisitBooking ? "Home Visit Service" : "Home Care Services"}
              <span className="ml-2 normal-case text-slate-400">
                {isHomeVisitBooking
                  ? serviceLoadError
                    ? serviceLoadError
                    : visibleServices.length
                      ? `${visibleServices.length} loaded: ${visibleServices
                          .slice(0, 3)
                          .map((service: any) => service.name)
                          .join(", ")}`
                      : "0 loaded"
                  : "Manual hourly service entry"}
              </span>
            </p>
            {!isHomeVisitBooking && (
              <ActionButton onClick={addLine}>Add Service</ActionButton>
            )}
          </div>
          <div className="space-y-3">
            {lineItems.map((line, index) => (
              <div
                key={index}
                className={
                  isHomeVisitBooking
                    ? "grid gap-3 rounded-xl bg-white p-3 md:grid-cols-[1.4fr_.65fr_.75fr_auto]"
                    : "grid gap-3 rounded-xl bg-white p-3 md:grid-cols-[1.6fr_.55fr_.75fr_auto]"
                }
              >
                {isHomeVisitBooking ? (
                  <SearchableSelectField
                    label="Visit Service"
                    value={line.service_id}
                    onChange={(value) => setLine(index, "service_id", value)}
                    options={[
                      { value: "", label: "Select home visit service" },
                      ...visitServices.map((service: any) => ({
                        value: service.id,
                        label: service.name,
                        sublabel: money(service.default_price),
                      })),
                    ]}
                  />
                ) : (
                  <FormField label="Service Name">
                    <Input
                      value={line.description}
                      onChange={(event: any) =>
                        setLine(index, "description", event.target.value)
                      }
                      placeholder="Type home care service name"
                    />
                  </FormField>
                )}
                {!isHomeVisitBooking && (
                  <FormField label="Hours/Day">
                    <SearchableSelect
                      value={line.quantity}
                      onChange={(value: string) =>
                        setLine(index, "quantity", value)
                      }
                      options={[
                        ...(homeCareHourPrices[String(line.quantity)]
                          ? []
                          : [
                              {
                                value: String(line.quantity || ""),
                                label: `${line.quantity || 0} hours - custom`,
                              },
                            ]),
                        ...homeCareHourOptions,
                      ]}
                      searchable={false}
                    />
                  </FormField>
                )}
                {isHomeVisitBooking && (
                  <NumberField
                    label="Visits/Day"
                    value={line.quantity}
                    onChange={(value) => setLine(index, "quantity", value)}
                    min={1}
                  />
                )}
                <NumberField
                  label={isHomeVisitBooking ? "Visit Price" : "Price"}
                  value={line.unit_amount}
                  onChange={(value) => setLine(index, "unit_amount", value)}
                  min={0}
                />
                <div className="flex items-end">
                  <ActionButton
                    tone="danger"
                    onClick={() => removeLine(index)}
                    disabled={isHomeVisitBooking || lineItems.length === 1}
                  >
                    Remove
                  </ActionButton>
                </div>
                <div className="text-right text-xs text-slate-500 md:col-span-4">
                  <p className="mt-1 text-xs font-bold text-blue-600">
                    × {days} day{days > 1 ? "s" : ""} (
                    {displayDate(startDate)} →{" "}
                    {displayDate(endDate || startDate)})
                  </p>
                  {Number(line.quantity || 0)}{" "}
                  {isHomeVisitBooking ? "visit" : "hr"}
                  {Number(line.quantity || 0) === 1 ? "" : "s"}{" "}
                  {isHomeVisitBooking ? "×" : "-"} {money(line.unit_amount)}{" "}
                  × {days} day
                  {days > 1 ? "s" : ""} ={" "}
                  <b className="text-slate-700">
                    {money(
                      isHomeVisitBooking
                        ? Number(line.quantity || 0) *
                            Number(line.unit_amount || 0) *
                            days
                        : Number(line.unit_amount || 0) * days,
                    )}
                  </b>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end text-sm font-bold text-slate-700">
            Estimated total: {money(formLineTotal)}
          </div>
        </div>
        <div className="flex items-end gap-2 md:col-span-4">
          <Button disabled={busy} className="save-button">
            {busy ? "Saving..." : editing ? "Update Booking" : "Create Booking"}
          </Button>
          <button
            type="button"
            onClick={onCancel}
            className="close-button font-bold"
          >
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
