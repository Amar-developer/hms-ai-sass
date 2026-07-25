import type { ItemFormValues } from "./items.schema";

export function normalizeItemName(name: unknown) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function findDuplicateItem(
  rows: any[],
  name: string,
  editingId?: string | null,
) {
  const normalized = normalizeItemName(name);
  if (!normalized) return null;
  return (
    rows.find(
      (row) =>
        row.id !== editingId && normalizeItemName(row.name) === normalized,
    ) || null
  );
}

export function itemEndpoint(
  type: string,
  editingId?: string | null,
) {
  const suffix = editingId ? `/${editingId}` : "";
  if (type === "medicine") return `/pharmacy/medicines${suffix}`;
  if (type === "lab_test") return `/lab/catalog/tests${suffix}`;
  if (type === "lab_package") return `/lab/catalog/packages${suffix}`;
  if (["home_care_service", "home_visit_service"].includes(type)) {
    return `/home-care/services${suffix}`;
  }
  if (type === "physio_equipment") {
    return `/physiotherapy/equipment${suffix}`;
  }
  throw new Error(`Unsupported item type: ${type}`);
}

function formString(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

export function itemFormValuesFromCatalogItem(item: any): ItemFormValues {
  const salePrice =
    item.default_sale_price ??
    item.default_price ??
    item.package_price ??
    item.price;

  return {
    name: item.name || "",
    generic_name: item.generic_name || "",
    mrp_price: formString(item.mrp_price),
    price: formString(salePrice),
    purchase_price: formString(item.purchase_price),
    supplier_id: item.supplier_id || "",
    reorder_level: formString(item.reorder_level),
    sample_type: item.sample_type || "",
    description: item.description || "",
    modality_type: item.modality_type || "ift",
    manufacturer: item.manufacturer || "",
    model_number: item.model_number || "",
    serial_number: item.serial_number || "",
    is_portable: item.is_portable === true ? "true" : "false",
  };
}
