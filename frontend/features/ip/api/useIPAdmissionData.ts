"use client";

import { useEffect, useRef, useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as ipApi from "./ip.api";
import { defaultRooms } from "../helpers";
import { mapWithConcurrency } from "@/lib/concurrency";

type UseIPAdmissionDataParams = {
  apiSession: ApiSession | null | undefined;
  branchId?: string;
  admissionDate: string;
  expectedDischargeDate: string;
};

/**
 * Owns the branch-scoped lookups the IP admission screen needs: bed
 * availability for the selected date range (seeding a default room master
 * the first time a branch has none) and the medicine/lab catalogs used to
 * seed care-entry suggestions.
 */
export function useIPAdmissionData({
  apiSession,
  branchId,
  admissionDate,
  expectedDischargeDate,
}: UseIPAdmissionDataParams) {
  const [ipRooms, setIpRooms] = useState<any[]>([]);
  const [medicineCatalog, setMedicineCatalog] = useState<any[]>([]);
  const [labCatalog, setLabCatalog] = useState<any[]>([]);
  const roomSeedAttemptedRef = useRef(false);

  useEffect(() => {
    if (!apiSession || !branchId) return;
    let alive = true;
    (async () => {
      try {
        const filters = {
          branchId,
          availableFrom: admissionDate,
          availableTo: expectedDischargeDate || admissionDate,
        };
        const rows = await ipApi.listRooms(apiSession, filters);
        if (rows.length === 0 && !roomSeedAttemptedRef.current) {
          roomSeedAttemptedRef.current = true;
          await mapWithConcurrency(
            defaultRooms(branchId),
            (room) => ipApi.createRoom(apiSession, room).catch(() => null),
            3,
          );
          const seededRows = await ipApi.listRooms(apiSession, filters);
          if (alive) setIpRooms(seededRows);
          return;
        }
        if (alive) setIpRooms(rows);
      } catch {
        if (alive) setIpRooms([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [apiSession?.tenantId, branchId, admissionDate, expectedDischargeDate]);

  useEffect(() => {
    if (!apiSession) return;
    let alive = true;
    Promise.all([
      ipApi.listMedicineCatalog(apiSession).catch(() => []),
      ipApi.listLabCatalog(apiSession).catch(() => []),
    ])
      .then(([medicines, tests]) => {
        if (!alive) return;
        setMedicineCatalog(medicines);
        setLabCatalog(tests);
      })
      .catch(() => {
        if (alive) {
          setMedicineCatalog([]);
          setLabCatalog([]);
        }
      });
    return () => {
      alive = false;
    };
  }, [apiSession?.tenantId, branchId]);

  return { ipRooms, medicineCatalog, labCatalog };
}
