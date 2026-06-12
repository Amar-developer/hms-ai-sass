import { ChevronDown, Settings } from "lucide-react";
import { BrandBlock } from "./BrandBlock";

interface SidebarProps {
  visibleNav: any[];
  activePage: string;
  navigatePage: (page: any) => void;

  isSuperAdmin: boolean;

  reportsOpen: boolean;
  setReportsOpen: any;
  reportsSection: string;
  setReportsSection: any;

  tenantAdminSettingsOpen: boolean;
  setTenantAdminSettingsOpen: any;

  tenantAdminSection: string;
  setTenantAdminSection: any;

  superAdminSettingsOpen: boolean;
  setSuperAdminSettingsOpen: any;

  superAdminSection: string;
  setSuperAdminSection: any;

  visibleTenantAdminSections: any[];
  enabled: any;
  clinic: any;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sideBarOpen:boolean
  reportSections: any;
  reportSection: any;
  superAdminSections: any;
  tabletCollapsed: boolean;
  setTabletCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}

export function Sidebar(props: SidebarProps) {
  return (
    <aside
      className={`
    h-screen shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-2
    hidden md:block
    transition-all duration-300 scrollbar-hidden
    ${props.tabletCollapsed ? "md:w-18" : "md:w-64"}
    lg:w-72
  `}
    >
      <BrandBlock
        tabletCollapsed={props.tabletCollapsed}
        setTabletCollapsed={props.setTabletCollapsed}
        setSidebarOpen={props.setSidebarOpen}
        sideBarOpen={props.sideBarOpen}
      />
      <nav className="mt-8 space-y-2">
        {props.visibleNav.map(([id, label, Icon]: any) => {
          const isActive = props.activePage === id;
          if (id === "superadmin" && props.isSuperAdmin) {
            return (
              <div key={id}>
                <button
                  type="button"
                  onClick={() => {
                    props.navigatePage(id);
                    props.setSuperAdminSettingsOpen(
                      !props.superAdminSettingsOpen,
                    );
                    props.setReportsOpen(!props.reportsOpen);
                  }}
                  className={`flex w-full items-center rounded-2xl py-3
                  ${props.tabletCollapsed ? "justify-center px-0" : "gap-3 px-4"}`}
                >
                  <Icon size={18} />
                  {!props.tabletCollapsed && (
                    <span className="truncate text-xs lg:text-sm">{label}</span>
                  )}
                  {!props.tabletCollapsed && (
                    <ChevronDown
                      size={16}
                      className={
                        props.superAdminSettingsOpen ? "rotate-180" : ""
                      }
                    />
                  )}
                </button>
                {!props.tabletCollapsed &&
                  isActive &&
                  props.superAdminSettingsOpen && (
                    <div className="mt-2 grid gap-1 pl-5">
                      <div className="mb-1 flex items-center gap-2 px-3 text-xs font-bold uppercase text-slate-400">
                        <Settings size={13} />
                        Settings
                      </div>
                      {props.superAdminSections.map(
                        ([sectionId, sectionLabel, SectionIcon]: any) => (
                          <button
                            key={sectionId}
                            type="button"
                            onClick={() => {
                              props.navigatePage("superadmin");
                              props.setSuperAdminSection(sectionId);
                            }}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-bold ${
                              props.superAdminSection === sectionId
                                ? "bg-slate-100 text-slate-950"
                                : "text-slate-500 hover:bg-slate-50"
                            }`}
                          >
                            <SectionIcon size={15} />
                            {!props.tabletCollapsed && (
                              <span className="truncate text-xs lg:text-sm">
                                {label}
                              </span>
                            )}
                          </button>
                        ),
                      )}
                    </div>
                  )}
              </div>
            );
          }
          if (id === "admin" && !props.isSuperAdmin) {
            return (
              <div key={id}>
                <button
                  type="button"
                  onClick={() => {
                    props.navigatePage(id);
                      props.setTenantAdminSettingsOpen(true);
                    if (props.visibleTenantAdminSections.length > 0) {
                      props.setTenantAdminSection(
                        props.visibleTenantAdminSections[0][0],
                      );
                    }
                  }}
                  className={`flex w-full items-center rounded-2xl py-3
${props.tabletCollapsed ? "justify-center px-0" : "gap-3 px-4"}`}
                >
                  <Icon size={18} />
                  {!props.tabletCollapsed && (
                    <span className="truncate text-xs lg:text-sm">{label}</span>
                  )}
                  {!props.tabletCollapsed && (
                    <ChevronDown
                      size={16}
                      className={
                        props.tenantAdminSettingsOpen ? "rotate-180" : ""
                      }
                    />
                  )}
                </button>
                {!props.tabletCollapsed &&
                  isActive &&
                  props.tenantAdminSettingsOpen && (
                    <div className="mt-2 grid gap-1 pl-5">
                      <div className="mb-1 flex items-center gap-2 px-3 text-xs font-bold uppercase text-slate-400">
                        <Settings size={13} />
                        Settings
                      </div>
                      {props.visibleTenantAdminSections.map(
                        ([sectionId, sectionLabel, SectionIcon]: any) => (
                          <button
                            key={sectionId}
                            type="button"
                            onClick={() => {
                              props.navigatePage("admin");
                              props.setTenantAdminSection(sectionId);
                            }}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-bold ${
                              props.tenantAdminSection === sectionId
                                ? "bg-slate-100 text-slate-950"
                                : "text-slate-500 hover:bg-slate-50"
                            }`}
                          >
                            <SectionIcon size={15} />
                            {!props.tabletCollapsed && (
                              <span className="truncate text-xs lg:text-sm">
                                {sectionLabel}
                              </span>
                            )}
                          </button>
                        ),
                      )}
                    </div>
                  )}
              </div>
            );
          }
          if (id === "reports") {
            return (
              <div key={id}>
                <button
                  type="button"
                  onClick={() => {
                    props.navigatePage(id);
                    props.setReportsOpen(!props.reportsOpen);

                    if (!props.reportsSection) {
                      props.setReportsSection("metrix");
                    }
                  }}
                  className={`flex w-full items-center rounded-2xl py-3
${props.tabletCollapsed ? "justify-center px-0" : "gap-3 px-4"}`}
                >
                  <Icon size={18} />
                  {!props.tabletCollapsed && (
                    <span className="min-w-0 flex truncate text-xs lg:text-sm">
                      {label}
                    </span>
                  )}
                  {!props.tabletCollapsed && (
                    <ChevronDown
                      size={16}
                      className={props.reportsOpen ? "rotate-180" : ""}
                    />
                  )}
                </button>

                {!props.tabletCollapsed && isActive && props.reportsOpen && (
                  <div className="mt-2 grid gap-1 pl-5">
                    <div className="mb-1 flex items-center gap-2 px-3 text-xs font-bold uppercase text-slate-400">
                      <Settings size={13} />
                      Reports
                    </div>

                    {props.reportSections.map(
                      ([sectionId, sectionLabel, SectionIcon]: any) => (
                        <button
                          key={sectionId}
                          type="button"
                          onClick={() => {
                            props.navigatePage("reports");
                            props.setReportsSection(sectionId);
                          }}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-bold ${
                            props.reportsSection === sectionId
                              ? "bg-slate-100 text-slate-950"
                              : "text-slate-500 hover:bg-slate-50"
                          }`}
                        >
                          <SectionIcon size={15} />
                          {!props.tabletCollapsed && (
                            <span className="truncate text-xs lg:text-sm">
                              {sectionLabel}
                            </span>
                          )}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
            );
          }
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                // if (props.tabletCollapsed) {
                //   props.setTabletCollapsed(false);
                // }

                props.navigatePage(id);
              }}
              className={`flex w-full items-center rounded-2xl py-3
${props.tabletCollapsed ? "justify-center px-0" : "gap-3 px-4"}`}
            >
              <Icon size={18} />
              {!props.tabletCollapsed && (
                <span className="truncate text-xs lg:text-sm">{label}</span>
              )}
            </button>
          );
        })}
      </nav>
      {/* all existing nav code */}
    </aside>
  );
}
