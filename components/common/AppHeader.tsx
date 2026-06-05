import React from "react";
import { BrandBlock } from "./BrandBlock";
import CompactControl from "../CompactControl";
import { Bell, LogOut, KeyRound } from "lucide-react";
import ProfileRow from "../ProfileRow";
import { userInitials } from "@/utils/helper";

interface AppHeaderProps {
  isSuperAdmin: boolean;
  apiSession: any;
  tenantOptions: any[];
  switchTenant: (id: string) => void;

  branchId: string;
  setBranchId: any;
  clinic: any;

  departmentId: string;
  setDepartmentId: any;
  departmentOptions: any[];

  canChangeBranch: boolean;
  canChangeDepartment: boolean;

  branchName: string;
  departmentName: string;
  displayClinicName: string;

  activePage: string;
  visibleNav: any[];
  navigatePage: any;

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
  departmentId,
  setDepartmentId,
  departmentOptions,
  canChangeBranch,
  canChangeDepartment,
  branchName,
  departmentName,
  displayClinicName,
  activePage,
  visibleNav,
  navigatePage,
  profileOpen,
  setProfileOpen,
  profileOpenRef,
  roleLabel,
  handleLogout,
  setShowPassword,
  setReportsOpen,
}: AppHeaderProps) => {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur lg:px-5">
      <div className="grid min-w-0 gap-2 grid-cols-[minmax(200px,1.25fr)_minmax(150px,.9fr)_minmax(150px,.9fr)_auto] lg:grid-cols-[minmax(260px,1.25fr)_minmax(180px,.9fr)_minmax(180px,.9fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="lg:hidden">
            <BrandBlock compact setSidebarOpen={setReportsOpen} />
          </div>
          {isSuperAdmin && apiSession ? (
            <CompactControl label="Tenant">
              <select
                value={apiSession.tenantId}
                onChange={(e: any) => switchTenant(e.target.value)}
                className="w-full bg-transparent text-xs lg:text-sm font-semibold outline-none"
              >
                {tenantOptions.map((tenant: any) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            </CompactControl>
          ) : (
            <div className="grid h-12 content-center">
              <span className="text-[10px] font-bold uppercase leading-none text-slate-500">
                Tenant
              </span>
              <h2 className="mt-1 truncate text-lg font-bold leading-tight">
                {displayClinicName}
              </h2>
            </div>
          )}
        </div>

        <CompactControl label="Branch">
          {canChangeBranch ? (
            <select
              value={branchId}
              onChange={(e: any) => setBranchId(e.target.value)}
              className="w-full bg-transparent text-xs lg:text-sm font-semibold outline-none"
            >
              {clinic.branches.map((b: any) => (
                <option key={b.id} value={b.id} >
                  {b.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="truncate">{branchName}</span>
          )}
        </CompactControl>

        <CompactControl label="Medical Department">
          {canChangeDepartment ? (
            <select
              value={departmentId}
              onChange={(e: any) => setDepartmentId(e.target.value)}
              className="w-full bg-transparent text-xs lg:text-sm font-semibold outline-none"
            >
              {departmentOptions.map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="truncate">{departmentName}</span>
          )}
        </CompactControl>

        <div className="flex shrink-0 items-start lg:items-center mt-2 lg:mt-0  lg:mt-0   gap-2">
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500"
            title="Notifications"
          >
            <Bell size={18} />
          </button>
          <div ref={profileOpenRef} className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen(!profileOpen)}
              className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-sm font-black text-white"
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
                    <p className="truncate font-bold text-slate-900">
                      {apiSession?.user?.name || roleLabel}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {apiSession?.email || "Not connected"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-xs">
                  <ProfileRow label="Role" value={roleLabel} />
                  <ProfileRow
                    label="Tenant"
                    value={apiSession?.tenantId || clinic.id}
                  />
                  <ProfileRow label="Branch" value={branchName} />
                  <ProfileRow
                    label="Medical Department"
                    value={departmentName}
                  />
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
