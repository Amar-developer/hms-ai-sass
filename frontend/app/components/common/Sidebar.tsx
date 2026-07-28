import { ChevronDown, Settings } from "lucide-react";
import { BrandBlock } from "./BrandBlock";
import { useEffect, useRef, useState } from "react";

interface SidebarProps {
  visibleNav: any[];
  activePage: string;
  navigatePage: (page: any) => void;

  isSuperAdmin: boolean;
  canAccessPlatformWorkspace: boolean;

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
  sideBarOpen: boolean;
  reportSections: any;
  reportSection: any;
  superAdminSections: any;
  tabletCollapsed: boolean;
  setTabletCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}

export function Sidebar(props: SidebarProps) {
  const [popupMenu, setPopupMenu] = useState<
    "superadmin" | "admin" | "reports" | null
  >(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupPosition, setPopupPosition] = useState({
    top: 0,
    left: 0,
  });
  const [badge, setBadge] = useState<{
    label: string;
    top: number;
  } | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      const clickedSidebar = sidebarRef.current?.contains(target);

      const clickedPopup = popupRef.current?.contains(target);

      if (!clickedSidebar && !clickedPopup) {
        setPopupMenu(null);

        if (!props.tabletCollapsed && window.innerWidth < 1024) {
          props.setTabletCollapsed(true);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [props.tabletCollapsed]);

  const showModuleBadge = (
    label: string,
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();

    setBadge({
      label,
      top: rect.top + rect.height / 2,
    });

    setTimeout(() => setBadge(null), 2000);
  };

  const openPopup = (
    menu: "admin" | "superadmin" | "reports",
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();

    setPopupPosition({
      top: rect.top,
      left: rect.right + 8,
    });

    setPopupMenu(menu);
  };
  return (
    <aside
      className={`
    h-screen shrink-0 overflow-y-auto border-r border-slate-200 bg-white px-2 py-2
    hidden md:block
    transition-all duration-300 scrollbar-hidden
    ${props.tabletCollapsed ? "md:w-18" : "md:w-64"}
    lg:w-50
  `}
      ref={sidebarRef}
    >
      <BrandBlock
        tabletCollapsed={props.tabletCollapsed}
        setTabletCollapsed={props.setTabletCollapsed}
        setSidebarOpen={props.setSidebarOpen}
        sideBarOpen={props.sideBarOpen}
      />
      <nav className="mt-4 space-y-2 ">
        {props.visibleNav.map(([id, label, Icon]: any) => {
          const isActive = props.activePage === id;
          if (id === "superadmin" && props.canAccessPlatformWorkspace) {
            return (
              <div key={id}>
                <button
                  type="button"
                  onClick={(e) => {
                    if (props.tabletCollapsed) {
                      props.navigatePage(id);

                      showModuleBadge(label, e);

                      if (popupMenu === "superadmin") {
                        setPopupMenu(null);
                      } else {
                        openPopup("superadmin", e);
                      }

                      return;
                    }

                    props.navigatePage(id);
                    props.setSuperAdminSettingsOpen(
                      !props.superAdminSettingsOpen,
                    );
                  }}
                  className={`relative flex w-full items-center rounded-2xl py-3
                    ${isActive ? "font-bold bg-slate-900 text-white w-full text-left py-2 px-4 rounded-full" : "py-3"}
                  ${props.tabletCollapsed ? "justify-center px-0" : "gap-3 px-4"}`}
                >
                  <Icon size={18} />
                  {!props.tabletCollapsed && (
                    <span className="truncate text-xs">{label}</span>
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
                {props.tabletCollapsed && popupMenu === "superadmin" && (
                  <div
                    ref={popupRef}
                    className="fixed z-[9999] w-56 rounded-xl border bg-white shadow-xl p-2"
                    style={{
                      top: popupPosition.top,
                      left: popupPosition.left,
                      // transform: "translateY(-50%)",
                    }}
                  >
                    {props.superAdminSections.map(
                      ([sectionId, sectionLabel, SectionIcon]) => (
                        <button
                          key={sectionId}
                          onClick={() => {
                            props.navigatePage({
                              id: "superadmin",
                              section: sectionId,
                            });
                            setPopupMenu(null);
                          }}
                          className="flex w-full items-center gap-3 px-2 py-2 text-xs"
                        >
                          <SectionIcon size={15} />
                          {sectionLabel}
                        </button>
                      ),
                    )}
                  </div>
                )}
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
                              props.navigatePage({
                                id: "superadmin",
                                section: sectionId,
                              });
                            }}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs${props.superAdminSection == sectionId ? "font-bold bg-slate-900 text-white w-full text-left py-2 px-4 rounded-full font-bold" : "py-3"}`}
                          >
                            <SectionIcon size={15} />
                            {!props.tabletCollapsed && (
                              <span className="truncate text-xs">
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
          if (id === "admin" && !props.isSuperAdmin) {
            return (
              <div key={id}>
                <button
                  type="button"
                  aria-label={label}
                  onClick={(e) => {
                    props.navigatePage(id);

                    if (props.tabletCollapsed) {
                      if (popupMenu === "admin") {
                        setPopupMenu(null);
                      } else {
                        openPopup("admin", e);
                      }

                      showModuleBadge(label, e);
                      return;
                    }

                    props.setTenantAdminSettingsOpen(
                      !props.tenantAdminSettingsOpen,
                    );
                  }}
                  className={`relative flex w-full items-center rounded-2xl ${isActive ? "font-bold bg-slate-900 text-white w-full text-left py-2 px-4 rounded-full" : "py-3"}
${props.tabletCollapsed ? "justify-center px-0" : "gap-3 px-4"}`}
                >
                  <Settings size={22} />
                  {!props.tabletCollapsed && (
                    <span className="truncate text-xs">{label} Settings</span>
                  )}
                  {!props.tabletCollapsed && (
                    <ChevronDown
                      size={16}
                      className={`transform transition-transform duration-200 ${
                        props.tenantAdminSettingsOpen ? "rotate-180" : ""
                      }`}
                    />
                  )}
                </button>

                {props.tabletCollapsed && popupMenu === "admin" && (
                  <div
                    ref={popupRef}
                    className="fixed z-[9999] w-56 rounded-xl border bg-white shadow-xl p-2"
                    style={{
                      top: popupPosition.top,
                      left: popupPosition.left,
                    }}
                  >
                    {props.visibleTenantAdminSections.map(
                      ([sectionId, sectionLabel, SectionIcon]) => (
                        <button
                          key={sectionId}
                          onClick={() => {
                            props.navigatePage({
                              id: "admin",
                              section: sectionId,
                            });
                            setPopupMenu(null);
                          }}
                          className={`flex w-full text-xs justify-start items-start gap-3 px-2 py-2 ${props.tenantAdminSection == sectionId ? "font-bold bg-slate-900 text-white w-full text-left py-2 px-4 rounded-full" : "py-3"}`}
                        >
                          <SectionIcon size={15} />
                          {sectionLabel}
                        </button>
                      ),
                    )}
                  </div>
                )}
                {!props.tabletCollapsed &&
                  isActive &&
                  props.tenantAdminSettingsOpen && (
                    <div className="mt-2 grid gap-1 pl-5">
                      {/* <div className="mb-1 flex items-center gap-2 px-3 text-xs font-bold uppercase text-slate-400">
                        <Settings size={13} />
                        Settings
                      </div> */}
                      {props.visibleTenantAdminSections.map(
                        ([sectionId, sectionLabel, SectionIcon]: any) => (
                          <button
                            key={sectionId}
                            type="button"
                            onClick={() => {
                              props.navigatePage({
                                id: "admin",
                                section: sectionId,
                              });
                            }}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-bold ${
                              props.tenantAdminSection === sectionId
                                ? "bg-slate-100 text-slate-950"
                                : "text-slate-500 hover:bg-slate-50"
                            }`}
                          >
                            <SectionIcon size={15} />
                            {!props.tabletCollapsed && (
                              <span className="truncate text-xs">
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
              <div key={id} className="">
                <button
                  type="button"
                  onClick={(e) => {
                    props.navigatePage(id);

                    if (props.tabletCollapsed) {
                      if (popupMenu === "reports") {
                        setPopupMenu(null);
                      } else {
                        openPopup("reports", e);
                      }

                      showModuleBadge(label, e);

                      if (!props.reportsSection) {
                        props.setReportsSection("metrix");
                      }

                      return;
                    }

                    props.setReportsOpen(!props.reportsOpen);

                    if (!props.reportsSection) {
                      props.setReportsSection("metrix");
                    }
                  }}
                  className={`flex w-full items-center rounded-2xl py-3
    ${
      isActive
        ? "font-bold bg-slate-900 text-white w-full text-left py-2 px-4 rounded-full"
        : "py-3"
    }
    ${props.tabletCollapsed ? "justify-center px-0" : "gap-3 px-4"}
  `}
                >
                  <Icon size={18} />
                  {!props.tabletCollapsed && (
                    <span className="min-w-0 flex truncate text-xs">
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
                {props.tabletCollapsed && popupMenu === "reports" && (
                  <div
                    ref={popupRef}
                    className="fixed z-[9999] w-56 rounded-xl border bg-white shadow-xl p-2"
                    style={{
                      top: popupPosition.top,
                      left: popupPosition.left,
                    }}
                  >
                    {props.reportSections.map(
                      ([sectionId, sectionLabel, SectionIcon]) => (
                        <button
                          key={sectionId}
                          onClick={() => {
                            props.navigatePage({
                              id: "reports",
                              section: sectionId,
                            });
                            setPopupMenu(null);
                          }}
                          className={`flex w-full items-center gap-3 px-2 py-2 text-xs ${props.reportSection == sectionId ? "font-bold bg-slate-900 text-white w-full text-left py-2 px-4 rounded-full" : "py-3"}`}
                        >
                          <SectionIcon size={15} />
                          {sectionLabel}
                        </button>
                      ),
                    )}
                  </div>
                )}
                {!props.tabletCollapsed && isActive && props.reportsOpen && (
                  <div className="mt-2 grid gap-1 pl-5">
                    {props.reportSections.map(
                      ([sectionId, sectionLabel, SectionIcon]: any) => (
                        <button
                          key={sectionId}
                          type="button"
                          onClick={() => {
                            props.navigatePage({
                              id: "reports",
                              section: sectionId,
                            });
                          }}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-bold ${
                            props.reportsSection == sectionId
                              ? "bg-slate-100 text-slate-950"
                              : "text-slate-500 hover:bg-slate-50"
                          }`}
                        >
                          <SectionIcon size={15} />
                          {!props.tabletCollapsed && (
                            <span className="truncate text-xs">
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
              onClick={(e) => {
                props.navigatePage(id);
                setPopupMenu(null);
                props.setTenantAdminSettingsOpen(false);
                if (props.tabletCollapsed) {
                  showModuleBadge(label, e);
                }
              }}
              className={`flex w-full items-center rounded-2xl md:py-3  lg:py-2
${props.tabletCollapsed ? "justify-center px-0" : "gap-3 px-4"} ${isActive ? "font-bold bg-slate-900 text-white w-full text-left py-2 px-4 rounded-full" : ""}`}
            >
              <Icon size={22} title={label} />
              {!props.tabletCollapsed && (
                <span
                  className={`truncate text-xs ${isActive ? "font-bold bg-slate-900 text-white w-full text-left  rounded-full" : ""}`}
                >
                  {label}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      {badge && (
        <div
          className={`fixed z-[999] bg-slate-900 text-white text-xs px-3 py-1 rounded-full shadow-lg ${badge.label == "Reports" || badge.label == "Tenant Admin" ? "hidden" : ""}`}
          style={{
            left: "60px",
            top: badge.top,
            transform: "translateY(-50%)",
          }}
        >
          {badge.label}
        </div>
      )}
    </aside>
  );
}
