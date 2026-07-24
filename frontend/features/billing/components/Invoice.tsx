"use client";

import React from "react";
import InvoiceHeader from "./InvoiceHeader";
import { FieldRow } from "./FieldRow";
import CustomerDetails from "./CustomerDetails";
import {
  formatMoney,
  formatDiscountPercentage,
  formatPercentage,
  numberToWordsIndian,
  toNumber,
} from "../helpers";
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
  footerNote = "Thanks for your order! We look forward to working with you agin soon.",
  currencySymbol = "₹",
  subTotal,
  discountAmount = 0,
  total,
  taxAmount,
  tax_amount,
  taxLabel = "Tax",
  taxPercentage = 0,
  paidAmount = 0,
  balanceAmount = 0,
}: InvoiceProps) {
  const grandTotal = toNumber(total);
  const resolvedTaxAmount = toNumber(taxAmount ?? tax_amount);
  const resolvedPaidAmount = toNumber(paidAmount);
  const resolvedBalanceAmount = toNumber(balanceAmount);
  const wholeAmount = Math.round(grandTotal);
  const grandTotalWords = `${currencySymbol === "₹" ? "Rupees " : ""}${numberToWordsIndian(
    wholeAmount,
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
            data-invoice-page
            className="relative flex flex-col border-2 border-[#25FF46] print:border-black print:min-h-[297mm] print:w-[210mm] print:mx-auto print:shadow-none"
          >
            <InvoiceHeader company={company} />

            {isFirstPage && company.tagline && (
              <p className="px-6 py-1 flex justify-center items-center text-sm font-semibold text-emerald-600 border-b-2 border-[#00AD00]">
                {company.tagline}
              </p>
            )}

            <div className="py-0 border-b-2 border-[#25FF46] text-[16px] font-bold text-center text-[#00AD00] pb-5">
              A Single Stop for All Your HealthCare Needs !
            </div>
            {isFirstPage && (
              <CustomerDetails
                customer={customer}
                company={company}
                invoiceNo={invoiceNo}
                invoiceDate={invoiceDate}
              />
            )}

            {/* Items Table */}
            <div className="flex flex-col">
              <div className="border border-[#25FF46] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-[0.4fr_2.5fr_0.5fr_0.5fr_0.5fr_0.5fr] border-y-2 border-[#25FF46] text-[12.5px] font-bold  shrink-0">
                  <div className="border-r-2 flex justify-center items-center border-[#25FF46] p-2 pb-5">
                    Sr. No
                  </div>
                  <div className="border-r-2 flex justify-center items-center border-[#25FF46] p-2 pb-5">
                    Name of Product / Service
                  </div>
                  <div className="border-r-2 flex justify-center items-center border-[#25FF46] p-2 pb-5">
                    Qty
                  </div>
                  <div className="border-r-2 flex justify-center items-center border-[#25FF46] p-2 pb-5">
                    MRP
                  </div>
                  <div className="border-r-2 flex justify-center items-center border-[#25FF46] p-2 pb-5">
                    Disc. %
                  </div>
                  <div className="flex justify-center items-center p-2 pb-5">
                    Rate
                  </div>
                </div>

                {/* Data Rows */}
                <div className="flex flex-col">
                  {pageItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-[0.4fr_2.5fr_0.5fr_0.5fr_0.5fr_0.5fr] min-h-[38px]"
                    >
                      <div className="border-r-2 flex justify-center items-center border-[#25FF46] p-1.5">
                        {item.srNo}
                      </div>
                      <div className="border-r-2 flex items-center border-[#25FF46] p-1.5 break-words">
                        {item.name}
                      </div>
                      <div className="border-r-2 flex justify-center items-center border-[#25FF46] p-1.5">
                        {item.qty}
                      </div>
                      <div className="border-r-2 flex justify-end items-center border-[#25FF46] p-1.5">
                        {item.mrp === "" || item.mrp === undefined || item.mrp === null
                          ? "-"
                          : formatMoney(item.mrp, currencySymbol)}
                      </div>
                      <div className="border-r-2 flex justify-center items-center border-[#25FF46] p-1.5">
                        {formatDiscountPercentage(item.discPercent)}%
                      </div>
                      <div className="flex justify-end items-center p-1.5 border-r border-[#25FF46]">
                        {formatMoney(item.rate, currencySymbol)}
                      </div>
                    </div>
                  ))}

                  {/* Dynamic Padding Rows - Only on last page */}
                  {isLastPage &&
                    Array.from({
                      length: Math.max(0, ROWS_PER_PAGE - pageItems.length),
                    }).map((_, i) => (
                      <div
                        key={`pad-${i}`}
                        className="grid grid-cols-[0.4fr_2.5fr_0.5fr_0.5fr_0.5fr_0.5fr] border-[#25FF46] last:border-b-0 h-[38px] shrink-0"
                      >
                        {Array.from({ length: 6 }).map((_, col) => (
                          <div
                            key={col}
                            className=" border-[#25FF46] border-r-2 last:border-r-0"
                          />
                        ))}
                      </div>
                    ))}
                </div>
              </div>

              {/* Totals Section - Always on last page */}
              {isLastPage && (
                <div className="border border-[#25FF46] border-t-0 bg-white">
                  {/* Sub Total */}
                  <div className="grid grid-cols-[0.4fr_2.5fr_0.5fr_0.5fr_0.5fr_0.5fr] font-bold border-t-2 border-[#25FF46]">
                    <div className="col-span-5 flex justify-end items-center pb-5 p-2 border-r-2 border-[#25FF46]">
                      Sub Total
                    </div>
                    <div className="flex justify-end items-center pb-5 p-2">
                      {formatMoney(subTotal, currencySymbol)}
                    </div>
                  </div>

                  {/* Discount (conditional) */}
                  {toNumber(discountAmount) > 0 && (
                    <div className="grid grid-cols-[0.4fr_2.5fr_0.5fr_0.5fr_0.5fr_0.5fr] font-bold border-t-2 border-[#25FF46]">
                      <div className="col-span-5 flex justify-end items-center p-2 pb-5 border-r-2 border-[#25FF46]">Discount</div>
                      <div className="flex justify-end items-center p-2 pb-5 text-red-600">
                        -{formatMoney(discountAmount, currencySymbol)}
                      </div>
                    </div>
                  )}

                  {/* Tax (conditional) */}
                  {resolvedTaxAmount > 0 && (
                    <div className="grid grid-cols-[0.4fr_2.5fr_0.5fr_0.5fr_0.5fr_0.5fr] font-bold border-t-2 border-[#25FF46]">
                      <div className="col-span-5 flex justify-end items-center p-2 pb-5 border-r-2 border-[#25FF46]">
                        {taxLabel}
                        {taxPercentage > 0
                          ? ` (${formatPercentage(taxPercentage)}%)`
                          : ""}
                      </div>
                      <div className="flex justify-end items-center  p-2 pb-5">
                        {formatMoney(resolvedTaxAmount, currencySymbol)}
                      </div>
                    </div>
                  )}

                  {/* Grand Total */}
                  <div className="grid grid-cols-[0.4fr_2.5fr_0.5fr_0.5fr_0.5fr_0.5fr] border-t-2 border-[#25FF46] font-bold ">
                    <div className="col-span-3 p-3 pb-5 border-r-2 border-[#25FF46] flex items-center justify-between">
                      <span>{invoiceDate}</span>
                      <span className="text-lg">Total</span>
                    </div>
                    <div className="border-r-2 flex justify-end items-center border-[#25FF46] p-3 pb-5 font-mono">
                      {toNumber(
                        items.reduce(
                          (sum, item) => sum + toNumber(item.qty),
                          0,
                        ),
                      )}
                    </div>
                    <div className="border-r-2 border-[#25FF46] p-3 font-mono" />
                    <div className="flex justify-end items-center p-3 pb-5 font-mono text-lg">
                      {formatMoney(total, currencySymbol)}
                    </div>
                  </div>

                  {resolvedPaidAmount > 0 && (
                    <div className="grid grid-cols-[0.4fr_2.5fr_0.5fr_0.5fr_0.5fr_0.5fr] font-bold border-t-2 border-[#25FF46]">
                      <div className="col-span-5 flex justify-end items-center p-2 pb-5 border-r-2 border-[#25FF46]">Paid Amount</div>
                      <div className="flex justify-end items-center p-2 pb-5">{formatMoney(resolvedPaidAmount, currencySymbol)}</div>
                    </div>
                  )}

                  {resolvedBalanceAmount > 0 && (
                    <div className="grid grid-cols-[0.4fr_2.5fr_0.5fr_0.5fr_0.5fr_0.5fr] font-bold border-t-2 border-[#25FF46]">
                      <div className="col-span-5 flex justify-end items-center p-2 pb-5 border-r-2 border-[#25FF46]">Balance Due</div>
                      <div className="flex justify-end items-center p-2 pb-5 text-red-600">{formatMoney(resolvedBalanceAmount, currencySymbol)}</div>
                    </div>
                  )}

                  {/* Total in Words */}
                  <div className="border-y-2 border-[#25FF46] p-2 pb-5 text-sm font-semibold">
                    Total in words:{" "}
                    <span className="font-extrabold text-[#00AD00]">
                      {grandTotalWords}
                    </span>
                  </div>
                </div>
              )}

              {!isLastPage && (
                <div className="text-center text-sm py-3 border border-[#25FF46] mt-2">
                  Continue on next page...
                </div>
              )}
            </div>

            {/* Bank Details & Signature */}
            <div className="border-b-2 border-[#25FF46] grid grid-cols-1 sm:grid-cols-[1.35fr_1fr] text-[13px] mt-auto">
              {/* Left side - Bank + Terms */}
              <div className="border-b sm:border-b-0 sm:border-r border-[#25FF46]">
                <h2 className="font-bold border-b-2 border-[#25FF46] py-1.5 flex justify-center items-center pb-5">
                  Bank Details
                </h2>
                <div className="flex gap-4 px-2">
                  <div className="space-y-1 flex-1 py-1.5">
                    <FieldRow label="Name" value={bank?.name} />
                    <FieldRow label="Branch" value={bank?.branch} />
                    <FieldRow label="Acc. Number" value={bank?.accountNumber} />
                    <FieldRow label="IFSC" value={bank?.ifsc} />
                    <FieldRow label="UPI ID" value={bank?.upiId} />
                  </div>
                  <div className="text-center pt-1">
                    <div className="h-20 w-20 border border-[#25FF46] rounded flex items-center justify-center mx-auto">
                      <img
                        src={bank?.qrImageUrl || "/qrcode.jpeg"}
                        alt="QR"
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <p className="text-xs mt-1 font-medium">Pay using UPI</p>
                  </div>
                </div>

                <div className="mt-2">
                  <h3 className="font-bold py-1 border-y-2 border-[#25FF46] flex justify-center items-center pb-5">
                    Terms and Conditions
                  </h3>
                  <ul className="list-none text-xs space-y-0.5 pl-5 list-disc py-1">
                    {terms.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>

                <div className="mt-3 border-t-2 py-1.5 border-[#25FF46]">
                  <p className="font-semibold flex justify-center items-center">
                    Customer Signature
                  </p>
                </div>
              </div>

              {/* Right side - Certification & Signature */}
              <div className="flex flex-col justify-between">
                <div className="border-b-2 border-[#25FF46] p-2 pb-5">
                  <p className="text-xs">
                    Certified that the particulars given above are true and
                    correct.
                  </p>
                  <p className="mt-3 font-bold">
                    {signatoryLine || `For ${company.name}`}
                  </p>
                </div>

                {isPaid && (
                  <div className="flex justify-center my-4">
                    <div className="relative -rotate-12 border-4 border-[#37A94C] px-6 py-1 text-center">
                      <span className="block text-4xl font-black leading-none text-[#37A94C] pb-2">
                        PAID
                      </span>
                      <span className="block text-lg font-black leading-tight tracking-wide text-[#37A94C] pb-6">
                        THANK YOU
                      </span>
                    </div>
                  </div>
                )}

                <div className="font-bold border-t-2 border-[#25FF46] py-1.5 flex justify-center items-center">
                  Authorized Signature
                </div>
              </div>
            </div>

            {isLastPage && footerNote && (
              <div className="flex justify-center items-center text-center text-xs text-slate-600 border-b-2 border-[#25FF46] py-2">
                {footerNote}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
