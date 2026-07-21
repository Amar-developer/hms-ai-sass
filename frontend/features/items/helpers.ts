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
