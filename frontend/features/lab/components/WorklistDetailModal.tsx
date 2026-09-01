"use client";

import { useMemo } from "react";

import { Card, ActionButton, Button } from "@/app/components/common/ui";
import { displayDateTime } from "@/utils/helper";
import { useLabOrderDetail } from "../api";
import {
  canCopyDatabaseIds,
  CopyIdButton,
} from "@/app/components/common/CopyIdButton";

export function WorklistDetailModal({
  title,
  id,
  patient,
  createdAt,
  items,
  onClose,
  apiSession,
  onGenerateInvoice,
  onViewInvoice,
  invoiceBusy = false,
  invoiceGenerated = false,
  canGenerateInvoice = false,
  invoiceDisabled = false,
  packages = [],
}: any) {
  const canCopyIds = canCopyDatabaseIds(apiSession?.user);
  const { detail, loading, loadError } = useLabOrderDetail({
    apiSession,
    orderId: id,
  });

  const pricedItems = useMemo(() => {
    if (Array.isArray(detail?.items) && detail.items.length > 0) {
      const packageById = new Map(
        packages.map((item: any) => [item.id, item]),
      );
      const rows: any[] = [];
      const packageRows = new Map<string, any>();
      detail.items.forEach((item: any) => {
        if (!item.package_id) {
          rows.push({
            id: item.id,
            name: item.test_name,
            price: Number(item.price || 0),
            includedItems: [],
          });
          return;
        }
        const existing = packageRows.get(item.package_id);
        if (existing) {
          existing.includedItems.push(item.test_name);
          return;
        }
        const service: any = packageById.get(item.package_id);
        const row = {
          id: item.package_id,
          name: service?.name || "Service package",
          price: Number(service?.package_price || 0),
          includedItems: [item.test_name],
        };
        packageRows.set(item.package_id, row);
        rows.push(row);
      });
      return rows;
    }
    return items.map((item: string, index: number) => ({
      id: `${item}-${index}`,
      name: item,
      price: null,
    }));
  }, [detail?.items, items, packages]);
  const itemTotal = pricedItems.reduce(
    (sum: number, item: any) => sum + Number(item.price || 0),
    0,
  );
  const total = Number(detail?.order?.amount ?? itemTotal);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <Card className="flex w-full max-w-3xl max-h-[85vh] flex-col overflow-hidden p-5 bg-white">
        <div className="flex items-start justify-between gap-3 sticky top-0 z-10 bg-white pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold">{title}</h3>
              <CopyIdButton
                value={id}
                label="Lab / Service Order ID"
                allowed={canCopyIds}
              />
            </div>
            <p className="mt-1 text-sm text-slate-500">{patient}</p>
            <p className="text-xs text-slate-500">
              {createdAt ? displayDateTime(createdAt) : ""}
            </p>
          </div>
          <ActionButton onClick={onClose}>Close</ActionButton>
        </div>
        <div className="flex-1 overflow-y-auto">
        <div className="rounded-lg border border-slate-200">
          {loading ? (
            <p className="p-4 text-sm text-slate-500">Loading prices...</p>
          ) : pricedItems.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">
              No items found.
            </p>
          ) : (
            <table className="w-full text-left text-sm rounded-lg">
              <thead className="bg-white text-xs uppercase text-slate-500 rounded-lg">
                <tr>
                  <th className="w-16 px-4 py-3">#</th>
                  <th className="px-4 py-3">Lab Test / Service</th>
                  <th className="w-36 px-4 py-3 text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white bg-white">
                {pricedItems.map((item: any, index: number) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                    <td className="px-4 py-3 font-semibold">
                      <div>{item.name}</div>
                      {item.includedItems?.length > 0 && (
                        <div className="mt-1 text-xs font-medium text-slate-500">
                          Includes: {item.includedItems.join(", ")}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {item.price === null
                        ? "-"
                        : `₹${item.price.toLocaleString("en-IN")}`}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-white">
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-right font-bold">
                    Total
                  </td>
                  <td className="px-4 py-3 text-right text-base font-black">
                    ₹{total.toLocaleString("en-IN")}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
        {loadError && (
          <p className="mt-2 bg-white text-xs font-semibold text-red-600">{loadError}</p>
        )}
        </div>
        {canGenerateInvoice && (
          <div className="mt-4 flex justify-end sticky bottom-0 bg-white pt-3">
            <Button
              type="button"
              disabled={
                invoiceBusy ||
                loading ||
                (invoiceGenerated ? !onViewInvoice : invoiceDisabled)
              }
              onClick={invoiceGenerated ? onViewInvoice : onGenerateInvoice}
              className="save-button"
            >
              {invoiceBusy
                ? "Generating..."
                : invoiceGenerated
                  ? "View Invoice"
                  : "Generate Invoice"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
