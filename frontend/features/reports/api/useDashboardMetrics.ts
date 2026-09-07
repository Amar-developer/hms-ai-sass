"use client";

import { useEffect, useState } from "react";

import type { ApiSession } from "@/lib/api";
import * as reportsApi from "./reports.api";

type DashboardMetricsResponse = {
  totals: Record<string, any>;
  previous_totals: Record<string, any>;
  profit_summary: Record<string, number>;
  previous_profit_summary: Record<string, number>;
  gross_profit: number;
  final_profit: number;
  previous_final_profit: number;
  lab_settlement_summary: Record<string, number>;
  membership_claim_rows: any[];
  trend_rows: any[];
};

export function useDashboardMetrics({
  apiSession,
  branchId,
  fromDate,
  toDate,
  seriesFrom,
  seriesTo,
  refreshTick,
  enabled,
}: {
  apiSession: ApiSession | null | undefined;
  branchId?: string;
  fromDate: string;
  toDate: string;
  seriesFrom: string;
  seriesTo: string;
  refreshTick: number;
  enabled: boolean;
}) {
  const [data, setData] = useState<DashboardMetricsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled || !apiSession?.tenantId || !fromDate || !toDate) {
      setData(null);
      setLoading(false);
      setError("");
      return;
    }
    let active = true;
    setData(null);
    setLoading(true);
    setError("");
    reportsApi
      .getDashboardMetrics(apiSession, {
        branchId,
        fromDate,
        toDate,
        seriesFrom,
        seriesTo,
      })
      .then((response: any) => {
        if (active) setData(response as DashboardMetricsResponse);
      })
      .catch((reason: any) => {
        if (!active) return;
        setData(null);
        setError(reason?.message || "Unable to load dashboard metrics.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    apiSession?.tenantId,
    branchId,
    enabled,
    fromDate,
    refreshTick,
    seriesFrom,
    seriesTo,
    toDate,
  ]);

  return { dashboardMetrics: data, dashboardMetricsLoading: loading, dashboardMetricsError: error };
}
