"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import { fetchConsultationDetail } from "./pharmacy.api";

export function useMedicineDetail(
  session: ApiSession | null | undefined,
  consultationId: string | null | undefined,
) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session || !consultationId) {
      setDetail(null);
      setError("");
      return undefined;
    }
    let alive = true;
    setLoading(true);
    setError("");
    fetchConsultationDetail(session, consultationId)
      .then((row) => {
        if (alive) setDetail(row);
      })
      .catch((err: any) => {
        if (alive) {
          setDetail(null);
          setError(err?.message || "Could not load consultation.");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [session?.tenantId, consultationId]);

  return { detail, loading, error };
}
