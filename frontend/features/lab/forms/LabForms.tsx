"use client";

import { Controller, useForm } from "react-hook-form";
import { LabOrderFormValues, labOrderSchema } from "../lab.schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input, Button, ActionButton } from "@/app/components/common/ui";
import { DateField, FormField } from "@/app/components/FormElements";
import { FormError } from "@/app/components/common/FormError";
import { SearchPicker } from "@/app/components/clinicalRows";
import { PatientSearchSelect } from "@/features/patients/components/PatientSearchSelect";
import type { ApiSession } from "@/lib/api";
import { today } from "@/utils/helper";
import { SourceReferralFields } from "@/app/components/common/SourceReferralFields";

type LabOrderFormProps = {
  apiSession: ApiSession;
  patients?: any[];
  busy: boolean;
  testOptions: any[];
  testSearch: string;
  selectedAvailableTestId: string;
  onTestSearchChange: (text: string) => void;
  onTestSelect: (id: string, test: any) => void;
  onUseTypedTest: (text: string) => void;
  getTestSearchText: (test: any) => string;
  testLoading: boolean;
  selectedSupplierName: string;
  selectedSupplierPrice: string;
  selectedTestMrp: string;
  selectedTestSelling: string;
  onAddTest: () => void;
  orderTests: any[];
  onRemoveTest: (index: number) => void;
  onSubmit: (
    data: LabOrderFormValues,
  ) => void | boolean | Promise<void | boolean>;
};

export function LabOrderForm({
  apiSession,
  patients = [],
  busy,
  testOptions,
  testSearch,
  selectedAvailableTestId,
  onTestSearchChange,
  onTestSelect,
  onUseTypedTest,
  getTestSearchText,
  testLoading,
  selectedSupplierName,
  selectedSupplierPrice,
  selectedTestMrp,
  selectedTestSelling,
  onAddTest,
  orderTests,
  onRemoveTest,
  onSubmit,
}: LabOrderFormProps) {
  const {
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LabOrderFormValues>({
    resolver: zodResolver(labOrderSchema),
    defaultValues: {
      patient_id: "",
      order_date: today(),
      acquisition_source: "direct",
      referrer_patient_id: "",
      referrer_name: "",
    },
  });

  const acquisitionSource = watch("acquisition_source");
  const referrerPatientId = watch("referrer_patient_id") || "";
  const referrerName = watch("referrer_name") || "";

  const submitOrder = handleSubmit(async (data) => {
    const result = await onSubmit(data);
    if (result !== false) {
      reset({
        patient_id: data.patient_id,
        order_date: today(),
        acquisition_source: "direct",
        referrer_patient_id: "",
        referrer_name: "",
      });
    }
  });

  return (
    <form
      onSubmit={submitOrder}
      className="mt-4 grid gap-3 md:grid-cols-5 lg:grid-cols-6"
    >
      <FormField label="Patient" required className="md:col-span-2">
        <Controller
          name="patient_id"
          control={control}
          render={({ field }) => (
            <PatientSearchSelect
              apiSession={apiSession}
              initialPatients={patients}
              required
              value={field.value}
              onChange={field.onChange}
              placeholder="Select patient"
              searchPlaceholder="Search patient by name, mobile, or number"
              className="text-xs md:col-span-2"
            />
          )}
        />
        <FormError error={errors.patient_id?.message} />
      </FormField>

      <Controller
        name="order_date"
        control={control}
        render={({ field }) => (
          <DateField
            label="Date"
            required
            value={field.value}
            onChange={field.onChange}
            error={errors.order_date?.message}
          />
        )}
      />

      <SourceReferralFields
        apiSession={apiSession}
        patients={patients}
        source={acquisitionSource}
        onSourceChange={(value) =>
          setValue(
            "acquisition_source",
            value as LabOrderFormValues["acquisition_source"],
          )
        }
        referrerName={referrerName}
        referrerPatientId={referrerPatientId}
        onReferrerChange={(name, patientId) => {
          setValue("referrer_name", name, { shouldValidate: true });
          setValue("referrer_patient_id", patientId);
        }}
        sourceError={errors.acquisition_source?.message}
        referrerError={errors.referrer_name?.message}
      />

      <FormField label="Lab Test / Service" required className="md:col-span-2">
        <SearchPicker
          value={selectedAvailableTestId}
          inputValue={testSearch}
          onInputValueChange={onTestSearchChange}
          onChange={onTestSelect}
          options={testOptions}
          placeholder="Type lab test name"
          onUseTyped={onUseTypedTest}
          getSearchText={getTestSearchText}
          loading={testLoading}
        />
      </FormField>

      <FormField label="Supplier">
        <Input
          value={selectedSupplierName}
          onChange={() => undefined}
          disabled
        />
      </FormField>
      <FormField label="Supplier Price">
        <Input
          value={selectedSupplierPrice}
          onChange={() => undefined}
          disabled
        />
      </FormField>
      <FormField label="MRP">
        <Input value={selectedTestMrp} onChange={() => undefined} disabled />
      </FormField>
      <FormField label="Rate">
        <Input
          value={selectedTestSelling}
          onChange={() => undefined}
          disabled
        />
      </FormField>

      <div className="flex items-end gap-2 rounded-lg w-fit col-span-2">
        <ActionButton
          type="button"
          onClick={onAddTest}
          className="close-button"
        >
          Add
        </ActionButton>

        {orderTests.length > 0 && (
          <Button type="submit" disabled={busy} className="save-button">
            {busy ? "Saving..." : "Create Order"}
          </Button>
        )}
      </div>

      {orderTests.length > 0 && (
        <div className="md:col-span-5 lg:col-span-6 flex flex-wrap gap-2">
          {orderTests.map((test: any, index: number) => (
            <div
              key={`${test.name}-${index}`}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
            >
              <span>{test.name}</span>
              <button
                type="button"
                aria-label="Remove"
                title="Remove"
                className="grid h-7 w-7 place-items-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50"
                onClick={() => onRemoveTest(index)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </form>
  );
}
import { Trash2 } from "lucide-react";
