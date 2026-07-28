import { PlanFormInput } from "@/features/admin/settings.schema";
import { PlanFormValues } from "@/features/admin/settings.schema";
import { planSchema } from "@/features/admin/settings.schema";
import { normalizePharmacySlabs } from "../helpers";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Card, Input, Button } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { PharmacySlabEditor } from "./PharmacySlabEditor";
import { BenefitPicker } from "./BenefitPicker";
import { FormError } from "@/app/components/common/FormError";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";

export function PlanForm({
  title,
  plan,
  busy,
  submitLabel,
  onSubmit,
  back,
  labTests,
  medicines,
  departments,
  freeConsultDeptIds,
  setFreeConsultDeptIds,
  freeLabTestIds,
  setFreeLabTestIds,
  freeLabQuantities,
  setFreeLabQuantities,
  discountedLabTestIds,
  setDiscountedLabTestIds,
  freeMedicineIds,
  setFreeMedicineIds,
  freeMedicineQuantities,
  setFreeMedicineQuantities,
  discountedMedicineIds,
  setDiscountedMedicineIds,
  apiSession,
}: any) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PlanFormValues, PlanFormInput, any>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: plan?.name ?? "",
      code: plan?.code ?? "",
      priceAmount: plan?.price_amount ?? 0,
      durationDays: plan?.duration_days ?? 0,
      activationAfterDays: plan?.activation_after_days ?? 0,
      freeConsultations: plan?.free_consultations ?? 0,
      labDiscount: plan?.lab_discount_percentage ?? 0,
      pharmacyDiscount: plan?.pharmacy_discount_percentage ?? 0,
      minDiscountAmount: plan?.min_discount_amount ?? 0,
    },
  });
  const [pharmacySlabs, setPharmacySlabs] = useState<any[]>(() =>
    normalizePharmacySlabs(plan?.pharmacy_discount_slabs || []),
  );
  const departmentOptions = (departments || []).map((d: any) => ({
    value: d.id,
    label: d.name,
  }));
  useEffect(() => {
    setPharmacySlabs(
      normalizePharmacySlabs(plan?.pharmacy_discount_slabs || []),
    );
  }, [plan?.id]);

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="card-title font-bold">{title}</h3>
          <p className="card-desc text-slate-500">
            {plan
              ? "Update this membership plan."
              : "Create one tenant-scoped membership plan for all branches."}
          </p>
        </div>
        <button type="button" onClick={back} className="close-button font-bold">
          Back to Plans
        </button>
      </div>
      <form
        onSubmit={(event) => {
          const form = event.currentTarget;
          void handleSubmit(() => onSubmit(form))(event);
        }}
        className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"
      >
        <FormField label="Plan Name">
          <Input {...register("name")} placeholder="Membership plan name" />
          {errors.name && <FormError error={errors.name?.message} />}
        </FormField>
        <FormField label="Code">
          <Input {...register("code")} placeholder="Optional plan code" />
          {errors.code && <FormError error={errors.code?.message} />}
        </FormField>
        <FormField label="Price">
          <Input
            {...register("priceAmount", {
              valueAsNumber: true,
            })}
            type="number"
            min="0"
          />
          {errors.priceAmount && (
            <FormError error={errors.priceAmount?.message} />
          )}
        </FormField>
        <FormField label="Duration Days">
          <Input
            {...register("durationDays", {
              valueAsNumber: true,
            })}
            type="number"
          />

          {errors.durationDays && (
            <FormError error={errors.durationDays?.message} />
          )}
        </FormField>
        <FormField label="Activation After Days">
          <Input
            {...register("activationAfterDays", {
              valueAsNumber: true,
            })}
            type="number"
          />
          {errors.activationAfterDays && (
            <FormError error={errors.activationAfterDays?.message} />
          )}
        </FormField>
        <FormField label="Free Consultations">
          <Input
            {...register("freeConsultations", { valueAsNumber: true })}
            type="number"
          />
        </FormField>
        <div className="md:col-span-2">
          <FormField label="Free Consultation Departments">
            <div className="flex gap-4">
              {/* LEFT: Dropdown */}
              <div className="w-1/2">
                <select
                  className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white py-2 px-2 lg:px-2 lg:py-2 text-left text-xs lg:text-sm outline-none focus:border-slate-500 disabled:bg-slate-50 disabled:text-slate-400"
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) return;

                    setFreeConsultDeptIds((prev: string[]) =>
                      prev.includes(id) ? prev : [...prev, id],
                    );
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select department
                  </option>

                  {(departments || []).map((dept: any) => (
                    <option
                      key={dept.id}
                      value={dept.id}
                      className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50 bg-slate-50 font-bold"
                    >
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* RIGHT: Selected departments */}
              <div className="w-1/2">
                <div className="flex flex-wrap gap-2">
                  {freeConsultDeptIds.length === 0 && (
                    <span className="text-xs text-slate-400">
                      No departments selected
                    </span>
                  )}

                  {freeConsultDeptIds.map((id) => {
                    const dept = departments?.find((d: any) => d.id === id);
                    if (!dept) return null;

                    return (
                      <span
                        key={id}
                        className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1 text-xs text-white"
                      >
                        {dept.name}

                        <button
                          type="button"
                          onClick={() =>
                            setFreeConsultDeptIds((prev: string[]) =>
                              prev.filter((x) => x !== id),
                            )
                          }
                          className="text-white/70 hover:text-white"
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </FormField>

          <p className="mt-1 text-xs text-slate-500">
            Leave empty to allow free consultations in any department. Select
            one or more to restrict eligibility.
          </p>
        </div>
        <FormField label="Lab Discount %">
          <Input
            {...register("labDiscount", { valueAsNumber: true })}
            type="number"
            min="0"
            max="100"
          />
        </FormField>
        <FormField label="Pharmacy Discount %">
          <Input
            {...register("pharmacyDiscount", { valueAsNumber: true })}
            type="number"
            min="0"
            max="100"
          />
        </FormField>
        <FormField label="Min Bill Amount for Discount">
          <Input
            {...register("minDiscountAmount", {
              valueAsNumber: true,
            })}
            type="number"
          />
          {errors.minDiscountAmount && (
            <FormError error={errors.minDiscountAmount?.message} />
          )}
        </FormField>
        <div className="md:col-span-2 xl:col-span-4">
          <PharmacySlabEditor
            slabs={pharmacySlabs}
            onChange={setPharmacySlabs}
          />
        </div>
        <div className="md:col-span-2">
          <BenefitPicker
            label="Free Lab Tests"
            kind="lab test"
            rows={labTests}
            selected={freeLabTestIds}
            onChange={setFreeLabTestIds}
            quantities={freeLabQuantities}
            onQuantityChange={(value: string, qty: number) =>
              setFreeLabQuantities((prev: any) => ({ ...prev, [value]: qty }))
            }
            priceKey="default_price"
            apiSession={apiSession}
            searchPath="/lab/catalog/available-tests"
          />
        </div>
        <div className="md:col-span-2">
          <BenefitPicker
            label="Discounted Lab Tests"
            kind="lab test"
            rows={labTests}
            selected={discountedLabTestIds}
            onChange={setDiscountedLabTestIds}
            priceKey="default_price"
            emptyHint="Leave empty to apply lab percentage to all lab tests."
            apiSession={apiSession}
            searchPath="/lab/catalog/available-tests"
          />
        </div>
        <div className="md:col-span-2">
          <BenefitPicker
            label="Free Tablets / Medicines"
            kind="medicine"
            rows={medicines}
            selected={freeMedicineIds}
            onChange={setFreeMedicineIds}
            quantities={freeMedicineQuantities}
            onQuantityChange={(value: string, qty: number) =>
              setFreeMedicineQuantities((prev: any) => ({
                ...prev,
                [value]: qty,
              }))
            }
            priceKey="default_sale_price"
            apiSession={apiSession}
            searchPath="/pharmacy/catalog/available-medicines"
          />
        </div>
        <div className="md:col-span-2">
          <BenefitPicker
            label="Discounted Tablets / Medicines"
            kind="medicine"
            rows={medicines}
            selected={discountedMedicineIds}
            onChange={setDiscountedMedicineIds}
            priceKey="default_sale_price"
            emptyHint="Leave empty to apply pharmacy percentage to all medicines."
            apiSession={apiSession}
            searchPath="/pharmacy/catalog/available-medicines"
          />
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-4">
          <Button disabled={busy}>
            <ButtonLoader loading={busy}>
              {busy ? "Saving..." : submitLabel}
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
