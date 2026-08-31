import { apiFetch, type ApiSession } from "@/lib/api";
import { itemEndpoint } from "../helpers";

export function listTenants(session: ApiSession) {
  return apiFetch("/tenants", session);
}

export function listMedicines(session: ApiSession) {
  return apiFetch("/pharmacy/medicines", session);
}

export function listMedicineFilterOptions(session: ApiSession) {
  return apiFetch("/pharmacy/medicines/filter-options", session);
}

export function listLabTests(session: ApiSession) {
  return apiFetch("/lab/catalog/tests", session);
}

export function listLabTestFilterOptions(session: ApiSession) {
  return apiFetch("/lab/catalog/tests/filter-options", session);
}

export function listLabPackages(session: ApiSession) {
  return apiFetch("/lab/catalog/packages", session);
}

export function listLabPackageFilterOptions(session: ApiSession) {
  return apiFetch("/lab/catalog/packages/filter-options", session);
}

export function listPhysioEquipment(session: ApiSession) {
  return apiFetch("/physiotherapy/equipment", session);
}

export function listPhysioEquipmentFilterOptions(session: ApiSession) {
  return apiFetch("/physiotherapy/equipment/filter-options", session);
}

export function listHomeCareServices(session: ApiSession) {
  return apiFetch("/home-care/services", session);
}

export function listHomeCareServiceFilterOptions(session: ApiSession) {
  return apiFetch("/home-care/services/filter-options", session);
}

export function listSuppliers(session: ApiSession) {
  return apiFetch("/pharmacy/suppliers", session);
}

export function saveItem(
  session: ApiSession,
  type: string,
  editingId: string | null | undefined,
  body: any,
) {
  return apiFetch(itemEndpoint(type, editingId), session, {
    method: editingId ? "PATCH" : "POST",
    body: JSON.stringify(body),
  });
}

export function deleteItem(session: ApiSession, type: string, id: string) {
  return apiFetch(itemEndpoint(type, id), session, { method: "DELETE" });
}
