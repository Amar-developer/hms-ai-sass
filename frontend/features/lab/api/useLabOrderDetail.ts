"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as labApi from "./lab.api";

type UseLabOrderDetailParams = {
  apiSession: ApiSession | null | undefined;
  orderId: string;
};

/**
 * Owns the priced line-item detail for a single lab/service order, shown
 * in the worklist detail modal. Aborts the in-flight request if the order
 * changes or the modal unmounts before it resolves.
 */
export function useLabOrderDetail({
  apiSession,
  orderId,
}: UseLabOrderDetailParams) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    labApi
      .getOrderDetail(apiSession as ApiSession, orderId, {
        signal: controller.signal,
      })
      .then(setDetail)
      .catch((error: any) => {
        if (error?.name !== "AbortError") {
          setLoadError(error?.message || "Could not load order prices.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [apiSession, orderId]);

  return { detail, loading, loadError };
}
