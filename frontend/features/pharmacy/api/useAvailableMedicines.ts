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
    const search = medicineSearch.trim();
    if (search.length < 2) {
      setAvailableMedicines([]);
      setMedicineLoading(false);
      return undefined;
    }
    let alive = true;
    const controller = new AbortController();
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
            controller.signal,
          );
          if (alive) setAvailableMedicines(Array.isArray(rows) ? rows : []);
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
          if (alive) setAvailableMedicines([]);
        } finally {
          if (alive) setMedicineLoading(false);
        }
      },
      250,
    );
    return () => {
      alive = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [session, session?.tenantId, branchId, medicineSearch]);

  return { availableMedicines, medicineLoading };
}
