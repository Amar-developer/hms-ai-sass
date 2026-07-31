"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import type { LabOrderSummary } from "@/lib/contracts";
import * as labApi from "./lab.api";

type UseLabWorkspaceDataParams = {
  apiSession: ApiSession | null | undefined;
};

/**
 * Owns the whole lab workspace's tenant-scoped data: orders, consultation
 * referrals, the test/package/template catalogs, suppliers, and the report
 * files attached to each order (grouped by order id). Exposes `load` so
 * callers (refresh button, post-mutation reloads) can re-fetch everything
 * together, matching the original single combined loader.
 */
export function useLabWorkspaceData({ apiSession }: UseLabWorkspaceDataParams) {
  const [orders, setOrders] = useState<LabOrderSummary[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [consultationReferrals, setConsultationReferrals] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [reportDocuments, setReportDocuments] = useState<Record<string, any[]>>(
    {},
  );
  const [loadError, setLoadError] = useState("");

  async function load() {
    if (!apiSession) {
      setOrders([]);
      setConsultationReferrals([]);
      return;
    }
    try {
      const [
        orderRows,
        referralRows,
        testRows,
        packageRows,
        templateRows,
        supplierRows,
        reportRows,
      ] = await Promise.all([
        labApi.listOrders(apiSession),
        labApi.listConsultationReferrals(apiSession).catch(() => []),
        labApi.listTests(apiSession),
        labApi.listPackages(apiSession),
        labApi.listResultTemplates(apiSession),
        labApi.listSuppliers(apiSession),
        labApi.listLabReportFiles(apiSession).catch(() => []),
      ]);
      setOrders(orderRows);
      setConsultationReferrals(referralRows || []);
      setTests(testRows);
      setPackages(packageRows);
      setTemplates(templateRows);
      setSuppliers(supplierRows || []);
      const documentsByOrder: Record<string, any[]> = {};
      for (const file of reportRows || []) {
        if (file.attached_to_doctype !== "LabOrder" || !file.attached_to_name)
          continue;
        (documentsByOrder[file.attached_to_name] ||= []).push(file);
      }
      setReportDocuments(documentsByOrder);
    } catch (err: any) {
      setLoadError(err.message || "Could not load lab workspace.");
    } finally {
      setOrdersLoaded(true);
    }
  }

  useEffect(() => {
    load();
  }, [apiSession?.tenantId]);

  return {
    orders,
    ordersLoaded,
    consultationReferrals,
    tests,
    packages,
    suppliers,
    templates,
    reportDocuments,
    setReportDocuments,
    loadError,
    load,
  };
}
