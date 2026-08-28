import React from "react";
import { Card } from "@/app/components/common/ui";
import { humanizeOptionLabel } from "@/lib/options";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <p className="text-xs font-bold text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-slate-700">{value}</p>
    </div>
  );
}

export function ItemDetail({ item, canEdit, onEdit, back }: any) {
  return (
    <Card className="p-3 bg-white">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="card-title font-bold">Item Details</h3>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="primary-action px-4 py-2 text-xs"
            >
              Edit
            </button>
          )}
          <button type="button" onClick={back} className="close-button font-bold">
            Back to Items
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Type" value={humanizeOptionLabel(item.kind)} />
        <Field label="Name" value={item.name} />
        <Field label="Code" value={item.code} />
        <Field label="Supplier" value={item.supplier} />
        <Field
          label="MRP"
          value={item.mrp_price === null ? null : `₹${item.mrp_price || 0}`}
        />
        <Field
          label="Purchase Price"
          value={
            item.purchase_price === null ? null : `₹${item.purchase_price || 0}`
          }
        />
        <Field
          label="Sale Price"
          value={item.price === null ? null : `₹${item.price}`}
        />
        <Field label="Generic Name" value={item.generic_name} />
        <Field label="Manufacturer" value={item.manufacturer} />
        <Field label="Form" value={item.form} />
        <Field label="Department" value={item.department} />
        <Field label="Sample Type" value={item.sample_type} />
        <Field label="Modality Type" value={item.modality_type} />
        <Field
          label="Portable"
          value={item.is_portable === "" ? null : item.is_portable === "true" ? "Yes" : "No"}
        />
        <Field label="Details" value={item.meta} />
      </div>
    </Card>
  );
}
