"use client";

import { useState } from "react";
import type { ApiSession } from "@/lib/api";
import {
  createInvoiceFromPharmacyIssue,
  createPharmacyIssue,
  createPharmacyIssueFromConsultation,
  createPharmacyMedicine,
  createPharmacyPurchase,
  createPharmacyReturn,
  createPharmacySupplier,
  updatePharmacyIssueAmount,
  updatePharmacyIssueStatus,
} from "./pharmacy.api";

export function usePharmacyActions(
  session: ApiSession | null | undefined,
  options: {
    load: () => Promise<void>;
    loadLiveData?: (session: ApiSession) => Promise<void>;
  },
) {
  const { load, loadLiveData } = options;
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function createMedicine(input: {
    branchId?: string;
    code: string;
    name: string;
    generic: string;
    salePrice: string;
    reorder: string;
  }) {
    if (!session) return false;
    setBusy("medicine");
    setMessage("");
    try {
      await createPharmacyMedicine(session, {
        branch_id: input.branchId,
        code: input.code,
        name: input.name,
        generic_name: input.generic,
        form: "Tablet",
        default_sale_price: Number(input.salePrice || 0),
        reorder_level: Number(input.reorder || 0),
        created_by_user_id: session.user?.id,
      });
      await load();
      setMessage("Medicine added to catalog.");
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not create medicine.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function createSupplier(supplierName: string) {
    if (!session) return false;
    setBusy("supplier");
    setMessage("");
    try {
      await createPharmacySupplier(session, {
        name: supplierName,
        created_by_user_id: session.user?.id,
      });
      await load();
      setMessage("Supplier created.");
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not create supplier.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function createPurchase(input: {
    branchId?: string;
    medicineId: string;
    medicines: any[];
    suppliers: any[];
    purchaseOrderId: string;
    purchaseDate: string;
    purchaseDiscount: string;
    purchaseQty: string;
    lineDiscount: string;
    cgst: string;
    sgst: string;
  }) {
    if (!session || !input.medicineId) return false;
    setBusy("purchase");
    setMessage("");
    try {
      const med = input.medicines.find((m: any) => m.id === input.medicineId);
      await createPharmacyPurchase(session, {
        branch_id: input.branchId,
        supplier_id: input.suppliers[0]?.id || null,
        purchase_order_id: input.purchaseOrderId,
        invoice_number: `PINV-${Date.now().toString().slice(-5)}`,
        purchase_date: new Date(`${input.purchaseDate}T00:00:00`).toISOString(),
        discount_percentage: Number(input.purchaseDiscount || 0),
        items: [
          {
            medicine_id: input.medicineId,
            batch_number: `B-${Date.now().toString().slice(-4)}`,
            quantity: Number(input.purchaseQty || 0),
            cost_price: Math.max(1, Number(med?.default_sale_price || 0) - 2),
            sale_price: Number(med?.default_sale_price || 0),
            discount_percentage: Number(input.lineDiscount || 0),
            cgst_percentage: Number(input.cgst || 0),
            sgst_percentage: Number(input.sgst || 0),
          },
        ],
        purchased_by_user_id: session.user?.id,
      });
      await load();
      setMessage("Purchase added with discount/GST and stock ledger updated.");
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not create purchase.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function returnExpiredStock(input: {
    branchId?: string;
    medicineId: string;
    batchId: string;
    batches: any[];
    suppliers: any[];
    returnQty: string;
  }) {
    if (!session || !input.medicineId || !input.batchId) return false;
    setBusy("return");
    setMessage("");
    try {
      const batch = input.batches.find((b: any) => b.id === input.batchId);
      await createPharmacyReturn(session, {
        branch_id: input.branchId,
        supplier_id: input.suppliers[0]?.id || null,
        purchase_id: batch?.purchase_id || null,
        reason: "Expired medicine returned to supplier",
        items: [
          {
            medicine_id: input.medicineId,
            batch_id: input.batchId,
            quantity: Number(input.returnQty || 1),
            amount: Number(input.returnQty || 1) * Number(batch?.cost_price || 0),
          },
        ],
        returned_by_user_id: session.user?.id,
      });
      await load();
      setMessage("Expired medicine returned and stock ledger updated.");
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not return expired stock.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function createDirect(input: {
    branchId?: string;
    patientId: string;
    source: string;
    externalPrescriber: string;
    itemRows: any[];
  }) {
    if (!session) return false;
    const { branchId, patientId, source, externalPrescriber, itemRows } = input;
    if (!branchId || !patientId) {
      setMessage("Branch and patient are required.");
      return false;
    }
    if (source === "external_prescription" && !externalPrescriber.trim()) {
      setMessage("External prescriber is required.");
      return false;
    }
    const names = itemRows.map((item: any) => item.medicine_name).filter(Boolean);
    if (!names.length) {
      setMessage("Add at least one medicine.");
      return false;
    }
    setBusy("create");
    setMessage("");
    try {
      await createPharmacyIssue(session, {
        branch_id: branchId,
        patient_id: patientId,
        source,
        medicine_text: names.join(", "),
        external_prescriber:
          source === "external_prescription" ? externalPrescriber : null,
        items: itemRows,
        issued_by_user_id: session.user?.id,
      });
      await load();
      setMessage("Pharmacy issue created.");
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not create pharmacy issue.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function createFromConsultation(a: any) {
    if (!session) return false;
    setBusy(a.consultationId);
    setMessage("");
    try {
      await createPharmacyIssueFromConsultation(session, a.consultationId, {
        amount: 0,
        issued_by_user_id: session.user?.id,
      });
      await load();
      setMessage(
        "Pharmacy issue created. Set amount manually before marking billed.",
      );
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not create prescription issue.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function updateStatus(issue: any, status: string) {
    if (!session) return;
    setBusy(issue.id);
    setMessage("");
    try {
      await updatePharmacyIssueStatus(session, issue.id, {
        status,
        actor_user_id: session.user?.id,
        reason:
          status === "cancelled" ? "Cancelled from pharmacy screen" : undefined,
      });
      await load();
    } catch (err: any) {
      setMessage(err.message || "Could not update pharmacy issue.");
    } finally {
      setBusy("");
    }
  }

  async function generateInvoice(issue: any) {
    if (!session) return null;
    setBusy(`invoice-${issue.id}`);
    setMessage("");
    try {
      const detail = await createInvoiceFromPharmacyIssue(session, {
        pharmacy_issue_id: issue.id,
        created_by_user_id: session.user?.id,
      });
      await load();
      await loadLiveData?.(session);
      setMessage(
        `Pharmacy invoice ${detail.invoice?.invoice_number || ""} generated.`,
      );
      return detail;
    } catch (err: any) {
      setMessage(err.message || "Could not generate pharmacy invoice.");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function updateIssueAmount(issue: any, amount: number) {
    if (!session) return false;
    if (Number.isNaN(amount) || amount < 0) {
      setMessage("Enter a valid amount.");
      return false;
    }
    setBusy(`amount-${issue.id}`);
    setMessage("");
    try {
      await updatePharmacyIssueAmount(session, issue.id, {
        amount,
        actor_user_id: session.user?.id,
      });
      await load();
      setMessage("Pharmacy amount updated.");
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not update amount.");
      return false;
    } finally {
      setBusy("");
    }
  }

  return {
    busy,
    message,
    setMessage,
    createMedicine,
    createSupplier,
    createPurchase,
    returnExpiredStock,
    createDirect,
    createFromConsultation,
    updateStatus,
    generateInvoice,
    updateIssueAmount,
  };
}
