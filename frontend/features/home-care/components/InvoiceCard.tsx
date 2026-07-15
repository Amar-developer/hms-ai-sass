import {
  Card,
  Button,
  ActionButton,
  Badge,
} from "@/app/components/common/ui";
import { humanizeOptionLabel } from "@/lib/options";
import { displayDate, money, patientName } from "@/utils/helper";
import { bookingTotal } from "../helpers";

export function InvoiceCard({
  booking,
  patientMap,
  invoiceDetail,
  busy,
  onGenerate,
  onBack,
  onOpenInvoiceModule,
}: any) {
  if (!booking) {
    return (
      <Card>
        <p className="text-sm text-slate-500">Select a booking to bill.</p>
        <div className="mt-4">
          <ActionButton onClick={onBack}>Back</ActionButton>
        </div>
      </Card>
    );
  }
  return (
    <Card className="mx-auto max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="card-title font-bold">Generate Invoice</h3>
          <p className="table-data text-slate-500">
            Bill the selected booking from its service lines.
          </p>
        </div>
        <Badge className="normal-badge">
          {humanizeOptionLabel(booking.status)}
        </Badge>
      </div>
      <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm">
        <b>{booking.booking_number}</b>
        <p className="mt-1 text-slate-500">
          {patientName(patientMap.get(booking.patient_id))} ·{" "}
          {displayDate(booking.start_date)} to {displayDate(booking.end_date)}
        </p>
        <p className="text-xs text-slate-500">
          {humanizeOptionLabel(booking.recurrence || "daily")}
        </p>
        <p className="mt-2 font-bold">{money(bookingTotal(booking))}</p>
      </div>
      {invoiceDetail?.invoice ? (
        <div className="mt-4 rounded-2xl border p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <b>{invoiceDetail.invoice.invoice_number}</b>
            <Badge className="normal-badge">
              {humanizeOptionLabel(invoiceDetail.invoice.status)}
            </Badge>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-slate-600">
            <span>Subtotal</span>
            <b className="text-right text-slate-900">
              {money(invoiceDetail.invoice.subtotal_amount)}
            </b>
            <span>Approved / offer discount</span>
            <b className="text-right text-slate-900">
              {money(invoiceDetail.invoice.discount_amount)}
            </b>
            <span>Tax</span>
            <b className="text-right text-slate-900">
              {money(invoiceDetail.invoice.tax_amount)}
            </b>
            <span>Final payable</span>
            <b className="text-right text-slate-900">
              {money(invoiceDetail.invoice.total_amount)}
            </b>
            <span>Balance</span>
            <b className="text-right text-slate-900">
              {money(invoiceDetail.invoice.balance_amount)}
            </b>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Payment and receipt are handled from the Invoices module.
          </p>
          <div className="w-full flex justify-center">
            <Button
              type="button"
              className="w-1/2 rounded-lg px-2 py-2 mt-4 lg:px-4 lg:py-3 text-xs lg:text-sm"
              onClick={onOpenInvoiceModule}
            >
              Open in Invoices Module
            </Button>
          </div>
        </div>
      ) : String(booking.status).toLowerCase() === "cancelled" ? (
        <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
          This booking is cancelled. Invoices can no longer be generated for it.
        </p>
      ) : (
        <div className="mt-4 grid gap-3">
          <p className="text-xs text-slate-500">
            Generate the invoice at the full service amount. To reduce the
            price, open it in the Invoices module and use Request Discount;
            the tenant admin must approve it before it is applied.
          </p>
          <Button type="button" disabled={busy} onClick={onGenerate}>
            {busy ? "Generating..." : "Generate Invoice"}
          </Button>
        </div>
      )}
      <div className="mt-4">
        <ActionButton onClick={onBack}>Back to Booking</ActionButton>
      </div>
    </Card>
  );
}
