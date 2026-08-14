"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import { fetchInvoiceDelivery } from "./billing.api";

export function useInvoiceDeliveryStatuses(
  session: ApiSession | null | undefined,
  invoices: any[],
) {
  const [deliveryStatus, setDeliveryStatus] = useState<Record<string, any>>({});

  useEffect(() => {
    let active = true;

    async function loadStatuses() {
      if (!session || !invoices.length) {
        setDeliveryStatus({});
        return;
      }
      const entries = await Promise.all(
        invoices.map(async (invoice) => {
          const delivery = await fetchInvoiceDelivery(session, invoice.id).catch(
            () => ({ status: "not_sent" }),
          );
          return [invoice.id, delivery] as const;
        }),
      );
      if (active) setDeliveryStatus(Object.fromEntries(entries));
    }

    void loadStatuses();
    return () => {
      active = false;
    };
  }, [session?.tenantId, invoices]);

  return deliveryStatus;
}
