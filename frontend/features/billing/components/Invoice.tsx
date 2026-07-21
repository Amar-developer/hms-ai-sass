"use client";

import React from "react";
import InvoiceHeader from "./InvoiceHeader";
import { FieldRow } from "./FieldRow";
import CustomerDetails from "./CustomerDetails";
import { formatMoney, numberToWordsIndian, toNumber } from "../helpers";
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
  taxableAmount,
  taxAmount = 0,
  taxLabel = "Tax",
  total,
}: InvoiceProps) {
  const totals = items.reduce(
    (acc, item) => {
      acc.qty += toNumber(item.qty);
      acc.mrp += toNumber(item.mrp) * toNumber(item.qty);
      acc.rate += toNumber(item.rate);
      return acc;
    },
    { qty: 0, mrp: 0, rate: 0 },
  );

  const grandTotal = toNumber(total);

  const grandTotalWords = `${currencySymbol === "₹" ? "Rupees " : ""}${numberToWordsIndian(
    Math.floor(grandTotal),
  )} Only`;

  const pages: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += ROWS_PER_PAGE) {
    pages.push(items.slice(i, i + ROWS_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);
  return (
    <div className="mx-auto w-full max-w-[900px] bg-white text-slate-900 print:max-w-full">
      {pages.map((pageItems, pageIndex) => {
        const isFirstPage = pageIndex === 0;
        const isLastPage = pageIndex === pages.length - 1;

        return (
          <div
            key={pageIndex}
            className="relative flex flex-col border-2 border-emerald-400 print:border-black print:min-h-[297mm] print:w-[210mm] print:mx-auto"
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

            {/* Items Table - Only Vertical Borders */}
            <div className="flex-1 ">
              <div className="border border-emerald-400 overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-[60px_minmax(0,2fr)_65px_95px_70px_105px] border-y-2 border-emerald-400 text-[12.5px] font-bold bg-emerald-50">
                  <div className="border-r border-emerald-400 p-2 text-center">Sr. No</div>
                  <div className="border-r border-emerald-400 p-2 text-center">Name of Product / Service</div>
                  <div className="border-r border-emerald-400 p-2 text-center">Qty</div>
                  <div className="border-r border-emerald-400 p-2 text-center">MRP</div>
                  <div className="border-r border-emerald-400 p-2 text-center">Disc. %</div>
                  <div className="p-2 text-center">Rate</div>
                </div>

                {/* Data Rows */}
                <div>
                  {pageItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-[60px_minmax(0,2fr)_65px_95px_70px_105px] "
                    >
                      <div className="border-r border-emerald-400 p-2 text-center">{item.srNo}</div>
                      <div className="border-r border-emerald-400 p-2 break-words">{item.name}</div>
                      <div className="border-r border-emerald-400 p-2 text-center">{item.qty}</div>
                      <div className="border-r border-emerald-400 p-2 text-right">
                        {formatMoney(item.mrp, currencySymbol)}
                      </div>
                      <div className="border-r border-emerald-400 p-2 text-center">
                        {item.discPercent ?? 0}%
                      </div>
                      <div className="p-2 text-right">
                        {formatMoney(item.rate, currencySymbol)}
                      </div>
                    </div>
                  ))}

                  {/* Padding Rows - Full Height Vertical Borders */}
                  {isLastPage &&
                    Array.from({ length: Math.max(0, ROWS_PER_PAGE - pageItems.length) }).map((_, i) => (
                      <div
                        key={`pad-${i}`}
                        className="grid grid-cols-[60px_minmax(0,2fr)_65px_95px_70px_105px] last:border-b-0 h-[38px]"
                      >
                        <div className="border-r border-emerald-400" />
                        <div className="border-r border-emerald-400" />
                        <div className="border-r border-emerald-400" />
                        <div className="border-r border-emerald-400" />
                        <div className="border-r border-emerald-400" />
                        <div />
                      </div>
                    ))}
                </div>
              </div>

              {/* Totals - Last Page Only */}
              {isLastPage && (
                <div className="">
                  <div className="grid grid-cols-[60px_minmax(0,2fr)_65px_95px_70px_105px] border-2 border-emerald-400 font-bold">
                    <div className="col-span-5 p-2 text-right border-r border-emerald-400">Sub Total</div>
                    <div className="p-2 text-right">{formatMoney(subTotal, currencySymbol)}</div>
                  </div>

                  {toNumber(discountAmount) > 0 && (
                    <div className="grid grid-cols-[60px_minmax(0,2fr)_65px_95px_70px_105px] border-x-2 border-b-2 border-emerald-400 font-bold">
                      <div className="col-span-5 p-2 text-right border-r border-emerald-400">Discount</div>
                      <div className="p-2 text-right">-{formatMoney(discountAmount, currencySymbol)}</div>
                    </div>
                  )}

                  {toNumber(taxAmount) > 0 && (
                    <>
                      <div className="grid grid-cols-[60px_minmax(0,2fr)_65px_95px_70px_105px] border-x-2 border-b-2 border-emerald-400 font-bold">
                        <div className="col-span-5 p-2 text-right border-r border-emerald-400">Taxable Amount</div>
                        <div className="p-2 text-right">{formatMoney(taxableAmount, currencySymbol)}</div>
                      </div>
                      <div className="grid grid-cols-[60px_minmax(0,2fr)_65px_95px_70px_105px] border-x-2 border-b-2 border-emerald-400 font-bold">
                        <div className="col-span-5 p-2 text-right border-r border-emerald-400">{taxLabel}</div>
                        <div className="p-2 text-right">{formatMoney(taxAmount, currencySymbol)}</div>
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-[60px_minmax(0,2fr)_65px_95px_70px_105px] border-2 border-b border-emerald-400 font-bold">
                    <div className="col-span-2 w-full border-r border-emerald-400 p-2 text-center"><p className="w-full flex justify-between"><span>{invoiceDate}</span><span>Total</span></p></div>
                    <div className="border-r border-emerald-400 p-2 text-center">{totals.qty}</div>
                    <div className="border-r border-emerald-400 p-2 text-right">
                      {formatMoney(totals.mrp, currencySymbol)}
                    </div>
                    <div className="border-r border-emerald-400 p-2" />
                    <div className="p-2 flex flex-col text-right">
                      {formatMoney(total, currencySymbol)}
                      <span className="text-[8px]">(tax included) </span>
                    </div>
                  </div>

                  <div className="border-2 border-b border-emerald-400  p-2 text-sm font-semibold">
                    Total in words: {grandTotalWords}
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
            <div className="border-t-2 border-emerald-400 grid grid-cols-1 sm:grid-cols-[1.35fr_1fr] text-[13px] mt-auto">
              <div className=" border-b sm:border-b-0 sm:border-r border-emerald-400">
                <h2 className="font-bold border-b-2 border-emerald-400 py-2 text-center">Bank Details</h2>
                <div className="flex gap-4 px-2">
                  <div className="space-y-1 flex-1 py-2">
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

                <div className="mt-4  ">
                  <h3 className="font-bold py-1 text-centger border-y-2 border-emerald-400 text-center">Terms and Conditions</h3>
                  <ul className="text-xs space-y-0.5 pl-5 list-disc">
                    {terms.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>

                <div className="mt-3 border-t-2 py-1 border-emerald-400">
                  <p className="font-semibold text-center">Customer Signature</p>
                </div>
              </div>

              <div className=" flex flex-col justify-between">
                <div className="border-b-2 border-emerald-400 p-2">
                  <p className="text-xs">Certified that the particulars given above are true and correct.</p>
                  <p className="mt-3 font-bold">{signatoryLine || `For ${company.name}`}</p>
                </div>

                {isPaid && (
                  <div className="flex justify-center my-3">
                    <div className="-rotate-12 border-4 border-red-600 px-8 py-2 text-center">
                      <span className="block text-3xl font-black text-red-600">PAID</span>
                    </div>
                  </div>
                )}

                <div className="text-center font-bold border-t-2 border-emerald-400 py-1">Authorized Signature</div>
              </div>
            </div>

            {isLastPage && footerNote && (
              <div className="text-center text-xs text-slate-600 border-t-2 border-emerald-400 py-2">
                {footerNote}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
