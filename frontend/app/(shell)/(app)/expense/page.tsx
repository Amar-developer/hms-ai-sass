"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Expense now lives at /clinic/expense — this stub keeps old bookmarks/links
// working by forwarding straight through.
export default function ExpenseRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/clinic/expense");
  }, [router]);
  return null;
}
