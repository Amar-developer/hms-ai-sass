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

export type EmailReportSnapshot = {
  reportTitle: string;
  tableTitle: string;
  filterDescription: string;
  summaryHeaders: string[];
  summaryRows: any[][];
  tableHeaders: string[];
  tableRows: any[][];
  exportName: string;
  reportSection: string;
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

  async function sendEmailReport(snapshot: EmailReportSnapshot) {
    setSendMessage("");
    setSendError("");
    if (!fromDate || !toDate) {
      setSendError("Select from date and to date before sending.");
      return;
    }
    const recipients = Array.from(new Set(parseEmailList(recipientInput)));
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
          recipients: recipients.length ? recipients : null,
          cc: null,
          from_date: fromDate,
          to_date: toDate,
          doctor_id: doctorId === "all" ? null : doctorId,
          invoice_type: typeFilter,
          supplier_id: supplierFilter === "all" ? null : supplierFilter,
          supplier_ids: [],
          report_sections: [snapshot.reportSection],
          branch_id: branchId || null,
          report_title: snapshot.reportTitle,
          table_title: snapshot.tableTitle,
          filter_description: snapshot.filterDescription,
          summary_headers: snapshot.summaryHeaders,
          summary_rows: snapshot.summaryRows,
          table_headers: snapshot.tableHeaders,
          table_rows: snapshot.tableRows,
          export_name: snapshot.exportName,
        },
      );
      const nextRecent = Array.from(
        new Set([...(result.recipients || recipients), ...recentEmails]),
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
        `Sent ${result.attachment_filenames.length} filtered report file${result.attachment_filenames.length === 1 ? "" : "s"} to ${result.recipients.join(", ")}.`,
      );
    } catch (err: any) {
      setSendError(err.message || "Could not send the filtered report email.");
    } finally {
      setSendBusy(false);
    }
  }

  return { recalculateMonthlySnapshot, sendEmailReport };
}
