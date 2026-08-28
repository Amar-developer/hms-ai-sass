// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { SlidersHorizontal } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import AppHeader from "./AppHeader";

vi.mock("./BrandBlock", () => ({
  BrandBlock: () => <div>MedizinHub HMS</div>,
}));

vi.mock("./GlobalSearch", () => ({
  GlobalSearch: () => <div>Global search</div>,
}));

vi.mock("./NotificationCenter", () => ({
  NotificationCenter: () => <button type="button">Notifications</button>,
}));

vi.mock("./CopyIdButton", () => ({
  canCopyDatabaseIds: () => false,
  CopyIdButton: () => null,
}));

vi.mock("./ui", () => ({
  SearchableSelect: () => <div>Branch selector</div>,
}));

describe("AppHeader settings navigation", () => {
  it("opens settings from the header and navigates to the selected tenant section", () => {
    const navigatePage = vi.fn();

    render(
      <AppHeader
        isPlatformWorkspace={false}
        apiSession={{ user: { name: "Admin User" }, email: "admin@example.com" }}
        branchId="branch-1"
        setBranchId={vi.fn()}
        clinic={{ id: "tenant-1", branches: [{ id: "branch-1", name: "Main Branch" }] }}
        canChangeBranch
        isDoctorUser={false}
        branchName="Main Branch"
        departmentNames={[]}
        displayClinicName="MedizinHub Healthcare Service"
        searchItems={[]}
        profileOpen={false}
        setProfileOpen={vi.fn()}
        profileOpenRef={{ current: null }}
        roleLabel="Tenant Admin"
        handleLogout={vi.fn()}
        setShowPassword={vi.fn()}
        navigatePage={navigatePage}
        settingsSections={[["preferences", "Preferences", SlidersHorizontal]]}
        activeSettingsSection="preferences"
        tabletCollapsed={false}
        setTabletCollapsed={vi.fn()}
        setSidebarOpen={vi.fn()}
        sideBarOpen
      />,
    );

    expect(screen.queryByText("MedizinHub Healthcare Service")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByText("Workspace settings")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /preferences/i }));
    expect(navigatePage).toHaveBeenCalledWith({
      id: "admin",
      section: "preferences",
    });
  });
});
