import type React from "react";
import { humanizeOptionLabel } from "@/lib/options";
import { RowActions } from "../admin/components/RowActions";
import { Column } from "@/utils/types";

type getItemsColumnsProps = {
  deleteItem: (row: any) => void;
  startEdit: (row: any) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  busy: string;
};

export function getItemsColumns({
  deleteItem,
  startEdit,
  containerRef,
  busy,
}: getItemsColumnsProps): Column<any>[] {
  return [
    {
      key: "type",
      header: "Type",
      width: "180px",
      sortable: true,
      render: (row: any) => (
        <p className="text-sm font-bold">{humanizeOptionLabel(row.kind)}</p>
      ),
    },
    {
      key: "name",
      header: "Item",
      width: "180px",
      sortable: true,
      render: (row: any) => <b className="text-sm">{row.name}</b>,
    },
    {
      key: "supplier",
      header: "Supplier",
      width: "130px",
      render: (row: any) => <span className="text-sm">{row.supplier}</span>,
    },
    {
      key: "mrp_price",
      header: "MRP",
      width: "100px",
      sortable: true,
      render: (row: any) => (
        <span className="text-sm">
          {row.mrp_price === null ? "-" : `₹${row.mrp_price || 0}`}
        </span>
      ),
    },
    {
      key: "purchase_price",
      header: "Purchase",
      width: "100px",
      render: (row: any) => (
        <span className="text-sm">
          {row.purchase_price === null ? "-" : `₹${row.purchase_price || 0}`}
        </span>
      ),
    },
    {
      key: "price",
      header: "Sale Price",
      width: "120px",
      className: "text-center",
      cellClassName: "text-center",
      sortable: true,
      render: (row: any) => (
        <span className="text-sm">
          {row.price === null ? "-" : `₹${row.price}`}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "100px",
      className: "text-right",
      cellClassName: "text-right",
      disableRowClick: true,
      render: (row: any) => (
        <div className="flex justify-end">
          <RowActions
            actions={[
              {
                label: "Edit",
                onClick: () => {
                  startEdit(row);

                  setTimeout(() => {
                    containerRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }, 100);
                },
              },
              {
                label: busy === `delete-${row.id}` ? "Deleting..." : "Delete",
                onClick: () => deleteItem(row),
                disabled: busy === `delete-${row.id}`,
                danger: true,
              },
            ]}
            className="right-8 -bottom-5"
          />
        </div>
      ),
    },
  ];
}
