"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as ipApi from "./ip.api";

type UseIPAdmissionWorkParams = {
  apiSession: ApiSession | null | undefined;
  admissionId?: string;
};

/**
 * Owns the selected IP admission's clinical + billing detail: treatments,
 * charges, billable items, uploaded documents, medication orders and
 * administrations, and the generated invoice (if any). Reloads whenever the
 * selected admission changes, and exposes `loadAdmissionWork` so callers can
 * refresh the same data after a mutation.
 */
export function useIPAdmissionWork({
  apiSession,
  admissionId,
}: UseIPAdmissionWorkParams) {
  const [treatments, setTreatments] = useState<any[]>([]);
  const [charges, setCharges] = useState<any[]>([]);
  const [billingItems, setBillingItems] = useState<any[]>([]);
  const [ipDocuments, setIpDocuments] = useState<any[]>([]);
  const [medicationOrders, setMedicationOrders] = useState<any[]>([]);
  const [medicationAdministrations, setMedicationAdministrations] = useState<
    any[]
  >([]);
  const [ipInvoice, setIpInvoice] = useState<any>(null);
  const [admissionWorkLoading, setAdmissionWorkLoading] = useState(false);
  const [admissionWorkError, setAdmissionWorkError] = useState("");

  async function loadAdmissionWork(id: string) {
    if (!apiSession) return;
    setAdmissionWorkError("");
    setAdmissionWorkLoading(true);
    try {
      const [
        treatmentRows,
        chargeRows,
        billingRows,
        documentRows,
        medOrderRows,
        medAdministrationRows,
        invoiceResult,
      ] = await Promise.all([
        ipApi.listTreatments(apiSession, id),
        ipApi.listCharges(apiSession, id),
        ipApi.listBillingItems(apiSession, id),
        ipApi.listDocuments(apiSession, id).catch(() => []),
        ipApi.listMedicationOrders(apiSession, id),
        ipApi.listMedicationAdministrations(apiSession, id),
        ipApi.getAdmissionInvoice(apiSession, id).catch(() => null),
      ]);
      setTreatments(treatmentRows);
      setCharges(chargeRows);
      setBillingItems(billingRows);
      setIpDocuments(documentRows);
      setMedicationOrders(medOrderRows);
      setMedicationAdministrations(medAdministrationRows);
      setIpInvoice(invoiceResult);
    } catch (err: any) {
      setAdmissionWorkError(
        err.message || "Unable to load IP admission details.",
      );
    } finally {
      setAdmissionWorkLoading(false);
    }
  }

  useEffect(() => {
    if (admissionId) loadAdmissionWork(admissionId);
  }, [admissionId]);

  return {
    treatments,
    charges,
    billingItems,
    ipDocuments,
    medicationOrders,
    medicationAdministrations,
    ipInvoice,
    setIpInvoice,
    admissionWorkLoading,
    admissionWorkError,
    loadAdmissionWork,
  };
}
