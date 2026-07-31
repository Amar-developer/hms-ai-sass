"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
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
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  async function load() {
    if (!apiSession) return;
    setLoading(true);
    try {
      const [
        medicineRows,
        testRows,
        packageRows,
        equipmentRows,
        homeCareServiceRows,
        supplierRows,
      ] = await Promise.all([
        itemsApi.listMedicines(apiSession).catch(() => []),
        itemsApi.listLabTests(apiSession).catch(() => []),
        itemsApi.listLabPackages(apiSession).catch(() => []),
        itemsApi.listPhysioEquipment(apiSession).catch(() => []),
        itemsApi.listHomeCareServices(apiSession).catch(() => []),
        itemsApi.listSuppliers(apiSession).catch(() => []),
      ]);
      setMedicines(medicineRows);
      setTests(testRows);
      setPackages(packageRows);
      setEquipment(equipmentRows);
      setHomeCareServices(homeCareServiceRows);
      setStockSuppliers(supplierRows);
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
    loading,
    loadError,
    load,
  };
}
