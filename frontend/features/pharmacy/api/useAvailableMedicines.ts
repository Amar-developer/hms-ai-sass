"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import { fetchAvailableMedicines } from "./pharmacy.api";

export function useAvailableMedicines(
  session: ApiSession | null | undefined,
  branchId: string | undefined,
  medicineSearch: string,
) {
  const [availableMedicines, setAvailableMedicines] = useState<any[]>([]);
  const [medicineLoading, setMedicineLoading] = useState(false);

  useEffect(() => {
    if (!session?.tenantId) {
      setAvailableMedicines([]);
      return undefined;
    }
    let alive = true;
    const search = medicineSearch.trim();
    const timer = window.setTimeout(
      async () => {
        setMedicineLoading(true);
        try {
          const params = new URLSearchParams();
          if (branchId) params.set("branch_id", branchId);
          if (search) params.set("search", search);
          const rows = await fetchAvailableMedicines(
            session,
            params.toString() ? `?${params}` : "",
          );
          if (alive) setAvailableMedicines(Array.isArray(rows) ? rows : []);
        } catch {
          if (alive) setAvailableMedicines([]);
        } finally {
          if (alive) setMedicineLoading(false);
        }
      },
      search ? 250 : 0,
    );
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [session, session?.tenantId, branchId, medicineSearch]);

  return { availableMedicines, medicineLoading };
}
