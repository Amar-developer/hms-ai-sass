import React from "react";
import { Card, Badge, Field, Input, RefreshButton, Select } from "../common/ui";
import { Download, Mail } from "lucide-react";

type HeaderProps = {
  apiSession: any;
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
  apiSession,
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
          <h3 className="card-title font-bold">
            Healthcare Gross Profit Report
          </h3>
          <p className="card-desc text-slate-500">
            Consultation revenue, doctor settlement, clinic fee, gross profit,
            final profit, and paid-basis settlement.
          </p>
        </div>
        <Badge tone="blue" className="normal-badge w-[20%]">
          {apiSession?.user?.is_super_admin ? "Super Admin" : "Tenant Admin"}
        </Badge>
      </div>
      <div className="mt-4 flex flex-wrap  gap-2">
        {onRefresh ? (
          <RefreshButton
            onRefresh={onRefresh}
            label="Refresh"
            className="rounded-2xl text-sm py-3 h-12"
          />
        ) : null}
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-2 close-button font-bold"
        >
          <Download size={15} />
          CSV
        </button>
        <button
          type="button"
          onClick={exportExcel}
          className="close-button font-bold"
        >
          Excel
        </button>
        <button
          type="button"
          onClick={exportPdf}
          className="close-button font-bold"
        >
          PDF
        </button>
        {canSendEmail && (
          <button
            type="button"
            onClick={() => {
              setSendPanelOpen((open) => !open);
              setSendMessage("");
              setSendError("");
            }}
            className="inline-flex items-center gap-2 close-button font-bold disabled:text-slate-400  "
          >
            <Mail size={15} />
            Send
          </button>
        )}
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
                  No supplier
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
          <Select
            value={period}
            onChange={(event: any) => changePeriod(event.target.value)}
            className="select-filter"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="custom">Custom</option>
          </Select>
        </Field>
        <Field label="From Date">
          <Input
            type="date"
            value={fromDate}
            onChange={(event: any) => {
              setPeriod("custom");
              setFromDate(event.target.value);
            }}
            className="date-filter"
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
            className="date-filter"
          />
        </Field>
        <Field label="Doctor">
          <Select
            value={doctorId}
            onChange={(event: any) => setDoctorId(event.target.value)}
            className="select-filter"
          >
            <option value="all">All doctors</option>
            {doctorOptions.map(([id, label]: any) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type">
          <Select
            value={typeFilter}
            onChange={(event: any) => setTypeFilter(event.target.value)}
            className="select-filter"
          >
            <option value="overall">Overall</option>
            <option value="consultation">Consultation</option>
            <option value="lab">Lab</option>
            <option value="pharmacy">Pharmacy</option>
          </Select>
        </Field>
        <Field label="Supplier">
          <Select
            value={supplierFilter}
            onChange={(event: any) => setSupplierFilter(event.target.value)}
            className="select-filter"
          >
            <option value="all">All suppliers</option>
            <option value="none">No supplier</option>
            {suppliers.map((supplier: any) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Card>
  );
};

export default Header;
