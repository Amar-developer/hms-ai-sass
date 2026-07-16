import React from "react";
import CompactControl from "./CompactControl";
import { Bell, LogOut, KeyRound } from "lucide-react";
import ProfileRow from "../ProfileRow";
import { userInitials } from "@/utils/helper";
import { GlobalSearch } from "./GlobalSearch";
import { SearchableSelect } from "./ui";
import { FormField } from "../FormElements";
import {
  canCopyDatabaseIds,
  CopyIdButton,
} from "./CopyIdButton";

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
}: AppHeaderProps) => {
  const canCopyIds = canCopyDatabaseIds(apiSession?.user);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:px-5">
      <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-[minmax(200px,1.15fr)_minmax(150px,.8fr)_minmax(220px,1fr)_auto] lg:grid-cols-[minmax(260px,1.15fr)_minmax(180px,.8fr)_minmax(280px,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          {isSuperAdmin && apiSession ? (
            <FormField label="Tenant">
              <SearchableSelect
                value={clinic?.id || ""}
                onChange={(value: string) => switchTenant(value)}
                searchable={false}
                options={tenantOptions}
              />
            </FormField>
          ) : (
            <div className="grid h-11 content-center">
              <span className="text-[10px] font-bold uppercase leading-none text-slate-500">
                Tenant
              </span>
              <h2 className="mt-1 truncate text-lg font-bold leading-tight">
                {displayClinicName}
              </h2>
            </div>
          )}
        </div>
        <FormField label="Search">
          <GlobalSearch items={searchItems} />
        </FormField>
        <FormField label="Branch">
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
            <span className="truncate">{branchName}</span>
          )}
        </FormField>

        <div className="flex shrink-0 items-start lg:items-center mt-3  gap-2">
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-500"
            title="Notifications"
          >
            <Bell size={18} />
          </button>
          <div ref={profileOpenRef} className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen(!profileOpen)}
              className="grid h-10 w-10 place-items-center rounded-full bg-slate-900 text-sm font-black text-white"
              title="Profile"
            >
              {userInitials(apiSession?.user, apiSession?.email)}
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
