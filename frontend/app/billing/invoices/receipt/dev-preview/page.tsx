"use client";

import Invoice from "@/features/billing/components/Invoice";
import { type InvoiceProps } from "@/features/billing/types";

const COMPANY: InvoiceProps["company"] = {
  name: "MedizinHub Healthcare Service Pvt.Ltd",
  tagline: "A Single Stop for All Your HealthCare Needs!",
  address: "Vellore, Tamil Nadu",
  phone: "9876543210",
};

const SMALL: InvoiceProps = {
  company: COMPANY,
  invoiceNo: "MHD-INV-00008",
  invoiceDate: "20/7/2026",
  customer: {
    name: "Dilli babu",
    phone: "4783748574",
    address: "c2fl,Sudarsan Silver Dale,Suryaavanue First cross Street",
  },
  items: [
    { srNo: 1, name: "Paracetamol 500mg", qty: 6, mrp: 5, rate: 30 },
    { srNo: 2, name: "Paracetamol 500mg", qty: 3, mrp: 5, rate: 15 },
    { srNo: 3, name: "Paracetamol 500mg", qty: 3, mrp: 5, rate: 15 },
  ],
  isPaid: false,
  signatoryLine: `For ${COMPANY.name}`,
  subTotal: 4,
  total:0
};

const LARGE: InvoiceProps = {
  ...SMALL,
  items: Array.from({ length: 22 }).map((_, i) => ({
    srNo: i + 1,
    name: `Paracetamol 500mg #${i + 1}`,
    qty: 3,
    mrp: 5,
    rate: 15,
  })),

};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  const params = await searchParams;

  const data = params.variant === "large" ? LARGE : SMALL;

  return (
    <main className="invoice-print">
      <Invoice {...data} />
    </main>
  );
}
