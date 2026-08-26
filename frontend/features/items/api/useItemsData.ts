"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import type { QueryFieldOption } from "@/utils/queryFilter";
import * as itemsApi from "./items.api";

type UseItemsDataParams = {
  apiSession: ApiSession | null | undefined;
  branchId?: string;
};

/**
 * Owns the item master catalogs: medicines, lab tests, lab packages,
 * physio equipment, home care services, and stock suppliers. Every list
 * call swallows its own failure (empty array), matching the original
 * per-source `.catch(() => [])` behavior, so one slow/broken catalog
 * doesn't block the others from loading.
 */
export function useItemsData({ apiSession, branchId }: UseItemsDataParams) {
  const [medicines, setMedicines] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [homeCareServices, setHomeCareServices] = useState<any[]>([]);
  const [stockSuppliers, setStockSuppliers] = useState<any[]>([]);
  const [medicineFilterOptions, setMedicineFilterOptions] = useState<
    Record<string, QueryFieldOption[]>
  >({});
  const [labTestFilterOptions, setLabTestFilterOptions] = useState<
    Record<string, QueryFieldOption[]>
  >({});
  const [labPackageFilterOptions, setLabPackageFilterOptions] = useState<
    Record<string, QueryFieldOption[]>
  >({});
  const [physioEquipmentFilterOptions, setPhysioEquipmentFilterOptions] =
    useState<Record<string, QueryFieldOption[]>>({});
  const [homeCareServiceFilterOptions, setHomeCareServiceFilterOptions] =
    useState<Record<string, QueryFieldOption[]>>({});
  // Starts true: on mount there is a render before load() runs, and
  // loading=false there looks identical to "loaded, found nothing" to the
  // edit/view not-found redirect guard in Items.tsx, which would bounce a
  // fresh navigation straight back to the list before the fetch completes.
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  async function load() {
    if (!apiSession) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [
        medicineRows,
        testRows,
        packageRows,
        equipmentRows,
        homeCareServiceRows,
        supplierRows,
        medicineOptions,
        labTestOptions,
        labPackageOptions,
        physioEquipmentOptions,
        homeCareServiceOptions,
      ] = await Promise.all([
        itemsApi.listMedicines(apiSession).catch(() => []),
        itemsApi.listLabTests(apiSession).catch(() => []),
        itemsApi.listLabPackages(apiSession).catch(() => []),
        itemsApi.listPhysioEquipment(apiSession).catch(() => []),
        itemsApi.listHomeCareServices(apiSession).catch(() => []),
        itemsApi.listSuppliers(apiSession).catch(() => []),
        itemsApi.listMedicineFilterOptions(apiSession).catch(() => ({})),
        itemsApi.listLabTestFilterOptions(apiSession).catch(() => ({})),
        itemsApi.listLabPackageFilterOptions(apiSession).catch(() => ({})),
        itemsApi
          .listPhysioEquipmentFilterOptions(apiSession)
          .catch(() => ({})),
        itemsApi
          .listHomeCareServiceFilterOptions(apiSession)
          .catch(() => ({})),
      ]);
      setMedicines(medicineRows);
      setTests(testRows);
      setPackages(packageRows);
      setEquipment(equipmentRows);
      setHomeCareServices(homeCareServiceRows);
      setStockSuppliers(supplierRows);
      setMedicineFilterOptions(medicineOptions || {});
      setLabTestFilterOptions(labTestOptions || {});
      setLabPackageFilterOptions(labPackageOptions || {});
      setPhysioEquipmentFilterOptions(physioEquipmentOptions || {});
      setHomeCareServiceFilterOptions(homeCareServiceOptions || {});
    } catch (err: any) {
      setLoadError(err.message || "Could not load items.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [apiSession?.tenantId, branchId]);

  return {
    medicines,
    tests,
    packages,
    equipment,
    homeCareServices,
    stockSuppliers,
    medicineFilterOptions,
    labTestFilterOptions,
    labPackageFilterOptions,
    physioEquipmentFilterOptions,
    homeCareServiceFilterOptions,
    loading,
    loadError,
    load,
  };
}
