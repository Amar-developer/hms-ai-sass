"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as labApi from "./lab.api";

type UseLabAvailableTestSearchParams = {
  apiSession: ApiSession | null | undefined;
  testSearch: string;
};

/**
 * Debounced live search over the tenant's available lab tests/services,
 * used to seed the "create order" test picker as the user types.
 */
export function useLabAvailableTestSearch({
  apiSession,
  testSearch,
}: UseLabAvailableTestSearchParams) {
  const [availableTests, setAvailableTests] = useState<any[]>([]);
  const [testLoading, setTestLoading] = useState(false);

  useEffect(() => {
    if (!apiSession?.tenantId) {
      setAvailableTests([]);
      return;
    }
    let alive = true;
    const search = testSearch.trim();
    const timer = window.setTimeout(
      async () => {
        setTestLoading(true);
        try {
          const rows = await labApi.searchAvailableTests(apiSession, search);
          if (alive) setAvailableTests(Array.isArray(rows) ? rows : []);
        } catch {
          if (alive) setAvailableTests([]);
        } finally {
          if (alive) setTestLoading(false);
        }
      },
      search ? 250 : 0,
    );
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [apiSession, apiSession?.tenantId, testSearch]);

  return { availableTests, testLoading };
}
