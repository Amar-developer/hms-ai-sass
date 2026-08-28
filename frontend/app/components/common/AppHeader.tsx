import React from "react";
import {
  AtSign,
  BookOpen,
  Building2,
  ChevronDown,
  HeartPulse,
  Info,
  KeyRound,
  Keyboard,
  LogOut,
  MapPin,
  Settings,
  ShieldCheck,
  Stethoscope,
  X,
} from "lucide-react";
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
  const [aboutOpen, setAboutOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const settingsRef = React.useRef<HTMLDivElement>(null);
  const helpRef = React.useRef<HTMLDivElement>(null);
  const canCopyIds = canCopyDatabaseIds(apiSession?.user);
  const { initials } = userIcon(apiSession?.user?.name);

  React.useEffect(() => {
    function closeMenus(event: MouseEvent) {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
      if (!helpRef.current?.contains(event.target as Node)) {
        setHelpOpen(false);
      }
    }
    document.addEventListener("mousedown", closeMenus);
    return () => document.removeEventListener("mousedown", closeMenus);
  }, []);

  React.useEffect(() => {
    if (!aboutOpen) return undefined;

    function closeAbout(event: KeyboardEvent) {
      if (event.key === "Escape") setAboutOpen(false);
    }

    document.addEventListener("keydown", closeAbout);
    return () => document.removeEventListener("keydown", closeAbout);
  }, [aboutOpen]);

  const productCapabilities = [
    "Patient care",
    "OPD & consultations",
    "Diagnostics & pharmacy",
    "Billing & revenue",
    "Home care visits",
    "Reports & administration",
  ];

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

            <div ref={helpRef} className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => {
                  setHelpOpen((value) => !value);
                  setSettingsOpen(false);
                  setProfileOpen(false);
                }}
                className={`inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition ${
                  helpOpen
                    ? "bg-success-subtle text-brand"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                }`}
                aria-expanded={helpOpen}
                aria-haspopup="menu"
              >
                Help <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {helpOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-10 z-50 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
                >
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="text-sm font-black text-slate-950">
                      Help &amp; information
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Guidance for your MedizinHub workspace.
                    </p>
                  </div>

                  <div className="p-2">
                    <div className="flex items-start gap-3 rounded-lg px-3 py-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                        <BookOpen size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-bold text-slate-800">
                          Quick help
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
                          Search and open any module from the header.
                        </span>
                      </span>
                    </div>

                    <div className="flex items-center gap-3 rounded-lg px-3 py-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-violet-100">
                        <Keyboard size={16} />
                      </span>
                      <span className="min-w-0 flex-1 text-xs font-bold text-slate-800">
                        Global search
                      </span>
                      <kbd className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-500">
                        Ctrl + G
                      </kbd>
                    </div>

                    <div className="my-1 border-t border-slate-100" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setHelpOpen(false);
                        setAboutOpen(true);
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-slate-50"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-brand ring-1 ring-emerald-100">
                        <Info size={16} />
                      </span>
                      <span>
                        <span className="block text-xs font-bold text-slate-800">
                          About MedizinHub HMS
                        </span>
                        <span className="mt-0.5 block text-[11px] text-slate-500">
                          Product and workspace information
                        </span>
                      </span>
                    </button>
                  </div>
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
                className="grid h-9 w-9 place-items-center rounded-full bg-brand text-xs font-black text-brand-fg transition hover:bg-brand-hover"
                title="Profile"
              >
                {initials}
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-12 z-40 w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-white text-sm shadow-[0_24px_60px_-20px_rgba(15,23,42,0.45)]">
                  <div className="relative overflow-hidden border-b border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-slate-50 px-4 pb-4 pt-5 text-slate-900">
                    <div className="absolute -right-10 -top-12 h-32 w-32 rounded-full bg-emerald-200/60 blur-2xl" />
                    <div className="relative flex items-center gap-3">
                      <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand font-black text-brand-fg shadow-lg shadow-emerald-900/15">
                        {userInitials(apiSession?.user, apiSession?.email)}
                        <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <p className="truncate text-sm font-black">
                            {apiSession?.user?.name || roleLabel}
                          </p>
                          <CopyIdButton
                            value={apiSession?.user?.id}
                            label="User ID"
                            allowed={canCopyIds}
                          />
                        </div>
                        {apiSession?.user?.username && (
                          <p className="mt-0.5 truncate text-xs font-semibold text-brand">
                            @{apiSession.user.username}
                          </p>
                        )}
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {apiSession?.email || "Not connected"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-1 p-3 text-xs">
                    <ProfileRow icon={ShieldCheck} label="Role" value={roleLabel} />
                    <ProfileRow
                      icon={Building2}
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
                    <ProfileRow icon={MapPin} label="Branch" value={branchName} />
                    {isDoctorUser && (
                      <ProfileRow
                        icon={Stethoscope}
                        label="Medical Department"
                        value={
                          departmentNames.length
                            ? departmentNames.join(", ")
                            : "No assigned medical department"
                        }
                        wrap
                      />
                    )}
                    {!apiSession?.user?.username && (
                      <ProfileRow
                        icon={AtSign}
                        label="Username"
                        value="Not assigned"
                      />
                    )}
                  </div>

                  <div className="grid gap-2 border-t border-slate-100 bg-slate-50 p-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        setShowPassword(true);
                      }}
                      className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                    >
                      <KeyRound size={16} /> Change Password
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex items-center justify-center gap-2 rounded-xl border border-red-100 bg-white px-3 py-2.5 text-xs font-bold text-red-600 transition hover:bg-red-50"
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

      {aboutOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAboutOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-medizinhub-title"
            className="max-h-[calc(100vh-3rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-brand-fg shadow-sm">
                  <HeartPulse size={21} />
                </span>
                <div>
                  <h2
                    id="about-medizinhub-title"
                    className="text-base font-black text-slate-950"
                  >
                    About MedizinHub HMS
                  </h2>
                  <p className="text-xs text-slate-500">
                    Connected healthcare operations
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAboutOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close About MedizinHub HMS"
              >
                <X size={19} />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-slate-50 p-4">
                <p className="text-sm font-black text-slate-950">
                  MedizinHub Healthcare Management System
                </p>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">
                  A unified healthcare workspace that helps care teams manage
                  patients, clinical services, operations and financial workflows
                  across every branch.
                </p>
              </div>

              <div>
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Application details
                </h3>
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                  {[
                    ["Product", "MedizinHub HMS"],
                    ["Workspace", displayClinicName],
                    ["Current branch", branchName],
                    ["Your access", roleLabel],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="grid gap-1 border-b border-slate-100 px-4 py-3 last:border-b-0 sm:grid-cols-[9rem_1fr]"
                    >
                      <span className="text-xs font-bold text-slate-500">
                        {label}
                      </span>
                      <span className="break-words text-xs font-black text-slate-900">
                        {value || "Not available"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Healthcare capabilities
                </h3>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {productCapabilities.map((capability) => (
                    <div
                      key={capability}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-xs font-bold text-slate-700"
                    >
                      <ShieldCheck className="h-4 w-4 shrink-0 text-brand" />
                      {capability}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-center text-[11px] text-slate-500">
              MedizinHub HMS · Built for coordinated, patient-centred care
            </div>
          </section>
        </div>
      )}
    </header>
  );
};

export default AppHeader;
