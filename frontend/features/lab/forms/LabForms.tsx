"use client";

import { Controller, useForm } from "react-hook-form";
import { LabOrderFormValues, labOrderSchema } from "../lab.schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input, SearchableSelect, Button, ActionButton } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { FormError } from "@/app/components/common/FormError";
import { SearchPicker } from "@/app/components/clinicalRows";
import { PatientSearchSelect } from "@/features/patients/components/PatientSearchSelect";
import type { ApiSession } from "@/lib/api";



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
    register,
    reset,
    watch,
    formState: { errors },
  } = useForm<LabOrderFormValues>({
    resolver: zodResolver(labOrderSchema),
    defaultValues: {
      patient_id: "",
      source: "op_direct",
      external_referrer: "",
    },
  });

  const source = watch("source");

  const submitOrder = handleSubmit(async (data) => {
    const result = await onSubmit(data);
    if (result !== false) {
      reset({
        patient_id: data.patient_id,
        source: "op_direct",
        external_referrer: "",
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

      <FormField label="Source">
        <Controller
          name="source"
          control={control}
          render={({ field }) => (
            <SearchableSelect
              value={field.value}
              onChange={field.onChange}
              searchable={false}
              options={[
                { value: "op_direct", label: "OP Direct" },
                { value: "external_referral", label: "External Referral" },
              ]}
            />
          )}
        />
      </FormField>

      {source === "external_referral" && (
        <FormField label="External Referrer" required>
          <Input
            required
            {...register("external_referrer")}
            placeholder="Referring doctor / lab name"
          />
          <FormError error={errors.external_referrer?.message} />
        </FormField>
      )}

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
        <Input value={selectedSupplierName} onChange={() => undefined} disabled />
      </FormField>
      <FormField label="Supplier Price">
        <Input value={selectedSupplierPrice} onChange={() => undefined} disabled />
      </FormField>
      <FormField label="MRP">
        <Input value={selectedTestMrp} onChange={() => undefined} disabled />
      </FormField>
      <FormField label="Rate">
        <Input value={selectedTestSelling} onChange={() => undefined} disabled />
      </FormField>

      <div className="flex items-end gap-2 rounded-lg w-fit col-span-2">
        <ActionButton type="button" onClick={onAddTest} className="close-button">
          Add
        </ActionButton>

        <Button type="submit" disabled={busy} className="save-button">
          {busy ? "Saving..." : "Create Order"}
        </Button>
      </div>

      {orderTests.length > 0 && (
        <div className="md:col-span-5 lg:col-span-6 flex flex-wrap gap-2">
          {orderTests.map((test: any, index: number) => (
            <button
              key={`${test.name}-${index}`}
              type="button"
              onClick={() => onRemoveTest(index)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
            >
              {test.name} ×
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
