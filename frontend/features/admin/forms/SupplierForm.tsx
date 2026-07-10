import { useForm } from "react-hook-form";
import { Actions } from "../components/Actions";
import { Header } from "../components/Header";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card,Input, SearchableSelect  } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { useEffect } from "react";
import { SupplierFormValues, supplierSchema } from "../settings.schema";
import { statusOptions } from "../options";


export function SupplierForm({ title, supplier, busy, onSubmit, back }: any) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: supplier?.name || "",
      gstin: supplier?.gstin || "",
      phone: supplier?.phone || "",
      email: supplier?.email || "",
      address: supplier?.address || "",
      isActive: String(supplier?.is_active ?? true),
    },
  });

  useEffect(() => {
    reset({
      name: supplier?.name || "",
      gstin: supplier?.gstin || "",
      phone: supplier?.phone || "",
      email: supplier?.email || "",
      address: supplier?.address || "",
      isActive: String(supplier?.is_active ?? true),
    });
  }, [supplier, reset]);
  return (
    <Card>
      <Header
        title={title}
        subtitle={
          supplier?.id ||
          "Suppliers can be used by medicines, lab tests, Service, and physiotherapy equipment."
        }
        back={back}
      />
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-4 grid gap-3 md:grid-cols-2"
      >
        <FormField label="Supplier Name">
          <Input {...register("name")} placeholder="Enter supplier name" />
          {errors.name && (
            <p className="text-xs text-red-500">{errors.name.message}</p>
          )}
        </FormField>
        <FormField label="GSTIN">
          <Input {...register("gstin")} placeholder="Enter GSTIN" />
          {errors.gstin && (
            <p className="text-xs text-red-500">{errors.gstin.message}</p>
          )}
        </FormField>
        <FormField label="Phone">
          <Input
            mobileNumber
            {...register("phone")}
            placeholder="Enter supplier mobile number"
          />
          {errors.phone && (
            <p className="text-xs text-red-500">{errors.phone.message}</p>
          )}
        </FormField>
        <FormField label="Email">
          <Input {...register("email")} placeholder="Enter supplier email" />
          {errors.email && (
            <p className="text-xs text-red-500">{errors.email.message}</p>
          )}
        </FormField>
        {supplier && (
          <FormField label="Status">
            <SearchableSelect
              value={watch("isActive")}
              onChange={(value) =>
                setValue("isActive", value, {
                  shouldValidate: true,
                })
              }
              searchable={false}
              options={statusOptions}
            />
          </FormField>
        )}
        <div className="md:col-span-2">
          <FormField label="Address">
            <Input
              {...register("address")}
              placeholder="Enter supplier address"
            />
            {errors.address && (
              <p className="text-xs text-red-500">{errors.address.message}</p>
            )}
          </FormField>
        </div>
        <Actions
          busy={busy}
          back={back}
          label={supplier ? "Save Supplier" : "Create Supplier"}
        />
      </form>
    </Card>
  );
}
