// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { ReceiptText } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { Sidebar } from "./Sidebar";

describe("Sidebar module navigation", () => {
  it("renders ordinary modules as links and records navigation intent without an imperative push", () => {
    const navigatePage = vi.fn();
    const beginNavigation = vi.fn();

    render(
      <Sidebar
        visibleNav={[["billing", "Invoices", ReceiptText]]}
        activePage="expense"
        navigatePage={navigatePage}
        beginNavigation={beginNavigation}
        isSuperAdmin={false}
        canAccessPlatformWorkspace={false}
        reportsOpen={false}
        setReportsOpen={vi.fn()}
        clinicOpen={false}
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
        clinicModuleSections={[]}
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
  });
});
