import React from "react";
import { Card, Badge, Field, Input, Select } from "../ui";
import { Download, Mail } from "lucide-react";

// type HeaderProps = {
//   apiSession: any;
//   exportCsv: any;
//   exportExcel: any;
//   exportPdf: any;
//   canSendEmail: any;
//   sendPanelOpen: any;
//   setSendPanelOpen: any;
//   sendMessage: any;
//   setSendMessage: any;
//   sendError: any;
//   setSendError: any;
//   recipientInput: any;
//   setRecipientInput: any;
//   recentEmails: any;
//   addRecipientSuggestion: any;
//   sendEmailReport: any;
//   sendBusy: any;
//   period: any;
//   changePeriod: any;
//   fromDate: any;
//   setFromDate: any;
//   toDate: any;
//   setToDate: any;
//   doctorId: any;
//   setDoctorId: any;
//   doctorOptions: any;
//   typeFilter: any;
//   setTypeFilter: any;
//   supplierFilter: any;
//   setSupplierFilter: any;
//   suppliers: any;
//   setPeriod:any
// };

type HeaderProps = {
  apiSession: any;

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
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div>
          <h3 className="text-lg font-bold">
            Healthcare Gross Profit Report
          </h3>
          <p className="text-sm text-slate-500">
            Consultation revenue, doctor settlement, clinic fee, gross profit,
            final profit, and paid-basis settlement.
          </p>
        </div>
        <Badge tone="blue">
          {apiSession?.user?.is_super_admin ? "Super Admin" : "Tenant Admin"}
        </Badge>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-bold"
        >
          <Download size={15} />
          CSV
        </button>
        <button
          type="button"
          onClick={exportExcel}
          className="rounded-2xl border px-3 py-2 text-sm font-bold"
        >
          Excel
        </button>
        <button
          type="button"
          onClick={exportPdf}
          className="rounded-2xl border px-3 py-2 text-sm font-bold"
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
            className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-bold disabled:text-slate-400"
          >
            <Mail size={15} />
            Send
          </button>
        )}
      </div>
      {canSendEmail && sendPanelOpen && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <Field label="Email recipients">
            <textarea
              value={recipientInput}
              onChange={(event: any) => setRecipientInput(event.target.value)}
              placeholder="Enter one or more email IDs, separated by comma"
              rows={3}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500"
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
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={sendEmailReport}
              disabled={sendBusy}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
            >
              <Mail size={15} />
              {sendBusy ? "Sending..." : "Send Excel"}
            </button>
            <button
              type="button"
              onClick={() => setSendPanelOpen(false)}
              disabled={sendBusy}
              className="rounded-2xl border bg-white px-4 py-2 text-sm font-bold"
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
      <div className="mt-4 grid gap-3 md:grid-cols-6">
        <Field label="Period">
          <Select
            value={period}
            onChange={(event: any) => changePeriod(event.target.value)}
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
          />
        </Field>
        <Field label="Doctor">
          <Select
            value={doctorId}
            onChange={(event: any) => setDoctorId(event.target.value)}
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
