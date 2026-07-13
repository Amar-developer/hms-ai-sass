import { useForm } from "react-hook-form";
import { Actions } from "../components/Actions";
import { Header } from "../components/Header";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card,Input, SearchableSelect  } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { DiscountOfferFormValues, discountOfferSchema } from "../settings.schema";
import { useEffect } from "react";
import { serviceScopes } from "../constants";
import { discountTypeOptions } from "../options";

export function DiscountOfferForm({
  title,
  offer,
  branches,
  busy,
  onSubmit,
  back,
}: any) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<DiscountOfferFormValues>({
    resolver: zodResolver(discountOfferSchema),
    defaultValues: {
      name: offer?.name || "",
      code: offer?.code || "",
      branchId: offer?.branchId || "",
      serviceScope: offer?.serviceScope || "all",
      discountType: offer?.discountType || "percentage",
      value: offer?.value ?? 0,
      minimumBillAmount: offer?.minimumBillAmount ?? 0,
      maxDiscountAmount: offer?.maxDiscountAmount ?? 0,
      validFrom: offer?.validFrom || "",
      validUntil: offer?.validUntil || "",
      isActive: String(offer?.is_active ?? true),
    },
  });

  useEffect(() => {
    reset({
      name: offer?.name || "",
      code: offer?.code || "",
      branchId: offer?.branch_id || "",
      serviceScope: offer?.service_scope || "all",
      discountType: offer?.discount_type || "percentage",
      value: offer?.value ?? 0,
      minimumBillAmount: offer?.minimum_bill_amount ?? 0,
      maxDiscountAmount: offer?.max_discount_amount ?? 0,
      validFrom: offer?.valid_from || "",
      validUntil: offer?.valid_until || "",
      isActive: String(offer?.is_active ?? true),
    });
  }, [offer, reset]);
  return (
    <Card>
      <Header
        title={title}
        subtitle="Offers can be applied to consultation, lab, pharmacy, or item invoices with an optional minimum bill amount."
        back={back}
      />
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-4 grid gap-3 md:grid-cols-2"
      >
        <FormField label="Offer Name" required>
          <Input
            {...register("name")}
            placeholder="Enter offer name"
          />
        </FormField>
        <FormField label="Code">
          <Input {...register("code")}  />
        </FormField>
        <FormField label="Branch">
          <SearchableSelect
            value={watch("branchId")}
            onChange={(value) => setValue("branchId", value)}
            searchable={branches.length > 8}
            placeholder="All branches"
            options={[
              { value: "", label: "All branches" },
              ...branches.map((branch: any) => ({
                value: branch.id,
                label: branch.name,
              })),
            ]}
          />
        </FormField>
        <FormField label="Service Scope">
          <SearchableSelect
            name="serviceScope"
            value={watch("serviceScope")}
            onChange={(value) => setValue("serviceScope", value)}
            searchable={false}
            options={serviceScopes.map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </FormField>
        <FormField label="Discount Type">
          <SearchableSelect
            name="discountType"
            value={watch("discountType")}
            onChange={(value) => setValue("discountType", value)}
            searchable={false}
            options={discountTypeOptions}
          />
        </FormField>
        <FormField label="Value" required>
          <Input {...register("value")}  />
        </FormField>
        <FormField label="Minimum Bill Amount">
          <Input {...register("minimumBillAmount")}  />
        </FormField>
        <FormField label="Max Discount">
          <Input {...register("maxDiscountAmount")}  />
        </FormField>
        <FormField label="Valid From">
          <Input
            {...register("validFrom")}
            type="date"

          />
        </FormField>
        <FormField label="Valid Until">
          <Input
            {...register("validUntil")}
            type="date"

          />
        </FormField>
        {offer && (
          <FormField label="Status">
            <SearchableSelect
              name="isActive"
              value={watch("isActive")}
              onChange={(value) => setValue("isActive", value)}
              searchable={false}
              options={[
                { value: "true", label: "Active" },
                { value: "false", label: "Inactive" },
              ]}
            />
          </FormField>
        )}
        <Actions
          busy={busy}
          back={back}
          label={offer ? "Save Offer" : "Create Offer"}
        />
      </form>
    </Card>
  );
}
