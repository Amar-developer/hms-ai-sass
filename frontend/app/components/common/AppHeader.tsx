import React from "react";
import { ChevronDown, KeyRound, LogOut, Settings } from "lucide-react";
import ProfileRow from "../ProfileRow";
import { userIcon, userInitials } from "@/utils/helper";
import { GlobalSearch } from "./GlobalSearch";
import { SearchableSelect } from "./ui";
import { BrandBlock } from "./BrandBlock";
import { canCopyDatabaseIds, CopyIdButton } from "./CopyIdButton";
import { NotificationCenter } from "./NotificationCenter";
import type { AppNavigationTarget } from "@/lib/navigationTarget";

interface AppHeaderProps {
  isPlatformWorkspace: boolean;
  apiSession: any;
  branchId: string;
  setBranchId: any;
  clinic: any;
  canChangeBranch: boolean;
  isDoctorUser: boolean;
  branchName: string;
  departmentNames: string[];
  displayClinicName: string;
  searchItems: any[];
  profileOpen: boolean;
  setProfileOpen: any;
  profileOpenRef: any;
  roleLabel: string;
  handleLogout: any;
  setShowPassword: any;
  navigatePage: (target: AppNavigationTarget) => void;
  settingsSections: any[];
  activeSettingsSection: string;
  tabletCollapsed: boolean;
  setTabletCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sideBarOpen: boolean;
}

const AppHeader = ({
  isPlatformWorkspace,
  apiSession,
  branchId,
  setBranchId,
  clinic,
  canChangeBranch,
  isDoctorUser,
  branchName,
  departmentNames,
  displayClinicName,
  searchItems,
  profileOpen,
  setProfileOpen,
  profileOpenRef,
  roleLabel,
  handleLogout,
  setShowPassword,
  navigatePage,
  settingsSections,
  activeSettingsSection,
  tabletCollapsed,
  setTabletCollapsed,
  setSidebarOpen,
  sideBarOpen,
}: AppHeaderProps) => {
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const settingsRef = React.useRef<HTMLDivElement>(null);
  const canCopyIds = canCopyDatabaseIds(apiSession?.user);
  const { initials, color } = userIcon(apiSession?.user?.name);

  React.useEffect(() => {
    function closeMenus(event: MouseEvent) {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener("mousedown", closeMenus);
    return () => document.removeEventListener("mousedown", closeMenus);
  }, []);

  return (
    <header className="relative z-50 shrink-0 border-b border-slate-200 bg-white shadow-sm">
      <div className="flex min-h-14 min-w-0 items-stretch">
        <div
          className={`hidden shrink-0 items-center px-2 transition-[width] duration-300 md:flex ${
            tabletCollapsed ? "md:w-16" : "md:w-64"
          } lg:w-64`}
        >
          <BrandBlock
            tabletCollapsed={tabletCollapsed}
            setTabletCollapsed={setTabletCollapsed}
            setSidebarOpen={setSidebarOpen}
            sideBarOpen={sideBarOpen}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 px-3 py-2 lg:flex-nowrap lg:px-4">
          <div className="flex min-w-0 items-center md:hidden">
            <BrandBlock
              compact
              tabletCollapsed
              setTabletCollapsed={setTabletCollapsed}
              setSidebarOpen={setSidebarOpen}
              sideBarOpen={sideBarOpen}
            />
          </div>

          <div className="order-3 mx-auto w-full min-w-[220px] max-w-2xl flex-[1_1_360px] md:order-none">
            <GlobalSearch items={searchItems} />
          </div>

          <div className="order-4 w-[clamp(9rem,16vw,13rem)] min-w-0 flex-none md:order-none">
            {canChangeBranch ? (
              <SearchableSelect
                value={branchId}
                onChange={(value: string) => setBranchId(value)}
                searchable={false}
                options={clinic.branches.map((b: any) => ({
                  label: b.name,
                  value: b.id,
                }))}
                className="min-w-0 border-0"
              />
            ) : (
              <span
                className="block truncate rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold"
                title={branchName}
              >
                {branchName}
              </span>
            )}
          </div>

          <div className="ml-auto flex shrink-0 items-center justify-end gap-1 border-l border-slate-200 pl-2">
            <NotificationCenter
              apiSession={apiSession}
              navigatePage={navigatePage}
              onOpen={() => {
                setProfileOpen(false);
                setSettingsOpen(false);
              }}
            />

            {settingsSections.length > 0 && (
              <div ref={settingsRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen((value) => !value);
                    setHelpOpen(false);
                    setProfileOpen(false);
                  }}
                  className={`grid h-9 w-9 place-items-center rounded-lg border transition ${
                    settingsOpen
                      ? "border-brand bg-success-subtle text-brand"
                      : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                  aria-label="Settings"
                  aria-expanded={settingsOpen}
                  title="Settings"
                >
                  <Settings size={19} />
                </button>

                {settingsOpen && (
                  <div className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                    <div className="border-b border-slate-100 px-4 py-3">
                      <p className="text-sm font-black text-slate-950">
                        {isPlatformWorkspace ? "Platform settings" : "Workspace settings"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Manage configuration, access, and preferences.
                      </p>
                    </div>
                    <div className="max-h-[min(28rem,70vh)] overflow-y-auto p-2">
                      {settingsSections.map(
                        ([sectionId, sectionLabel, SectionIcon]: any) => (
                          <button
                            key={sectionId}
                            type="button"
                            onClick={() => {
                              navigatePage({
                                id: isPlatformWorkspace ? "superadmin" : "admin",
                                section: sectionId,
                              });
                              setSettingsOpen(false);
                            }}
                            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                              activeSettingsSection === sectionId
                                ? "bg-success-subtle text-brand"
                                : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                              <SectionIcon size={17} />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-bold">
                                {sectionLabel}
                              </span>
                              <span className="block truncate text-[11px] text-slate-500">
                                Open {sectionLabel.toLowerCase()} settings
                              </span>
                            </span>
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => {
                  setHelpOpen((value) => !value);
                  setSettingsOpen(false);
                }}
                className="inline-flex h-9 items-center gap-1 px-2 text-xs font-semibold text-slate-700 hover:text-slate-950"
                aria-expanded={helpOpen}
              >
                Help <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {helpOpen && (
                <div className="absolute right-0 top-10 z-40 w-64 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xl">
                  <p className="font-black text-slate-900">Quick help</p>
                  <p className="mt-2 text-slate-600">
                    Press Ctrl + G to search and open any module.
                  </p>
                  <p className="mt-1 text-slate-600">
                    Use the OPD tabs to move between appointments, consultation,
                    templates, and invoices.
                  </p>
                </div>
              )}
            </div>

            <span className="hidden h-5 w-px bg-slate-200 sm:block" />
            <div ref={profileOpenRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(!profileOpen);
                  setSettingsOpen(false);
                  setHelpOpen(false);
                }}
                className={`grid h-9 w-9 place-items-center rounded-full bg-slate-900 text-xs font-black text-white ${color}`}
                title="Profile"
              >
                {initials}
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-12 z-40 w-[min(20rem,calc(100vw-1rem))] rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-xl">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-900 font-black text-white">
                      {userInitials(apiSession?.user, apiSession?.email)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="truncate font-bold text-slate-900">
                          {apiSession?.user?.name || roleLabel}
                        </p>
                        <CopyIdButton
                          value={apiSession?.user?.id}
                          label="User ID"
                          allowed={canCopyIds}
                        />
                      </div>
                      <p className="truncate text-xs text-slate-500">
                        {apiSession?.email || "Not connected"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs">
                    <ProfileRow label="Role" value={roleLabel} />
                    <ProfileRow
                      label="Tenant"
                      value={displayClinicName}
                      action={
                        <CopyIdButton
                          value={apiSession?.tenantId || clinic.id}
                          label="Tenant ID"
                          allowed={canCopyIds}
                        />
                      }
                    />
                    <ProfileRow label="Branch" value={branchName} />
                    {isDoctorUser && (
                      <ProfileRow
                        label="Medical Department"
                        value={
                          departmentNames.length
                            ? departmentNames.join(", ")
                            : "No assigned medical department"
                        }
                        wrap
                      />
                    )}
                  </div>
                  <div className="mt-4 grid gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        setShowPassword(true);
                      }}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <KeyRound size={16} /> Change Password
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left text-sm font-bold text-red-600 hover:bg-red-50"
                    >
                      <LogOut size={16} /> Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
