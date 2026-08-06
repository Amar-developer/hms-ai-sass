"use client";

import type { ApiSession } from "@/lib/api";
import { splitRows, today } from "@/utils/helper";
import { dailyDoseQuantity, parseAmount } from "../helpers";
import * as ipApi from "./ip.api";

type UseIPCareActionsParams = {
  apiSession: ApiSession | null | undefined;
  admission: any;
  closed: boolean;
  medicineRows: string;
  referralRows: string;
  medicationOrders: any[];
  getMedicineUnitAmount: (name: string) => number;
  getLabUnitAmount: (name: string) => number;
  setBusy: (value: string) => void;
  setError: (value: string) => void;
  setMessage: (value: string) => void;
  loadAdmissionWork: (admissionId: string) => Promise<void>;
  refresh: () => Promise<void>;
};

/**
 * Owns the IP care workspace's single "daily entry" write: it records the
 * ward round treatment note, drafts and auto-signs the linked IP
 * consultation, reconciles the typed medicine rows against existing active
 * medication orders (creating new ones and administering doses when
 * requested), and posts lab/scan referral rows as billable items.
 */
export function useIPCareActions({
  apiSession,
  admission,
  closed,
  medicineRows,
  referralRows,
  medicationOrders,
  getMedicineUnitAmount,
  getLabUnitAmount,
  setBusy,
  setError,
  setMessage,
  loadAdmissionWork,
  refresh,
}: UseIPCareActionsParams) {
  async function submitCare(e: any) {
    e.preventDefault();
    if (closed) {
      setError(
        "This IP admission is discharged. New care entries and billing items are locked.",
      );
      return;
    }
    const fd = new FormData(e.currentTarget);
    const careDate = String(fd.get("care_date") || today());
    const roundType = String(fd.get("round_type") || "ward_round");
    const notes = String(fd.get("notes") || "");
    const complaints = String(fd.get("complaints") || "") || undefined;
    const diagnosis = String(fd.get("diagnosis") || "") || undefined;
    const feeAmount = Number(fd.get("fee_amount") || 0);
    const markGiven = Boolean(fd.get("mark_given"));
    const vitals = {
      bp: String(fd.get("bp") || ""),
      pulse: String(fd.get("pulse") || ""),
      temperature: String(fd.get("temperature") || ""),
    };
    setBusy("ip care");
    setError("");
    setMessage("");
    try {
      if (!apiSession)
        throw new Error("Backend login is required for IP care.");
      await ipApi.createTreatment(apiSession, admission.id, {
        treatment_date: careDate,
        treatment_type: roundType,
        notes,
        medication_summary: medicineRows || undefined,
        orders: referralRows || undefined,
      });
      const consultation: any = await ipApi.createIpConsultation(
        apiSession,
        admission.id,
        {
          consultation_date: careDate,
          consultation_type: roundType,
          fee_amount: feeAmount,
          vitals_json: JSON.stringify(vitals),
          complaints,
          diagnosis,
          notes,
          prescription_text: medicineRows || undefined,
        },
      );
      await ipApi.signIpConsultation(apiSession, consultation.id);

      const knownOrders = [...medicationOrders];
      for (const line of splitRows(medicineRows)) {
        const [medicine_name, dosage, frequency, route, amountText] = line
          .split("|")
          .map((part) => part.trim());
        if (!medicine_name) continue;
        const unitAmount =
          parseAmount(amountText) || getMedicineUnitAmount(medicine_name);
        let order = knownOrders.find(
          (row: any) =>
            String(row.status || "active") === "active" &&
            String(row.medicine_name || "").toLowerCase() ===
              medicine_name.toLowerCase() &&
            String(row.dosage || "") === String(dosage || "") &&
            String(row.frequency || "") === String(frequency || "") &&
            String(row.route || "") === String(route || "") &&
            Number(row.unit_amount || 0) === unitAmount,
        );
        if (!order) {
          order = await ipApi.createMedicationOrder(apiSession, admission.id, {
            medicine_name,
            dosage: dosage || undefined,
            frequency: frequency || undefined,
            route: route || undefined,
            start_date: careDate,
            unit_amount: unitAmount,
          });
          knownOrders.push(order);
        }
        if (markGiven) {
          await ipApi.createMedicationAdministration(
            apiSession,
            admission.id,
            order.id,
            {
              quantity: dailyDoseQuantity(dosage, frequency),
              status: "given",
              notes: "Given from IP care entry",
            },
          );
        }
      }

      for (const line of splitRows(referralRows)) {
        const [sourceType, itemName, priority, instructions, amountText] = line
          .split("|")
          .map((part) => part.trim());
        if (!itemName) continue;
        const normalizedType =
          sourceType === "scan" ? "scan_referral" : "lab_referral";
        const amount = parseAmount(amountText) || getLabUnitAmount(itemName);
        if (amount > 0) {
          await ipApi.createBillingItem(apiSession, admission.id, {
            source_type: normalizedType,
            description: `${sourceType?.toUpperCase() || "LAB"} - ${itemName}${priority ? ` (${priority})` : ""}${instructions ? ` - ${instructions}` : ""}`,
            quantity: 1,
            unit_amount: amount,
          });
        }
      }

      await loadAdmissionWork(admission.id);
      await refresh();
      setMessage("IP care entry saved, signed, and billable items updated.");
    } catch (err: any) {
      setError(err.message || "Unable to save IP care entry.");
    } finally {
      setBusy("");
    }
  }

  return { submitCare };
}
