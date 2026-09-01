// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReceiptText } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Sidebar } from "./Sidebar";

afterEach(cleanup);

describe("Sidebar module navigation", () => {
  it("renders ordinary modules as links and records navigation intent without an imperative push", () => {
    const navigatePage = vi.fn();
    const beginNavigation = vi.fn();

    render(
      <Sidebar
        visibleNav={[
          ["clinic", "Clinic Setup", ReceiptText],
          ["billing", "Invoices", ReceiptText],
        ]}
        activePage="expense"
        navigatePage={navigatePage}
        beginNavigation={beginNavigation}
        isSuperAdmin={false}
        canAccessPlatformWorkspace={false}
        reportsOpen={false}
        setReportsOpen={vi.fn()}
        clinicOpen
        setClinicOpen={vi.fn()}
        reportsSection="metrix"
        setReportsSection={vi.fn()}
        tenantAdminSettingsOpen={false}
        setTenantAdminSettingsOpen={vi.fn()}
        tenantAdminSection="files"
        setTenantAdminSection={vi.fn()}
        clinicSection="users"
        setClinicSection={vi.fn()}
        superAdminSettingsOpen={false}
        setSuperAdminSettingsOpen={vi.fn()}
        superAdminSection="overview"
        setSuperAdminSection={vi.fn()}
        visibleTenantAdminSections={[]}
        visibleClinicSections={[]}
        clinicModuleSections={[["expense", "Expense", ReceiptText]]}
        enabled={() => true}
        clinic={{}}
        setSidebarOpen={vi.fn()}
        sideBarOpen
        reportSections={[]}
        reportSection="metrix"
        superAdminSections={[]}
        tabletCollapsed={false}
        setTabletCollapsed={vi.fn()}
      />,
    );

    const link = screen.getByRole("link", { name: /invoices/i });
    expect(link.getAttribute("href")).toBe("/billing");

    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(beginNavigation).toHaveBeenCalledWith("billing", "/billing");
    expect(navigatePage).not.toHaveBeenCalled();

    beginNavigation.mockClear();
    const expenseLink = screen.getByRole("link", { name: /expense/i });
    expect(expenseLink.getAttribute("href")).toBe("/clinic/expense");
    expenseLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(expenseLink);
    expect(beginNavigation).toHaveBeenCalledWith("expense", "/clinic/expense");
    expect(navigatePage).not.toHaveBeenCalled();
  });
});
