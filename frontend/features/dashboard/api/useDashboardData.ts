"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getDashboardReports } from "../api";

export function useDashboardData({
  apiSession,
  branchId,
  today,
  monthStart,
  monthEnd,
}: any) {
  const queryClient = useQueryClient();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!apiSession) return;

    let mounted = true;

    async function load() {
      setLoading(true);

      const result = await getDashboardReports({
        apiSession,
        branchId,
        today,
        monthStart,
        monthEnd,
        queryClient,
      });

      if (mounted) {
        setData(result);
      }

      setLoading(false);
    }

    load();

    return () => {
      mounted = false;
    };
  }, [apiSession?.tenantId, branchId, today, monthStart, monthEnd]);

  return {
    data,
    loading,
  };
}
