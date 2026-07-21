"use client";

import { useEffect, useState } from "react";
import Invoice from "@/features/billing/components/Invoice";
import { apiFetch, type ApiSession } from "@/lib/api";
import { type InvoiceProps } from "@/features/billing/types";

// Same letterhead used for the printed prescription (PrescriptionDocument's
// STATIC_CLINIC) — swap for a real tenant/branch lookup once that data is
// available from the backend.
const COMPANY: InvoiceProps["company"] = {
  name: "MedizinHub Healthcare Service Pvt.Ltd",
  tagline: "A Single Stop for All Your HealthCare Needs!",
  address: "Vellore, Tamil Nadu",
  phone: "9876543210",
  logoUrl: `http://localhost:8080/uploads/file_tenant_9473c_8fdecf10827146ccad0dc80feb6e5090.png`,
};

function readSession(): ApiSession | null {
  const raw =
    typeof window !== "undefined"
      ? localStorage.getItem("medizinhub.session")
      : null;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toInvoiceProps(detail: any, patient: any): InvoiceProps {
  const invoice = detail.invoice || {};
  const items = detail.items || [];
  return {
    company: COMPANY,
    invoiceNo: invoice.invoice_number || invoice.id,
    invoiceDate: invoice.invoice_date
      ? new Date(invoice.invoice_date).toLocaleDateString("en-IN")
      : invoice.created_at
        ? new Date(invoice.created_at).toLocaleDateString("en-IN")
        : "",
    customer: {
      name: invoice.patient_name || patient?.full_name || "Patient",
      phone: patient?.mobile || "",
      address: patient?.address || "",
    },
    items: items.map((item: any, idx: number) => ({
      srNo: idx + 1,
      name: item.description || item.item_type || "Item",
      qty: item.quantity ?? 1,
      mrp: item.mrp_amount ?? item.total_amount ?? 0,
      rate: item.total_amount ?? 0,
    })),
    isPaid: String(invoice.status).toLowerCase() === "paid",
    signatoryLine: `For ${COMPANY.name}`,
    subTotal: invoice.subtotal_amount,
    total: invoice.total_amount
  };
}

export default function Page() {
  const [invoiceProps, setInvoiceProps] = useState<InvoiceProps | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    const session = readSession();

    if (!id) {
      setError("No invoice specified.");
      return;
    }
    if (!session) {
      setError("Your session has expired. Please log in again.");
      return;
    }

    (async () => {
      try {
        const detail = await apiFetch(`/billing/invoices/${id}`, session);
        console.log(detail,'detail')
        const patientId = detail.invoice?.patient_id;
        const patient = patientId
          ? await apiFetch(`/patients/${patientId}`, session).catch(() => null)
          : null;
        setInvoiceProps(toInvoiceProps(detail, patient));
      } catch (err: any) {
        setError(err.message || "Could not load invoice.");
      }
    })();
  }, []);

  useEffect(() => {
    if (!invoiceProps) return;
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [invoiceProps]);

  if (error) {
    return <main className="p-8 text-sm text-red-600">{error}</main>;
  }
  if (!invoiceProps) {
    return (
      <main className="p-8 text-sm text-slate-500">Loading receipt...</main>
    );
  }
  console.log(invoiceProps,'invoiceProps')
  return (
    <main className="invoice-print">
      <Invoice {...invoiceProps} />
    </main>
  );
}
