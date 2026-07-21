"use client";

import { useEffect, useState } from "react";
import TokenSlip, {
  type TokenSlipData,
} from "@/features/appointments/components/TokenSlip";

// Unlike the invoice receipt page, token/queue data can't be re-fetched from
// the backend by appointment id alone (GET /appointments/:id omits the
// token number and denormalized patient/doctor names, which only live on
// the booking response and the queue entry). So the booking screen stores
// the slip payload in sessionStorage right before opening this tab, keyed
// by appointment id, and this page just reads it back.
function sessionStorageKey(id: string) {
  return `medizinhub.tokenPrint.${id}`;
}

export default function Page() {
  const [data, setData] = useState<TokenSlipData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
      setError("No appointment specified.");
      return;
    }
    const raw = sessionStorage.getItem(sessionStorageKey(id));
    if (!raw) {
      setError(
        "Token details are no longer available. Please print again from the appointment booking screen.",
      );
      return;
    }
    try {
      setData(JSON.parse(raw));
    } catch {
      setError("Could not read token details.");
    }
  }, []);

  useEffect(() => {
    if (!data) return;
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [data]);

  if (error) {
    return <main className="p-8 text-sm text-red-600">{error}</main>;
  }
  if (!data) {
    return <main className="p-8 text-sm text-slate-500">Loading token...</main>;
  }
  return (
    <main className="token-print p-4">
      <TokenSlip data={data} />
    </main>
  );
}
