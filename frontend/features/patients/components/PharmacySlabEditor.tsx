import { ActionButton, Input } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";

export function PharmacySlabEditor({ slabs, onChange }: any) {
  function update(index: number, key: string, value: string) {
    const next = slabs.map((row: any, rowIndex: number) =>
      rowIndex === index
        ? {
            ...row,
            [key]:
              key === "max_amount" && value.trim() === ""
                ? null
                : Number(value || 0),
          }
        : row,
    );
    onChange(next);
  }
  function isSlabComplete(slab: any) {
    return (
      slab.min_amount !== "" &&
      slab.min_amount !== null &&
      slab.min_amount !== undefined &&
      slab.discount_percentage !== "" &&
      slab.discount_percentage !== null &&
      slab.discount_percentage !== undefined
    );
  }

  function addRow() {
    const lastSlab = slabs[slabs.length - 1];

    if (lastSlab && !isSlabComplete(lastSlab)) {
      alert("Please complete the current slab before adding a new one");
      return;
    }

    onChange([
      ...slabs,
      {
        min_amount: "",
        max_amount: "",
        discount_percentage: "",
      },
    ]);
  }

  function removeRow(index: number) {
    const next = slabs.filter(
      (_row: any, rowIndex: number) => rowIndex !== index,
    );
    onChange(
      next.length
        ? next
        : [{ min_amount: 0, max_amount: null, discount_percentage: 0 }],
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="card-title font-bold uppercase tracking-wide text-slate-500">
            Pharmacy Discount Slabs
          </p>
          <p className="text-xs text-slate-500">
            Add one row for each bill range. Leave To Amount empty for above.
          </p>
        </div>
        <ActionButton onClick={addRow}>Add Slab</ActionButton>
      </div>
      <div className="space-y-2">
        {slabs.map((slab: any, index: number) => (
          <div
            key={index}
            className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <FormField label="From Amount">
              <Input
                name="pharmacySlabMin"
                type="number"
                min="0"
                value={slab.min_amount ?? 0}
                onChange={(event: any) =>
                  update(index, "min_amount", event.target.value)
                }
              />
            </FormField>
            <FormField label="To Amount">
              <Input
                name="pharmacySlabMax"
                type="number"
                min="0"
                value={slab.max_amount ?? ""}
                placeholder="Above"
                onChange={(event: any) =>
                  update(index, "max_amount", event.target.value)
                }
              />
            </FormField>
            <FormField label="Discount %">
              <Input
                name="pharmacySlabDiscount"
                type="number"
                min="0"
                max="100"
                value={slab.discount_percentage ?? 0}
                onChange={(event: any) =>
                  update(index, "discount_percentage", event.target.value)
                }
              />
            </FormField>
            <div className="flex items-end justify-center">
              {slabs.length > 1 && (
                <ActionButton
                  tone="danger"
                  className="close-button"
                  onClick={() => removeRow(index)}
                >
                  Remove
                </ActionButton>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
