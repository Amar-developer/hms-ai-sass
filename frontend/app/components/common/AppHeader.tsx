import React from "react";
import { ChevronDown, KeyRound, LogOut } from "lucide-react";
import ProfileRow from "../ProfileRow";
import { userIcon, userInitials } from "@/utils/helper";
import { GlobalSearch } from "./GlobalSearch";
import { SearchableSelect } from "./ui";
import {
  canCopyDatabaseIds,
  CopyIdButton,
} from "./CopyIdButton";
import { NotificationCenter } from "./NotificationCenter";
import type { AppNavigationTarget } from "@/lib/navigationTarget";

interface AppHeaderProps {
  isSuperAdmin: boolean;
  apiSession: any;
  tenantOptions: any[];
  switchTenant: (id: string) => void;

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
  setReportsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  navigatePage: (target: AppNavigationTarget) => void;
}

const AppHeader = ({
  isSuperAdmin,
  apiSession,
  tenantOptions,
  switchTenant,
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
  setReportsOpen,
  navigatePage,
}: AppHeaderProps) => {
  const [helpOpen, setHelpOpen] = React.useState(false);
  const canCopyIds = canCopyDatabaseIds(apiSession?.user);
  const { initials, color } = userIcon(
  apiSession?.user?.name
);

  return (
    <header className="sticky top-0 z-20 shadow-sm  bg-white/95 px-4 py-2 backdrop-blur lg:px-5">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 md:grid-cols-[minmax(260px,1fr)_minmax(260px,420px)_minmax(140px,210px)_auto]">
        <div className="min-w-0 self-center">
          {isSuperAdmin && apiSession ? (
            <SearchableSelect
              value={clinic?.id || ""}
              onChange={(value: string) => switchTenant(value)}
              searchable={false}
              options={tenantOptions}
            />
          ) : (
            <h2 className="whitespace-nowrap text-[13px] font-black leading-tight text-slate-950 lg:text-base">
              {displayClinicName}
            </h2>
          )}
        </div>
        <div className="order-3 min-w-0 md:order-none">
          <GlobalSearch items={searchItems} />
        </div>
        <div className="order-4 min-w-0 md:order-none">
          {canChangeBranch ? (
            <SearchableSelect
              value={branchId}
              onChange={(value: string) => setBranchId(value)}
              searchable={false}
              options={clinic.branches.map((b: any) => ({
                label: b.name,
                value: b.id,
              }))}
              className="border-0"
            />
          ) : (
            <span className="block truncate rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold">
              {branchName}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1 border-l border-slate-200 pl-2">
          <NotificationCenter
            apiSession={apiSession}
            navigatePage={navigatePage}
            onOpen={() => setProfileOpen(false)}
          />
          <div className="relative">
            <button
              type="button"
              onClick={() => setHelpOpen((value) => !value)}
              className="inline-flex h-9 items-center gap-1 px-2 text-xs font-semibold text-slate-700 hover:text-slate-950"
              aria-expanded={helpOpen}
            >
              Help <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {helpOpen && (
              <div className="absolute right-0 top-10 z-40 w-64 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xl">
                <p className="font-black text-slate-900">Quick help</p>
                <p className="mt-2 text-slate-600">Press Ctrl + G to search and open any module.</p>
                <p className="mt-1 text-slate-600">Use the OPD tabs to move between appointments, consultation, templates, and invoices.</p>
              </div>
            )}
          </div>
          <span className="h-5 w-px bg-slate-200" />
          <div ref={profileOpenRef} className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen(!profileOpen)}
              className={`grid h-9 w-9 place-items-center rounded-full bg-slate-900 text-xs font-black text-white ${color}`}
              title="Profile"
            >
              {initials}
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-12 z-40 w-80 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-xl">
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
    </header>
  );
};

export default AppHeader;
