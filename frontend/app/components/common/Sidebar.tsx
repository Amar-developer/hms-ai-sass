import { ChevronDown, Hospital, Settings } from "lucide-react";
import Link from "next/link";
import { BrandBlock } from "./BrandBlock";
import { useEffect, useRef, useState } from "react";

interface SidebarProps {
  visibleNav: any[];
  activePage: string;
  navigatePage: (page: any) => void;
  beginNavigation: (page: string, path: string) => void;

  isSuperAdmin: boolean;
  canAccessPlatformWorkspace: boolean;

  reportsOpen: boolean;
  setReportsOpen: any;
  clinicOpen: boolean;
  setClinicOpen: any;
  reportsSection: string;
  setReportsSection: any;

  tenantAdminSettingsOpen: boolean;
  setTenantAdminSettingsOpen: any;

  tenantAdminSection: string;
  setTenantAdminSection: any;
  clinicSection: string;
  setClinicSection: any;
  superAdminSettingsOpen: boolean;
  setSuperAdminSettingsOpen: any;

  superAdminSection: string;
  setSuperAdminSection: any;

  visibleTenantAdminSections: any[];
  visibleClinicSections: any[];
  clinicModuleSections: any[];
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
    "superadmin" | "admin" | "reports" | "clinic" | null
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

  const showModuleBadge = (label: string, e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();

    setBadge({
      label,
      top: rect.top + rect.height / 2,
    });

    setTimeout(() => setBadge(null), 2000);
  };

  const openPopup = (
    menu: "admin" | "superadmin" | "reports" | "clinic",
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
    app-sidebar h-screen shrink-0 overflow-y-auto border-r border-slate-200 bg-white px-2 py-2 text-slate-900
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
          if (id === "superadmin" && !props.isSuperAdmin) {
            return null;
          }
          if (id === "superadmin" && props.isSuperAdmin) {
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
                  className={`relative flex w-full items-center rounded-xl py-2 transition
                    ${isActive ? "w-full rounded-full bg-brand px-4 py-2 text-left font-bold text-brand-fg" : "py-2 text-slate-900 hover:bg-slate-50"}
                  ${props.tabletCollapsed ? "justify-center px-0" : "gap-3 px-4"}`}
                >
                    <Icon size={22} />
                  <div className="flex justify-between w-full">
                    {!props.tabletCollapsed && (
                      <span className="truncate text-xs font-semibold">{label}</span>
                    )}
                    {!props.tabletCollapsed && (
                      <ChevronDown
                        size={16}
                        className={
                          props.superAdminSettingsOpen ? "rotate-180" : ""
                        }
                      />
                    )}
                  </div>
                </button>
                {props.tabletCollapsed && popupMenu === "superadmin" && (
                  <div
                    ref={popupRef}
                    className="fixed z-[9999] w-56 rounded-xl border bg-white p-2 text-slate-900 shadow-xl"
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
                       className={`flex w-full items-start justify-start gap-3 px-2 py-2 text-xs ${
                            props.superAdminSection == sectionId
                              ? "w-full rounded-full bg-brand px-4 py-2 text-left font-bold text-brand-fg"
                              : "py-2"
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
                  className={`relative flex w-full items-center justify-between rounded-xl transition px-3 ${
                    isActive
                      ? "w-full rounded-full bg-brand px-4 py-2 text-left font-bold text-brand-fg"
                      : "py-3 text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex justify-center items-center gap-3">
                    <Settings size={22} />
                    {!props.tabletCollapsed && (
                      <span className="truncate text-xs font-semibold">
                        {label}
                      </span>
                    )}
                  </div>
                  {!props.tabletCollapsed && (
                    <ChevronDown
                      size={16}
                      className={`transform transition-transform duration-200 ${
                        props.tenantAdminSettingsOpen ? "rotate-180" : ""
                      }`}
                    />
                  )}
                </button>

                {/* Collapsed popup – only Settings sections */}
                {props.tabletCollapsed && popupMenu === "admin" && (
                  <div
                    ref={popupRef}
                    className="fixed z-[9999] w-56 rounded-xl border bg-white p-2 text-slate-900 shadow-xl"
                    style={{
                      top: popupPosition.top,
                      left: popupPosition.left,
                    }}
                  >
                    <div className="mb-1 px-2 text-[10px] font-bold uppercase text-slate-400">
                      Settings
                    </div>
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
                          className={`flex w-full items-start justify-start gap-3 px-2 py-2 text-xs ${
                            props.tenantAdminSection == sectionId
                              ? "w-full rounded-full bg-brand px-4 py-2 text-left font-bold text-brand-fg"
                              : "py-3"
                          }`}
                        >
                          <SectionIcon size={15} />
                          {sectionLabel}
                        </button>
                      ),
                    )}
                  </div>
                )}

                {/* Expanded sub-menu – only Settings sections */}
                {!props.tabletCollapsed &&
                  isActive &&
                  props.tenantAdminSettingsOpen && (
                    <div className="mt-2 grid gap-1 pl-5">
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
                                ? "bg-brand text-brand-fg"
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
          if (id === "clinic") {
            // Doctors/Scheduling/Items are separate top-level modules
            // nested visually under Clinic — activePage is their own id
            // (e.g. "practitioners"), not "clinic", so the outer row needs
            // its own active check that also covers them.
            const clinicRowActive =
              isActive ||
              props.clinicModuleSections.some(
                ([moduleId]: any) => moduleId === props.activePage,
              );
            return (
              <div key={id}>
                <button
                  type="button"
                  aria-label={label}
                  onClick={(e) => {
                    if (props.tabletCollapsed) {
                      if (popupMenu === "clinic") {
                        setPopupMenu(null);
                      } else {
                        openPopup("clinic", e);
                      }
                      showModuleBadge(label, e);
                      return;
                    }

                    // Only toggle – never fight with navigatePage
                    const willOpen = !props.clinicOpen;
                    props.setClinicOpen(willOpen);

                    // When opening, land on the first clinic module
                    if (willOpen && props.visibleClinicSections.length > 0) {
                      props.navigatePage({
                        id: "clinic",
                        section: props.visibleClinicSections[0][0],
                      });
                    } else if (
                      willOpen &&
                      props.clinicModuleSections.length > 0
                    ) {
                      props.navigatePage(props.clinicModuleSections[0][0]);
                    }
                  }}
                  className={`relative flex w-full items-center justify-between rounded-xl transition ${
                    clinicRowActive
                      ? "w-full rounded-full bg-brand px-4 py-2 text-left font-bold text-brand-fg"
                      : "py-2 text-slate-900 hover:bg-slate-50"
                  } ${props.tabletCollapsed ? "justify-center px-0" : "gap-3 px-4"}`}
                >
                  <div className="flex items-center gap-3">
                    <Hospital size={22} />
                    {!props.tabletCollapsed && (
                      <span className="truncate text-xs font-semibold">
                        {label}
                      </span>
                    )}
                  </div>

                  {!props.tabletCollapsed && (
                    <ChevronDown
                      size={16}
                      className={`transform transition-transform duration-200 ${
                        props.clinicOpen ? "rotate-180" : ""
                      }`}
                    />
                  )}
                </button>

                {/* Collapsed floating popup */}
                {props.tabletCollapsed && popupMenu === "clinic" && (
                  <div
                    ref={popupRef}
                    className="fixed z-[9999] w-56 rounded-xl border bg-white p-2 text-slate-900 shadow-xl"
                    style={{
                      top: popupPosition.top,
                      left: popupPosition.left,
                    }}
                  >
                    <div className="mb-1 px-2 text-[10px] font-bold uppercase text-slate-400">
                      Clinic
                    </div>
                    {props.visibleClinicSections.map(
                      ([sectionId, sectionLabel, SectionIcon]: any) => (
                        <button
                          key={sectionId}
                          onClick={() => {
                            props.navigatePage({
                              id: "clinic",
                              section: sectionId,
                            });
                            setPopupMenu(null);
                          }}
                          className={`flex w-full items-center gap-3 px-2 py-2 text-xs ${
                            props.activePage === "clinic" &&
                            props.clinicSection === sectionId
                              ? "w-full rounded-full bg-brand px-4 py-2 text-left font-bold text-brand-fg"
                              : "py-3"
                          }`}
                        >
                          <SectionIcon size={15} />
                          {sectionLabel}
                        </button>
                      ),
                    )}
                    {props.clinicModuleSections.map(
                      ([moduleId, moduleLabel, ModuleIcon]: any) => (
                        <button
                          key={moduleId}
                          onClick={() => {
                            props.navigatePage(moduleId);
                            setPopupMenu(null);
                          }}
                          className={`flex w-full items-center gap-3 px-2 py-2 text-xs ${
                            props.activePage === moduleId
                              ? "w-full rounded-full bg-brand px-4 py-2 text-left font-bold text-brand-fg"
                              : "py-3"
                          }`}
                        >
                          <ModuleIcon size={15} />
                          {moduleLabel}
                        </button>
                      ),
                    )}
                  </div>
                )}

                {/* Expanded nested list – key change: show whenever clinicOpen is true */}
                {!props.tabletCollapsed && props.clinicOpen && (
                  <div className="mt-2 grid gap-1 pl-5">
                    {props.visibleClinicSections.map(
                      ([sectionId, sectionLabel, SectionIcon]: any) => (
                        <button
                          key={sectionId}
                          type="button"
                          onClick={() => {
                            props.navigatePage({
                              id: "clinic",
                              section: sectionId,
                            });
                          }}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-bold ${
                            props.activePage === "clinic" &&
                            props.clinicSection === sectionId
                              ? "bg-brand text-brand-fg"
                              : "text-slate-500 hover:bg-slate-50"
                          }`}
                        >
                          <SectionIcon size={15} />
                          <span className="truncate text-xs">
                            {sectionLabel}
                          </span>
                        </button>
                      ),
                    )}
                    {props.clinicModuleSections.map(
                      ([moduleId, moduleLabel, ModuleIcon]: any) => (
                        <button
                          key={moduleId}
                          type="button"
                          onClick={() => {
                            props.navigatePage(moduleId);
                          }}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-bold ${
                            props.activePage === moduleId
                              ? "bg-brand text-brand-fg"
                              : "text-slate-500 hover:bg-slate-50"
                          }`}
                        >
                          <ModuleIcon size={15} />
                          <span className="truncate text-xs">
                            {moduleLabel}
                          </span>
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
                  className={`flex w-full items-center jutify-between rounded-xl py-2 transition
    ${
      isActive
        ? "w-full rounded-full bg-brand px-3 py-2 text-left font-bold text-brand-fg"
        : "py-2 text-slate-900 hover:bg-slate-50"
    }
    ${props.tabletCollapsed ? "justify-center px-0" : "gap-3 px-4"}
  `}
                >
                  <Icon size={22} />
                  <div className="flex justify-between w-full">
                    {!props.tabletCollapsed && (
                      <span className="min-w-0 flex truncate text-xs font-semibold">
                        {label}
                      </span>
                    )}
                    {!props.tabletCollapsed && (
                      <ChevronDown
                        size={16}
                        className={props.reportsOpen ? "rotate-180" : ""}
                      />
                    )}
                  </div>
                </button>
                {props.tabletCollapsed && popupMenu === "reports" && (
                  <div
                    ref={popupRef}
                    className="fixed z-[9999] w-56 rounded-xl border bg-white p-2 text-slate-900 shadow-xl"
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
                          className={`flex w-full items-center gap-3 px-2 py-2 text-xs ${props.reportSection == sectionId ? "w-full rounded-full bg-brand px-4 py-2 text-left font-bold text-brand-fg" : "py-3"}`}
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
                              ? "bg-brand text-brand-fg"
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
          const destinationPath = `/${id}`;
          return (
            <Link
              key={id}
              href={destinationPath}
              onClick={(e) => {
                props.beginNavigation(id, destinationPath);
                setPopupMenu(null);
                props.setTenantAdminSettingsOpen(false);
                if (props.tabletCollapsed) {
                  showModuleBadge(label, e);
                }
              }}
              className={`flex w-full items-center rounded-xl transition md:py-2 lg:py-2
${props.tabletCollapsed ? "justify-center px-0" : "gap-3 px-4"} ${isActive ? "w-full rounded-full bg-brand px-2 py-2 text-left font-bold text-brand-fg" : "text-slate-900 hover:bg-slate-50"}`}
            >
              <Icon size={22} title={label} />
              {!props.tabletCollapsed && (
                <span
                  className={`truncate text-xs font-semibold ${isActive ? "w-full text-left font-bold text-brand-fg" : ""}`}
                >
                  {label}
                </span>
              )}
            </Link>
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
