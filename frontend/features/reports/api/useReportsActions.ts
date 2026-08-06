"use client";

import type { ApiSession } from "@/lib/api";
import { isEmail, parseEmailList } from "../helpers";
import * as reportsApi from "./reports.api";

type UseReportsActionsParams = {
  apiSession: ApiSession | null | undefined;
  branchId?: string;
  fromDate: string;
  toDate: string;
  doctorId: string;
  typeFilter: string;
  supplierFilter: string;
  emailLabSupplierIds: string[];
  emailReportSections: string[];
  recipientInput: string;
  recentEmails: string[];
  setRecentEmails: (value: string[]) => void;
  setSendBusy: (value: boolean) => void;
  setSendMessage: (value: string) => void;
  setSendError: (value: string) => void;
  setSendPanelOpen: (value: boolean) => void;
  setSnapshotMessage: (value: string) => void;
  setRecalculatingSnapshotId: (value: string | null) => void;
  refreshReports: () => Promise<void>;
};

/**
 * Write / on-demand actions for the reports workspace: recalculating a
 * closed-month snapshot and emailing the profit report.
 */
export function useReportsActions({
  apiSession,
  branchId,
  fromDate,
  toDate,
  doctorId,
  typeFilter,
  supplierFilter,
  emailLabSupplierIds,
  emailReportSections,
  recipientInput,
  recentEmails,
  setRecentEmails,
  setSendBusy,
  setSendMessage,
  setSendError,
  setSendPanelOpen,
  setSnapshotMessage,
  setRecalculatingSnapshotId,
  refreshReports,
}: UseReportsActionsParams) {
  async function recalculateMonthlySnapshot(snapshot: any) {
    if (!apiSession?.tenantId || !snapshot) return;
    setSnapshotMessage("");
    setRecalculatingSnapshotId(snapshot.id);
    try {
      await reportsApi.archiveMonthlySnapshot(apiSession, {
        year: snapshot.period_year,
        month: snapshot.period_month,
        overwrite: true,
      });
      setSnapshotMessage(`${snapshot.period_label} recalculated`);
      await refreshReports();
    } catch (error: any) {
      setSnapshotMessage(error?.message || "Recalculate failed");
    } finally {
      setRecalculatingSnapshotId(null);
    }
  }

  async function sendEmailReport() {
    setSendMessage("");
    setSendError("");
    if (!fromDate || !toDate) {
      setSendError("Select from date and to date before sending.");
      return;
    }
    const recipients = Array.from(new Set(parseEmailList(recipientInput)));
    if (recipients.length === 0) {
      setSendError("Enter at least one email address.");
      return;
    }
    const invalidEmail = recipients.find((email) => !isEmail(email));
    if (invalidEmail) {
      setSendError(`Check email address: ${invalidEmail}`);
      return;
    }
    setSendBusy(true);
    try {
      const result = await reportsApi.sendProfitEmailReport(
        apiSession as ApiSession,
        {
          recipients,
          from_date: fromDate,
          to_date: toDate,
          doctor_id: doctorId === "all" ? null : doctorId,
          invoice_type: typeFilter,
          supplier_id: supplierFilter === "all" ? null : supplierFilter,
          supplier_ids: emailLabSupplierIds.includes("all")
            ? []
            : emailLabSupplierIds,
          report_sections: emailReportSections,
          branch_id: branchId || null,
        },
      );
      const nextRecent = Array.from(
        new Set([...recipients, ...recentEmails]),
      ).slice(0, 6);
      setRecentEmails(nextRecent);
      if (typeof window !== "undefined" && apiSession?.tenantId) {
        window.localStorage.setItem(
          `medizinhub.reportEmails.${apiSession.tenantId}`,
          JSON.stringify(nextRecent),
        );
      }
      setSendPanelOpen(false);
      setSendMessage(
        `Sent to ${result.recipients.join(", ")} with ${result.attachment_filenames.length} Excel files.`,
      );
    } catch (err: any) {
      setSendError(err.message || "Could not send report email.");
    } finally {
      setSendBusy(false);
    }
  }

  return { recalculateMonthlySnapshot, sendEmailReport };
}
