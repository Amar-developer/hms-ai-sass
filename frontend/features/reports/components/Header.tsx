import React from "react";
import {
  Card,
  Field,
  Input,
  SearchableSelect,
} from "@/app/components/common/ui";
import {
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Mail,
  RefreshCw,
} from "lucide-react";

type HeaderProps = {
  section: string;
  onRefresh?: () => void | Promise<unknown>;

  exportCsv: () => void;
  exportExcel: () => void;
  exportPdf: () => void;

  canSendEmail: boolean;

  sendPanelOpen: boolean;
  setSendPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;

  sendMessage: string;
  setSendMessage: React.Dispatch<React.SetStateAction<string>>;

  sendError: string;
  setSendError: React.Dispatch<React.SetStateAction<string>>;

  recipientInput: string;
  setRecipientInput: React.Dispatch<React.SetStateAction<string>>;

  recentEmails: string[];

  addRecipientSuggestion: (email: string) => void;

  emailReportSections: string[];
  setEmailReportSections: React.Dispatch<React.SetStateAction<string[]>>;

  emailLabSupplierIds: string[];
  setEmailLabSupplierIds: React.Dispatch<React.SetStateAction<string[]>>;

  sendEmailReport: () => void;

  sendBusy: boolean;

  period: string;

  changePeriod: (value: string) => void;

  fromDate: string;
  setFromDate: React.Dispatch<React.SetStateAction<string>>;

  toDate: string;
  setToDate: React.Dispatch<React.SetStateAction<string>>;

  doctorId: string;
  setDoctorId: React.Dispatch<React.SetStateAction<string>>;

  doctorOptions: any[];

  typeFilter: string;
  setTypeFilter: React.Dispatch<React.SetStateAction<string>>;

  supplierFilter: string;
  setSupplierFilter: React.Dispatch<React.SetStateAction<string>>;

  suppliers: any[];

  setPeriod: React.Dispatch<React.SetStateAction<string>>;
};

const Header = ({
  section,
  onRefresh,
  exportCsv,
  exportExcel,
  exportPdf,
  canSendEmail,
  sendPanelOpen,
  setSendPanelOpen,
  sendMessage,
  setSendMessage,
  sendError,
  setSendError,
  recipientInput,
  setRecipientInput,
  recentEmails,
  addRecipientSuggestion,
  emailReportSections,
  setEmailReportSections,
  emailLabSupplierIds,
  setEmailLabSupplierIds,
  sendEmailReport,
  sendBusy,
  period,
  changePeriod,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  doctorId,
  setDoctorId,
  doctorOptions,
  typeFilter,
  setTypeFilter,
  supplierFilter,
  setSupplierFilter,
  suppliers,
  setPeriod,
}: HeaderProps) => {
  const [actionsOpen, setActionsOpen] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const actionsRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    function closeActions(event: MouseEvent) {
      if (
        actionsRef.current &&
        !actionsRef.current.contains(event.target as Node)
      ) {
        setActionsOpen(false);
      }
    }
    document.addEventListener("mousedown", closeActions);
    return () => document.removeEventListener("mousedown", closeActions);
  }, []);
  async function refreshReport() {
    if (!onRefresh || refreshing) return;
    setActionsOpen(false);
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }
  function runAction(action: () => void) {
    setActionsOpen(false);
    action();
  }
  const reportCopy: Record<string, { title: string; description: string }> = {
    invoice: {
      title: "Invoice Profit Report",
      description:
        "Filtered paid invoice value, collections, costs, discounts, and realized profit.",
    },
    lab: {
      title: "Lab / Service Report",
      description:
        "Filtered lab and service revenue, supplier settlement, discounts, and profit.",
    },
    appointments: {
      title: "Consultation Profit Report",
      description:
        "Filtered consultation revenue, doctor cost, discounts, and profit.",
    },
    pharmacy: {
      title: "Pharmacy Profit Report",
      description:
        "Filtered pharmacy revenue, purchase cost, discounts, and profit.",
    },
    home_care: {
      title: "Home Care / Visit Profit Report",
      description:
        "Filtered home-care and home-visit revenue, settlement, and profit.",
    },
  };
  const activeReport = reportCopy[section] || {
    title: "Healthcare Gross Profit Report",
    description:
      "Filtered revenue, settlement, discounts, and profit across healthcare services.",
  };
  const emailSectionGroups = [
    {
      title: "Financial views",
      options: [
        ["overall", "Overall"],
        ["consultation", "Consultations"],
        ["lab", "Lab"],
        ["service", "Service"],
        ["pharmacy", "Pharmacy"],
      ],
    },
    {
      title: "Care modules",
      options: [
        ["home_visit", "Home Visit"],
        ["home_care", "Home Care"],
        ["ip", "IP"],
        ["physiotherapy", "Physiotherapy"],
      ],
    },
  ];
  const toggleEmailSection = (value: string) => {
    setEmailReportSections((current) => {
      if (current.includes(value)) {
        const next = current.filter((item) => item !== value);
        return next.length ? next : current;
      }
      return [...current, value];
    });
  };
  const toggleLabSupplier = (value: string) => {
    setEmailLabSupplierIds((current) => {
      if (value === "all") return ["all"];
      const base = current.filter((item) => item !== "all");
      if (base.includes(value)) {
        const next = base.filter((item) => item !== value);
        return next.length ? next : ["all"];
      }
      return [...base, value];
    });
  };
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div>
          <h3 className="card-title font-bold">{activeReport.title}</h3>
          <p className="card-desc text-slate-500">
            {activeReport.description}
          </p>
        </div>
        <div ref={actionsRef} className="relative w-full sm:w-52">
          <button
            type="button"
            onClick={() => setActionsOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Report Actions
            <ChevronDown
              size={16}
              className={actionsOpen ? "rotate-180" : ""}
            />
          </button>
          {actionsOpen && (
            <div
              role="menu"
              className="absolute right-0 z-40 mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
            >
              {onRefresh && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={refreshing}
                  onClick={refreshReport}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold hover:bg-slate-50 disabled:text-slate-400"
                >
                  <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => runAction(exportCsv)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold hover:bg-slate-50"
              >
                <Download size={15} /> CSV
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runAction(exportExcel)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold hover:bg-slate-50"
              >
                <FileSpreadsheet size={15} /> Excel
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runAction(exportPdf)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold hover:bg-slate-50"
              >
                <FileText size={15} /> PDF
              </button>
              {canSendEmail && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    runAction(() => {
                      setSendPanelOpen((open) => !open);
                      setSendMessage("");
                      setSendError("");
                    })
                  }
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold hover:bg-slate-50"
                >
                  <Mail size={15} /> Send
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {canSendEmail && sendPanelOpen && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <Field label="Email recipients">
            <textarea
              value={recipientInput}
              onChange={(event: any) => setRecipientInput(event.target.value)}
              placeholder="Enter one or more email IDs, separated by comma"
              rows={3}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 table-data outline-none focus:border-slate-500"
            />
          </Field>
          {recentEmails.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {recentEmails.map((email) => (
                <button
                  key={email}
                  type="button"
                  onClick={() => addRecipientSuggestion(email)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                >
                  {email}
                </button>
              ))}
            </div>
          )}
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {emailSectionGroups.map((group) => (
              <div
                key={group.title}
                className="rounded-lg border border-slate-200 bg-white p-3"
              >
                <p className="mb-2 text-xs font-black uppercase text-slate-500">
                  {group.title}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.options.map(([value, label]) => (
                    <label
                      key={value}
                      className="flex items-center gap-2 text-xs font-bold text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={emailReportSections.includes(value)}
                        onChange={() => toggleEmailSection(value)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div className="rounded-lg border border-slate-200 bg-white p-3 lg:col-span-2">
              <p className="mb-2 text-xs font-black uppercase text-slate-500">
                Lab suppliers
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={emailLabSupplierIds.includes("all")}
                    onChange={() => toggleLabSupplier("all")}
                  />
                  All suppliers
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={emailLabSupplierIds.includes("none")}
                    onChange={() => toggleLabSupplier("none")}
                  />
                  Tenant Hospital / In-house
                </label>
                {suppliers.map((supplier: any) => (
                  <label
                    key={supplier.id}
                    className="flex items-center gap-2 text-xs font-bold text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={emailLabSupplierIds.includes(supplier.id)}
                      onChange={() => toggleLabSupplier(supplier.id)}
                    />
                    {supplier.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={sendEmailReport}
              disabled={sendBusy}
              className="inline-flex items-center gap-2 py-2 px-2 lg:px-4 lg:py-3 rounded-lg bg-slate-900 font-bold text-white disabled:bg-slate-300"
            >
              <Mail size={15} />
              {sendBusy ? "Sending..." : "Send Excel"}
            </button>
            <button
              type="button"
              onClick={() => setSendPanelOpen(false)}
              disabled={sendBusy}
              className="close-button font-bold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {(sendMessage || sendError) && (
        <div
          className={`mt-3 rounded-2xl p-3 text-sm font-semibold ${
            sendError
              ? "bg-red-50 text-red-700"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {sendError || sendMessage}
        </div>
      )}
      {/* Reports Page */}
      <div className="mt-4 grid gap-3 md:grid-cols-6">
        <Field label="Period">
          <SearchableSelect
            value={period}
            onChange={(value) => changePeriod(value)}
            options={[
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
              { value: "quarterly", label: "Quarterly" },
              { value: "half_yearly", label: "Half-Yearly" },
              { value: "yearly", label: "Yearly" },
              { value: "custom", label: "Custom" },
            ]}
            placeholder="Select period"
            searchable={false}
          />
        </Field>
        <Field label="From Date">
          <Input
            type="date"
            value={fromDate}
            onChange={(event: any) => {
              setPeriod("custom");
              setFromDate(event.target.value);
            }}
            // className="date-filter"
          />
        </Field>
        <Field label="To Date">
          <Input
            type="date"
            value={toDate}
            onChange={(event: any) => {
              setPeriod("custom");
              setToDate(event.target.value);
            }}
            // className="date-filter"
          />
        </Field>
        <Field label="Doctor">
          <SearchableSelect
            value={doctorId}
            onChange={(value) => setDoctorId(value)}
            options={[
              { value: "all", label: "All doctors" },
              ...doctorOptions.map(([id, label]: any) => ({
                value: id,
                label,
              })),
            ]}
            placeholder="All doctors"
            searchable={false}
          />
        </Field>

        <Field label="Type">
          <SearchableSelect
            value={typeFilter}
            onChange={(value) => setTypeFilter(value)}
            options={[
              { value: "overall", label: "Overall" },
              { value: "consultation", label: "Consultation" },
              { value: "lab", label: "Lab" },
              { value: "service", label: "Service" },
              { value: "pharmacy", label: "Pharmacy" },
              { value: "home_visit", label: "Home Visit" },
              { value: "home_care", label: "Home Care" },
            ]}
            placeholder="Select type"
            searchable={false}
          />
        </Field>

        <Field label="Supplier">
          <SearchableSelect
            value={supplierFilter}
            onChange={(value) => setSupplierFilter(value)}
            options={[
              { value: "all", label: "All suppliers" },
              { value: "none", label: "Tenant Hospital / In-house" },
              ...suppliers.map((supplier: any) => ({
                value: supplier.id,
                label: supplier.name,
              })),
            ]}
            placeholder="All suppliers"
            searchable={false}
          />
        </Field>
      </div>
    </Card>
  );
};

export default Header;
