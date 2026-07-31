"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as physiotherapyApi from "./physiotherapy.api";

type UsePhysiotherapyCaseDetailParams = {
  apiSession: ApiSession | null | undefined;
  caseId?: string;
};

/**
 * Owns the selected physiotherapy case's sessions and generated invoice
 * (if any). Reloads whenever the selected case changes, and exposes
 * `loadSessions` / `loadInvoice` so callers can refresh either one after a
 * mutation (recording a session, generating an invoice).
 */
export function usePhysiotherapyCaseDetail({
  apiSession,
  caseId,
}: UsePhysiotherapyCaseDetailParams) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [invoiceDetail, setInvoiceDetail] = useState<any>(null);
  const [sessionsError, setSessionsError] = useState("");

  async function loadSessions(id: string) {
    if (!apiSession) return;
    try {
      setSessions(await physiotherapyApi.listCaseSessions(apiSession, id));
    } catch (err: any) {
      setSessionsError(err.message || "Unable to load physiotherapy sessions.");
    }
  }

  async function loadInvoice(id: string) {
    if (!apiSession) return;
    setInvoiceDetail(null);
    try {
      const detail = await physiotherapyApi.getPhysiotherapyInvoice(
        apiSession,
        id,
      );
      setInvoiceDetail(detail);
    } catch {}
  }

  useEffect(() => {
    if (caseId) {
      loadSessions(caseId);
      loadInvoice(caseId);
    }
  }, [caseId]);

  return {
    sessions,
    invoiceDetail,
    setInvoiceDetail,
    sessionsError,
    loadSessions,
    loadInvoice,
  };
}
