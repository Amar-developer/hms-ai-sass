"use client";

import React from "react";
import InvoiceHeader from "./InvoiceHeader";
import { FieldRow } from "./FieldRow";
import CustomerDetails from "./CustomerDetails";
import { numberToWordsIndian, toNumber } from "../helpers";
import { InvoiceProps } from "../types";

const ROWS_PER_PAGE = 8;

export default function Invoice({
  company,
  invoiceNo,
  invoiceDate,
  customer,
  items,
  bank,
  terms = [
    "Subject to Tamil Nadu Jurisdiction.",
    "Goods once sold will not be taken back.",
    "Delivery Ex-Premises.",
  ],
  isPaid = false,
  signatoryLine,
  footerNote = "Thanks for your order! We look forward to working with you again soon.",
  currencySymbol = "₹",
  subTotal,
  discountAmount = 0,
  total,
  tax_amount = 0,
}: InvoiceProps) {
  const grandTotal = toNumber(total);
  const grandTotalWords = `${currencySymbol === "₹" ? "Rupees " : ""}${numberToWordsIndian(
    Math.floor(grandTotal),
  )} Only`;

  const pages: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += ROWS_PER_PAGE) {
    pages.push(items.slice(i, i + ROWS_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);

  const formatMoney = (v: number | string | undefined, symbol: string) => {
    const n = toNumber(v);
    return `${symbol}${n.toFixed(0)}`;
  };

  return (
    <div className="mx-auto w-full max-w-[900px] bg-white text-slate-900 print:max-w-full">
      {pages.map((pageItems, pageIndex) => {
        const isFirstPage = pageIndex === 0;
        const isLastPage = pageIndex === pages.length - 1;

        return (
          <div
            key={pageIndex}
            className="relative flex flex-col border-2 border-emerald-400 print:border-black print:min-h-[297mm] print:w-[210mm] print:mx-auto print:shadow-none"
          >
            <InvoiceHeader company={company} />

            {isFirstPage && company.tagline && (
              <p className="px-6 py-1 text-center text-sm font-semibold text-emerald-600 border-b-2 border-emerald-400">
                {company.tagline}
              </p>
            )}

            {isFirstPage && (
              <CustomerDetails
                customer={customer}
                company={company}
                invoiceNo={invoiceNo}
                invoiceDate={invoiceDate}
              />
            )}

            {/* Items Table */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="border border-emerald-400 flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-[0.4fr_2.5fr_0.5fr_0.5fr_0.5fr_0.5fr] border-y-2 border-emerald-400 text-[12.5px] font-bold  shrink-0">
                  <div className="border-r-2 border-emerald-400 p-2 text-center">Sr. No</div>
                  <div className="border-r-2 border-emerald-400 p-2 text-center">Name of Product / Service</div>
                  <div className="border-r-2 border-emerald-400 p-2 text-center">Qty</div>
                  <div className="border-r-2 border-emerald-400 p-2 text-center">MRP</div>
                  <div className="border-r-2 border-emerald-400 p-2 text-center">Disc. %</div>
                  <div className="p-2 text-center">Rate</div>
                </div>

                {/* Data Rows */}
                <div className="flex-1 flex flex-col">
                  {pageItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-[0.4fr_2.5fr_0.5fr_0.5fr_0.5fr_0.5fr] "
                    >
                      <div className="border-r-2 border-emerald-400 p-1.5 text-center">{item.srNo}</div>
                      <div className="border-r-2 border-emerald-400 p-1.5 break-words">{item.name}</div>
                      <div className="border-r-2 border-emerald-400 p-1.5 text-center">{item.qty}</div>
                      <div className="border-r-2 border-emerald-400 p-1.5 text-right">
                        {formatMoney(item.mrp, currencySymbol)}
                      </div>
                      <div className="border-r-2 border-emerald-400 p-1.5 text-center">
                        {item.discPercent ?? 0}%
                      </div>
                      <div className="p-1.5 text-right border-r border-emerald-400">
                        {formatMoney(item.rate, currencySymbol)}
                      </div>
                    </div>
                  ))}

                  {/* Dynamic Padding Rows - Only on last page */}
                  {isLastPage &&
                    Array.from({ length: Math.max(0, ROWS_PER_PAGE - pageItems.length) }).map((_, i) => (
                      <div
                        key={`pad-${i}`}
                        className="grid grid-cols-[0.4fr_2.5fr_0.5fr_0.5fr_0.5fr_0.5fr]  border-emerald-400 last:border-b-0 h-[38px] flex-1"
                      >
                        {Array.from({ length: 6 }).map((_, col) => (
                          <div key={col} className="border-r-2 border-emerald-400 last:border-r-" />
                        ))}
                      </div>
                    ))}
                </div>
              </div>

              {/* Totals Section - Always on last page */}
              {isLastPage && (
                <div className="border border-emerald-400 border-t-0 bg-white">
                  {/* Sub Total */}
                  <div className="grid grid-cols-[0.4fr_2.5fr_0.5fr_0.5fr_0.5fr_0.5fr] font-bold border-t-2 border-emerald-400">
                    <div className="col-span-5 p-2 text-right border-r-2 border-emerald-400">Sub Total</div>
                    <div className="p-2 text-right">{formatMoney(subTotal, currencySymbol)}</div>
                  </div>

                  {/* Tax (conditional) */}
                  {toNumber(tax_amount) > 0 && (
                    <div className="grid grid-cols-[0.4fr_2.5fr_0.5fr_0.5fr_0.5fr_0.5fr] font-bold border-t-2 border-emerald-400">
                      <div className="col-span-5 p-2 text-right border-r-2 border-emerald-400">Tax</div>
                      <div className="p-2 text-right">{formatMoney(tax_amount, currencySymbol)}</div>
                    </div>
                  )}

                  {/* Discount (conditional) */}
                  {toNumber(discountAmount) > 0 && (
                    <div className="grid grid-cols-[0.4fr_2.5fr_0.5fr_0.5fr_0.5fr_0.5fr] font-bold border-t-2 border-emerald-400">
                      <div className="col-span-5 p-2 text-right border-r-2 border-emerald-400">Discount</div>
                      <div className="p-2 text-right text-red-600">
                        -{formatMoney(discountAmount, currencySymbol)}
                      </div>
                    </div>
                  )}

                  {/* Grand Total */}
                  <div className="grid grid-cols-[0.4fr_2.5fr_0.5fr_0.5fr_0.5fr_0.5fr] border-t-2 border-emerald-400 font-bold ">
                    <div className="col-span-3 p-3 border-r-2 border-emerald-400 flex items-center justify-between">
                      <span>{invoiceDate}</span>
                      <span className="text-lg">Total</span>
                    </div>
                    <div className="border-r-2 border-emerald-400 p-3 text-right font-mono">
                      {toNumber(items.reduce((sum, item) => sum + toNumber(item.qty), 0))}
                    </div>
                     <div className="border-r-2 border-emerald-400 p-3 text-right font-mono"/>
                    <div className="p-3 text-right font-mono text-lg">
                      {formatMoney(total, currencySymbol)}
                    </div>
                  </div>

                  {/* Total in Words */}
                  <div className="border-y-2 border-emerald-400 p-2 text-sm font-semibold">
                    Total in words:{" "}
                    <span className="font-normal">{grandTotalWords}</span>
                  </div>
                </div>
              )}

              {!isLastPage && (
                <div className="text-center text-sm py-3 border border-emerald-400 mt-2">
                  Continue on next page...
                </div>
              )}
            </div>

            {/* Bank Details & Signature */}
            <div className="border-b-2 border-emerald-400 grid grid-cols-1 sm:grid-cols-[1.35fr_1fr] text-[13px] mt-auto">
              {/* Left side - Bank + Terms */}
              <div className="border-b sm:border-b-0 sm:border-r border-emerald-400">
                <h2 className="font-bold border-b-2 border-emerald-400 py-1.5 text-center">Bank Details</h2>
                <div className="flex gap-4 px-2">
                  <div className="space-y-1 flex-1 py-1.5">
                    <FieldRow label="Name" value={bank?.name} />
                    <FieldRow label="Branch" value={bank?.branch} />
                    <FieldRow label="Acc. Number" value={bank?.accountNumber} />
                    <FieldRow label="IFSC" value={bank?.ifsc} />
                    <FieldRow label="UPI ID" value={bank?.upiId} />
                  </div>
                  <div className="text-center pt-1">
                    <div className="h-20 w-20 border border-emerald-400 rounded flex items-center justify-center mx-auto">
                      {bank?.qrImageUrl ? (
                        <img src={bank.qrImageUrl} alt="QR" className="h-full w-full object-contain" />
                      ) : (
                        <span className="text-xs">QR CODE</span>
                      )}
                    </div>
                    <p className="text-xs mt-1 font-medium">Pay using UPI</p>
                  </div>
                </div>

                <div className="mt-2">
                  <h3 className="font-bold py-1 border-y-2 border-emerald-400 text-center">Terms and Conditions</h3>
                  <ul className="text-xs space-y-0.5 pl-5 list-disc py-1">
                    {terms.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>

                <div className="mt-3 border-t-2 py-1.5 border-emerald-400">
                  <p className="font-semibold text-center">Customer Signature</p>
                </div>
              </div>

              {/* Right side - Certification & Signature */}
              <div className="flex flex-col justify-between">
                <div className="border-b-2 border-emerald-400 p-2">
                  <p className="text-xs">
                    Certified that the particulars given above are true and correct.
                  </p>
                  <p className="mt-3 font-bold">{signatoryLine || `For ${company.name}`}</p>
                </div>

                {isPaid && (
                  <div className="flex justify-center my-4">
                    <div className="-rotate-12 border-4 border-red-600 px-10 py-2 text-center">
                      <span className="block text-4xl font-black text-red-600">PAID</span>
                    </div>
                  </div>
                )}

                <div className="text-center font-bold border-t-2 border-emerald-400 py-1.5">
                  Authorized Signature
                </div>
              </div>
            </div>

            {isLastPage && footerNote && (
              <div className="text-center text-xs text-slate-600 border-b-2 border-emerald-400 py-2">
                {footerNote}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
