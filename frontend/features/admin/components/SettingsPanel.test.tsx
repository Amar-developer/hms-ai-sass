// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsPanel } from "./SettingsPanel";

function renderSettingsPanel() {
  const noop = vi.fn();
  render(
    <SettingsPanel
      settings={[{ id: "setting-1", key: "timezone", value: "Asia/Kolkata" }]}
      invoicePrefix="MHB"
      setInvoicePrefix={noop}
      numberingRules={{
        prefix: "MHB",
        digits: 5,
        entities: { patient: "PAT", appointment: "APT" },
      }}
      setNumberingRules={noop}
      invoiceLogoUrl=""
      setInvoiceLogoUrl={noop}
      bankDetails={{}}
      setBankDetails={noop}
      tenantLogoUrl=""
      files={[]}
      uploadInvoiceLogo={noop}
      requeueAfter={2}
      setRequeueAfter={noop}
      noShowAfter={3}
      setNoShowAfter={noop}
      slotIntervalsEnabled={false}
      setSlotIntervalsEnabled={noop}
      slotIntervalMinutes={5}
      setSlotIntervalMinutes={noop}
      payments="cash,upi"
      setPayments={noop}
      providers="whatsapp,sms,voice"
      setProviders={noop}
      busy={false}
      saveSettings={noop}
      reportEnabled={false}
      setReportEnabled={noop}
      reportRecipients="owner@example.com"
      setReportRecipients={noop}
      reportCc=""
      setReportCc={noop}
      reportSendDay={1}
      setReportSendDay={noop}
      reportFilters={{ overall: true }}
      setReportFilters={noop}
      reportJobs={[]}
      reportBusy=""
      saveReportSettings={noop}
      sendMonthlyReportNow={noop}
      resendMonthlyReport={noop}
      downloadMonthlyReport={noop}
    />,
  );
}

describe("Tenant and branch settings workspace", () => {
  afterEach(cleanup);

  it("preserves every settings section in four workspace tabs", () => {
    renderSettingsPanel();

    expect(
      screen.getByRole("tablist", {
        name: "Tenant and branch workspace sections",
      }),
    ).toBeTruthy();
    for (const name of [
      "Branch Operations",
      "Numbering & Invoice",
      "Accounts",
      "Monthly Reports",
    ]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }

    const numberingTab = screen.getByRole("tab", {
      name: "Numbering & Invoice",
    });
    fireEvent.click(numberingTab);
    expect(numberingTab.getAttribute("aria-selected")).toBe("true");
    expect(
      screen.getByRole("heading", {
        name: "Document Numbering & Invoice Identity",
      }),
    ).toBeTruthy();
    expect(screen.getByDisplayValue("MHB")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Accounts" }));
    expect(
      screen.getByRole("heading", { name: "Accounts & Bank Details" }),
    ).toBeTruthy();
    expect(screen.getByPlaceholderText("Tenant legal account name")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Monthly Reports" }));
    expect(
      screen.getByRole("heading", { name: "Monthly Email Reports" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Send Last Month Now" }),
    ).toBeTruthy();
  });
});
