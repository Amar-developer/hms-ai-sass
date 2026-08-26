import { Column } from "@/utils/types";
import { capitalizeFirst, displayDateTime, money } from "@/utils/helper";
import { humanizeOptionLabel } from "@/lib/options";
import {
  ActionButton,
  ActionGroup,
  Badge,
  Button,
  SearchableSelect,
} from "@/app/components/common/ui";
import { RecordIdCell } from "@/app/components/common/RecordIdCell";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import { PatientFlagBadges } from "@/features/patients/components/PatientFlagBadges";
import {
  formatInvoiceDate,
  invoiceItemPriceBreakdown,
  invoicePatientDueAmount,
  invoiceSource,
  itemTypeLabel,
  numberValue,
  percentLabel,
} from "./helpers";

function signedMoney(value: any, mode: "delta" | "debit" | "credit" = "delta") {
  const amount = numberValue(value);
  if (amount === 0) return money(0);
  if (mode === "credit") return `+${money(Math.abs(amount))}`;
  if (mode === "debit") return `-${money(Math.abs(amount))}`;
  return `${amount > 0 ? "+" : "-"}${money(Math.abs(amount))}`;
}

function amountTone(value: any, mode: "delta" | "debit" | "credit" = "delta") {
  const amount = numberValue(value);
  if (amount === 0) return "text-slate-500";
  if (mode === "debit" || amount < 0) return "text-rose-700";
  return "text-emerald-700";
}

export function getInvoiceColumns({
  safePage,
  patientMap,
  canCopyIds,
  openInvoiceDetail,
  detailLoading,
  invoiceDeliveryStatus = {},
}: {
  safePage: number;
  patientMap: Map<string, any>;
  canCopyIds: boolean;
  openInvoiceDetail: (invoice: any) => void;
  detailLoading: string;
  invoiceDeliveryStatus?: Record<string, any>;
}): Column<any>[] {
  function renderWhatsAppStatus(invoice: any) {
    const delivery = invoiceDeliveryStatus[invoice.id];
    const status = String(delivery?.status || "not_sent");
    const label =
      status === "sent"
        ? "Sent"
        : status === "queued"
          ? "Queued"
          : status === "failed"
            ? "Failed"
            : status === "cancelled"
              ? "Cancelled"
              : "Not Sent";
    const tone =
      status === "sent"
        ? "green"
        : status === "queued"
          ? "amber"
          : status === "failed" || status === "cancelled"
            ? "red"
            : status == "not_sent"
              ? "purple"
              : "slate";

    return (
      <Badge tone={tone as any} className="normal-label">
        {label}
      </Badge>
    );
  }

  return [
    {
      key: "s.no",
      header: "S.No",
      width: "50px",
      className: "text-center",
      cellClassName: "text-center py-4",
      sortable: true,
      render: (_, index: number) => index + 1,
    },
    {
      key: "invoice_number",
      header: "Invoice",
      width: "200px",
      render: (invoice) => (
        <>
          <RecordIdCell
            id={invoice.id}
            label="Invoice ID"
            allowed={canCopyIds}
            value={invoice.invoice_number}
          />
        </>
      ),
    },
    {
      key: "invoice_date",
      className: "text-center",
      header: "Date",
      width: "100px",
      render: (invoice) => (
        <>
          <p className="text-sm ">{formatInvoiceDate(invoice)}</p>
        </>
      ),
    },
    {
      key: "source",
      header: "Source",
      width: "140px",
      className: "text-center",
      render: (invoice) => {
        const source = invoiceSource(invoice);

        return (
          <Badge tone={source.tone as any} className="normal-label">
            {source.label}
          </Badge>
        );
      },
    },
    {
      key: "patient",
      header: "Patient",
      width: "130px",
      render: (invoice) => {
        const p: any = patientMap.get(invoice.patient_id);

        return (
          <div className="max-w-[120px]">
            <p
              className="truncate"
              title={capitalizeFirst(
                invoice.patient_name || p?.name || p?.full_name || "Patient",
              )}
            >
              {capitalizeFirst(
                invoice.patient_name || p?.name || p?.full_name || "Patient",
              )}
              <PatientFlagBadges patient={p} className="mt-1" />
            </p>
          </div>
        );
      },
      cellClassName: "font-medium",
    },
    {
      key: "status",
      header: "Status",
      className: "text-center",
      width: "120px",
      render: (invoice) => (
        <Badge
          tone={
            invoice.status === "paid"
              ? "green"
              : invoice.status === "partially_refunded" ||
                  invoice.status === "refunded"
                ? "blue"
                : invoice.status === "partially_paid"
                  ? "amber"
                  : invoice.status == "cancelled"
                    ? "red"
                    : "slate"
          }
          className="normal-label"
        >
          {capitalizeFirst(
            invoice.status === "partially_paid"
              ? "Partially Paid"
              : invoice.status === "partially_refunded"
                ? "Partially Refunded"
                : invoice.status,
          )}
        </Badge>
      ),
    },

    {
      key: "paid_amount",
      header: "Paid",
      width: "100px",
      render: (invoice) => money(invoice.paid_amount),
      cellClassName: "tabular-nums",
    },
    {
      key: "due",
      header: "Due",
      width: "100px",
      render: (invoice) => money(invoicePatientDueAmount(invoice)),
    },
    {
      key: "total_amount",
      header: "Total",
      width: "100px",
      render: (invoice) => money(invoice.total_amount),
      cellClassName: "font-semibold tabular-nums",
    },
    {
      key: "whatsapp_status",
      header: "WhatsApp",
      className: "text-center",
      width: "120px",
      render: renderWhatsAppStatus,
    },
    // {
    //   key: "actions",
    //   header: "Actions",
    //   width: "120px",
    //   disableRowClick: true,
    //   render: (invoice) => (
    //     <ActionButton
    //       onClick={() => openInvoiceDetail(invoice)}
    //       disabled={detailLoading === invoice.id}
    //     >
    //       <ButtonLoader loading={detailLoading === invoice.id}>
    //         {detailLoading === invoice.id ? "Loading..." : "View"}
    //       </ButtonLoader>
    //     </ActionButton>
    //   ),
    // },
  ];
}

export function getConsultationPendingColumns({
  busy,
  generateInvoice,
}: {
  busy: string;
  generateInvoice: (row: any) => void;
}): Column<any>[] {
  return [
    {
      key: "consultation",
      header: "Consultation",
      render: (a: any) => <span className="font-bold">{a.token || "-"}</span>,
    },
    {
      key: "patient",
      header: "Patient",
      render: (a: any) => <span className="font-semibold">{a.patient}</span>,
    },
    {
      key: "doctor",
      header: "Doctor",
      width: "100px",
      cellClassName: "text-slate-600",
      render: (a: any) => (
        <div className="max-w-[100px]">
          <p>{a.doctor && a.doctor !== "Unassigned" ? a.doctor : "-"}</p>
        </div>
      ),
    },
    {
      key: "date",
      header: "Date & Time",
      cellClassName: "whitespace-nowrap text-slate-600",
      render: (a: any) =>
        displayDateTime(
          a.consultationSignedAt ||
            a.consultationCreatedAt ||
            a.appointmentDate,
        ),
    },
    {
      key: "action",
      header: "Action",
      cellClassName: "text-right",
      disableRowClick: true,
      render: (a: any) => (
        <Button
          disabled={busy === a.id}
          onClick={() => generateInvoice(a)}
          className="save-button"
        >
          <ButtonLoader loading={busy === a.id}>
            {busy === a.id ? "Generating..." : "Generate Invoice"}
          </ButtonLoader>
        </Button>
      ),
    },
  ];
}

export function getInvoiceItemColumns({
  invoice,
  showItemVendor,
  showItemPricing,
  vendorLabel,
  vendorPriceLabel,
  showSupplierPicker,
  supplierOptions,
  busy,
  updateInvoiceItemSupplier,
}: {
  invoice: any;
  showItemVendor: boolean;
  showItemPricing: boolean;
  vendorLabel: string;
  vendorPriceLabel: string;
  showSupplierPicker: boolean;
  supplierOptions: Record<string, any[]>;
  busy: string;
  updateInvoiceItemSupplier: (invoice: any, item: any, value: string) => void;
}): Column<any>[] {
  const columns: Column<any>[] = [
    {
      key: "index",
      header: "No.",
      width: "48px",
      className: "text-center",
      cellClassName: "text-center tabular-nums text-slate-600",
      render: (_: any, index: number) => index + 1,
    },
    {
      key: "description",
      header: "Item",
      width: "220px",
      render: (item: any) => (
        <span
          className="block max-w-64 truncate font-bold text-slate-900"
          title={item.description || itemTypeLabel(item.item_type)}
        >
          {item.description || itemTypeLabel(item.item_type)}
        </span>
      ),
    },
    {
      key: "quantity",
      header: "Quantity",
      className: "text-right",
      width: "100px",
      cellClassName: "text-right font-semibold tabular-nums text-slate-700",
      render: (item: any) => item.quantity,
    },
  ];

  if (showItemVendor) {
    columns.push({
      key: "vendor",
      header: vendorLabel,
      width: "120px",
      render: (item: any) => {
        const itemSupplierOptions = supplierOptions[item.id] || [];
        const vendorName = item.vendor_name || item.supplier_id || "";
        const canPickSupplier =
          showSupplierPicker &&
          item.item_type === "lab" &&
          itemSupplierOptions.length > 0;
        if (!canPickSupplier)
          return (
            <div className="max-w-[110px]">
              <p
                className="truncate font-medium text-slate-800"
                title={vendorName || "-"}
              >
                {vendorName || "-"}
              </p>
            </div>
          );
        return (
          <SearchableSelect
            value={item.supplier_id || ""}
            onChange={(value: string) =>
              updateInvoiceItemSupplier?.(invoice, item, value)
            }
            disabled={busy === `supplier-${item.id}`}
            searchable={itemSupplierOptions.length > 8}
            placeholder="No supplier"
            options={[
              { value: "", label: "No supplier" },
              ...itemSupplierOptions.map((supplier: any) => ({
                value: supplier.supplier,
                label: supplier.supplier_name,
                sublabel: money(supplier.buying_price),
              })),
            ]}
          />
        );
      },
    });
    columns.push({
      key: "vendor_amount",
      header: vendorPriceLabel == "Doctor Settlement" ? "Settlement" : "Price",
      width: "100px",
      cellClassName: "text-right tabular-nums text-slate-700",
      render: (item: any) => {
        const itemSupplierOptions = supplierOptions[item.id] || [];
        const canPickSupplier =
          showSupplierPicker &&
          item.item_type === "lab" &&
          itemSupplierOptions.length > 0;
        const vendorAmount =
          numberValue(item.vendor_amount) ||
          (canPickSupplier && itemSupplierOptions.length === 1
            ? numberValue(itemSupplierOptions[0].buying_price)
            : 0);
        return vendorAmount > 0 ? money(vendorAmount) : "-";
      },
    });
  }

  if (showItemPricing) {
    columns.push({
      key: "mrp",
      header: "MRP",
      width: "100px",
      className: "text-right",
      cellClassName: "text-right tabular-nums text-slate-700",
      render: (item: any) => {
        const mrp = numberValue(item.mrp_amount);
        return mrp > 0 ? money(mrp) : "-";
      },
    });
  }

  columns.push(
    {
      key: "rate",
      header: "Rate (₹)",
      width: "100px",
      className: "text-right",
      cellClassName: "text-right font-bold tabular-nums text-slate-800",
      render: (item: any) =>
        money(invoiceItemPriceBreakdown(item, invoice).rateUnit),
    },
    {
      key: "discount_percent",
      header: "Discount %",
      width: "130px",
      className: "text-right",
      cellClassName: "text-right tabular-nums text-slate-700",
      render: (item: any) => {
        const pricing = invoiceItemPriceBreakdown(item, invoice);
        const discountBase =
          pricing.mrpTotal > 0 ? pricing.mrpTotal : pricing.lineAmount;
        return pricing.effectiveDiscount > 0
          ? percentLabel(pricing.effectiveDiscount, discountBase)
          : "-";
      },
    },
    {
      key: "discount_amount",
      header: "Discount ₹",
      width: "120px",
      className: "text-right",
      cellClassName: "text-right font-bold tabular-nums text-emerald-700",
      render: (item: any) => {
        const pricing = invoiceItemPriceBreakdown(item, invoice);
        return pricing.effectiveDiscount > 0
          ? `-${money(pricing.effectiveDiscount)}`
          : "-";
      },
    },
    {
      key: "payable",
      header: "Payable (₹)",
      width: "120px",
      className: "text-right",
      cellClassName: "text-right font-black tabular-nums text-slate-900",
      render: (item: any) =>
        money(invoiceItemPriceBreakdown(item, invoice).payableAmount),
    },
  );

  return columns;
}

export function getSettlementHistoryColumns(): Column<any>[] {
  return [
    {
      key: "date",
      header: "Date & Time",
      width: "180px",
      cellClassName: "font-semibold text-slate-700",
      render: (row: any) => displayDateTime(row.date),
    },
    {
      key: "type",
      header: "Type",
      width: "120px",
      cellClassName: "font-semibold text-slate-900",
      render: (row: any) => row.type,
    },
    {
      key: "method",
      header: "Method / No.",
      width: "170px",
      cellClassName: "capitalize text-slate-700",
      render: (row: any) => row.method,
    },
    {
      key: "reference",
      header: "Reference / Reason",
      cellClassName: "truncate text-slate-600",
      render: (row: any) => <span title={row.reference}>{row.reference}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "120px",
      render: (row: any) => (
        <Badge tone={row.tone} className="normal-badge">
          {humanizeOptionLabel(row.status)}
        </Badge>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      width: "130px",
      className: "text-right",
      cellClassName: "text-right",
      render: (row: any) => (
        <span
          className={`font-black tabular-nums ${
            row.informational ? "text-slate-700" : amountTone(row.amount)
          }`}
        >
          {row.informational ? money(row.amount) : signedMoney(row.amount)}
        </span>
      ),
    },
  ];
}

export function getAdjustmentRequestColumns({
  canDecideAdjustment,
  adjustmentClosed,
  approveAdjustment,
  rejectAdjustment,
  executeAdjustment,
}: {
  canDecideAdjustment: (row: any) => boolean;
  adjustmentClosed: boolean;
  approveAdjustment: (row: any) => void;
  rejectAdjustment: (row: any) => void;
  executeAdjustment: (row: any) => void;
}): Column<any>[] {
  return [
    {
      key: "created_at",
      header: "Requested",
      width:"160px",
      cellClassName: "whitespace-nowrap font-semibold text-slate-700",
      render: (row: any) => displayDateTime(row.created_at),
    },
    {
      key: "request_type",
      header: "Type",
      width:"120px",
      cellClassName: "whitespace-nowrap font-bold capitalize",
      render: (row: any) => humanizeOptionLabel(row.request_type),
    },
    {
      key: "amount",
      header: "Amount",
      width:"100px",
      className: "text-right",
      cellClassName: "whitespace-nowrap text-right font-black tabular-nums",
      render: (row: any) => money(row.amount),
    },
    {
      key: "reason",
      header: "Reason",
      width:"140px",
      cellClassName: "max-w-[260px] truncate font-semibold text-slate-600",
      render: (row: any) => <span title={row.reason}>{row.reason}</span>,
    },
    {
      key: "requested_by",
      header: "Requested By",
      width:"160px",
      cellClassName: "whitespace-nowrap font-semibold text-slate-700",
      render: (row: any) => row.requested_by_user_name || "Unknown user",
    },
    {
      key: "status",
      header: "Status",
      width:"100px",
      render: (row: any) => (
        <Badge
          tone={
            row.status === "executed"
              ? "green"
              : row.status === "rejected"
                ? "red"
                : row.status === "approved"
                  ? "blue"
                  : "amber"
          }
          className="normal-label"
        >
          {humanizeOptionLabel(row.status)}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      disableRowClick: true,
      render: (row: any) =>
        canDecideAdjustment(row) && row.status === "pending" ? (
          <ActionGroup>
            <ActionButton onClick={() => approveAdjustment?.(row)}>
              Approve
            </ActionButton>
            <ActionButton tone="danger" onClick={() => rejectAdjustment?.(row)}>
              Reject
            </ActionButton>
          </ActionGroup>
        ) : canDecideAdjustment(row) &&
          row.status === "approved" &&
          !adjustmentClosed ? (
          <ActionButton onClick={() => executeAdjustment?.(row)}>
            Execute
          </ActionButton>
        ) : (
          <span className="text-slate-400">-</span>
        ),
    },
  ];
}

export function getHospitalLedgerColumns({
  ledgerRunningById,
  hospitalLedgerLine,
}: {
  ledgerRunningById: Map<string, any>;
  hospitalLedgerLine: (entry: any) => {
    debitAccount: string;
    debitAmount: number;
    creditAccount: string;
    creditAmount: number;
  };
}): Column<any>[] {
  return [
    {
      key: "created_at",
      header: "Date & Time",
      width: "120px",
      cellClassName: "align-top font-semibold text-slate-700",
      render: (entry: any) => {
        const [date, time] = displayDateTime(entry.created_at).split(", ");
        return (
          <span className="block leading-5">
            <span className="block whitespace-nowrap font-bold text-slate-900">
              {date}
            </span>
            <span className="block whitespace-nowrap text-xs font-medium text-slate-500">
              {time}
            </span>
          </span>
        );
      },
    },
    {
      key: "entry_type",
      header: "Activity",
      width: "145px",
      cellClassName: "align-top",
      render: (entry: any) => (
        <div className="max-w-[140px]">
          <p
            className="truncate block break-words font-bold leading-5 text-slate-950"
            title={humanizeOptionLabel(entry.entry_type)}
          >
            {humanizeOptionLabel(entry.entry_type)}
          </p>
        </div>
      ),
    },
    {
      key: "actor",
      header: "User",
      width: "170px",
      cellClassName: "align-top font-semibold text-slate-700",
      render: (entry: any) => (
        <span
          className="block break-words leading-5"
          title={entry.actor_user_name || "Unknown user"}
        >
          {entry.actor_user_name || "Unknown user"}
        </span>
      ),
    },
    {
      key: "debit_account",
      header: "Debit Account",
      width: "180px",
      cellClassName: "align-top font-semibold text-slate-700",
      render: (entry: any) => (
        <div className="max-w-[170px]">
          <p className="block truncate break-words leading-5">
            {hospitalLedgerLine(entry).debitAccount}
          </p>
        </div>
      ),
    },
    {
      key: "debit",
      header: "Debit",
      width: "100px",
      className: "text-right",
      cellClassName: "whitespace-nowrap text-right align-top",
      render: (entry: any) => {
        const line = hospitalLedgerLine(entry);
        return (
          <span
            className={`font-black tabular-nums ${
              line.debitAmount > 0 ? "text-rose-700" : "text-slate-500"
            }`}
          >
            {money(line.debitAmount)}
          </span>
        );
      },
    },
    {
      key: "credit_account",
      header: "Credit ₹",
      width: "180px",
      cellClassName: "align-top font-semibold text-slate-700",
      render: (entry: any) => (
        <span className="block break-words leading-5">
          {hospitalLedgerLine(entry).creditAccount}
        </span>
      ),
    },
    {
      key: "credit",
      header: "Credit",
      width: "100px",
      className: "text-right",
      cellClassName: "whitespace-nowrap text-right align-top",
      render: (entry: any) => {
        const line = hospitalLedgerLine(entry);
        return (
          <span
            className={`font-black tabular-nums ${
              line.creditAmount > 0 ? "text-emerald-700" : "text-slate-500"
            }`}
          >
            {money(line.creditAmount)}
          </span>
        );
      },
    },
    {
      key: "bill_amount",
      header: "Bill ₹",
      width: "115px",
      className: "text-right",
      cellClassName:
        "whitespace-nowrap text-right align-top font-black tabular-nums text-slate-700",
      render: (entry: any) =>
        money(
          (ledgerRunningById.get(entry.id) || { invoiceTotal: 0 }).invoiceTotal,
        ),
    },
    {
      key: "paid",
      header: "Paid",
      width: "90px",
      className: "text-right",
      cellClassName:
        "whitespace-nowrap text-right align-top font-black tabular-nums text-slate-700",
      render: (entry: any) =>
        money(
          (ledgerRunningById.get(entry.id) || { paidAmount: 0 }).paidAmount,
        ),
    },
    {
      key: "balance",
      header: "Balance",
      width: "105px",
      className: "text-right",
      cellClassName:
        "whitespace-nowrap text-right align-top font-black tabular-nums text-slate-700",
      render: (entry: any) =>
        money(
          (ledgerRunningById.get(entry.id) || { balanceAmount: 0 })
            .balanceAmount,
        ),
    },
    {
      key: "status",
      header: "Status",
      width: "110px",
      cellClassName: "align-top",
      render: (entry: any) => (
        <Badge
          tone={entry.status_after === "cancelled" ? "amber" : "slate"}
          className="normal-label"
        >
          {humanizeOptionLabel(entry.status_after)}
        </Badge>
      ),
    },
  ];
}
