"use client";

import { useEffect, useMemo, useState } from "react";
import type { ApiSession } from "@/lib/api";
import { paymentMethodOptions } from "@/lib/options";
import { fetchEnabledPaymentMethods } from "./billing.api";

export function usePaymentMethods(session: ApiSession | null | undefined) {
  const [enabledPaymentMethods, setEnabledPaymentMethods] = useState<string[]>(
    paymentMethodOptions.map((option) => option.value),
  );

  useEffect(() => {
    let alive = true;
    if (!session) return undefined;
    fetchEnabledPaymentMethods(session)
      .then((row: any) => {
        const values = Array.isArray(row?.value) ? row.value : [];
        const allowed = new Set<string>(
          paymentMethodOptions.map((option) => option.value),
        );
        const filtered = values.filter((value: string) => allowed.has(value));
        if (alive && filtered.length) setEnabledPaymentMethods(filtered);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [session]);

  const invoicePaymentOptions = useMemo(() => {
    const selected = new Set(enabledPaymentMethods);
    const rows = paymentMethodOptions.filter((option) =>
      selected.has(option.value),
    );
    return rows.length ? rows : paymentMethodOptions;
  }, [enabledPaymentMethods]);

  const defaultPaymentMethod = invoicePaymentOptions[0]?.value || "cash";

  return { enabledPaymentMethods, invoicePaymentOptions, defaultPaymentMethod };
}
