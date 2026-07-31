"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionButton,
  ActionGroup,
  Badge,
  Button,
  Card,
  RefreshButton,
  SearchableSelect,
  StatusToast,
} from "@/app/components/common/ui";
import {
  FormField,
  NumberField,
  SelectField,
} from "@/app/components/FormElements";
import { Input } from "@/app/components/common/ui";
import { humanizeOptionLabel } from "@/lib/options";
import {
  homeServiceTypes,
  itemTypes,
  modalities,
  price_options,
  serviceItemTypes,
  sort_type_options,
} from "@/features/items/constants";
import { ItemForm } from "@/features/items/forms/ItemForms";
import { ItemFormValues, itemSchema } from "@/features/items/items.schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RowActions } from "../admin/components/RowActions";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";
import { generatedItemCode } from "./helpers";
import { TableSkeleton } from "@/app/components/common/loader/TableSkeleton";
import { useItemsActions, useItemsData } from "./api";

function itemCodePreview(type: string, name: string) {
  const prefixes: Record<string, string> = {
    medicine: "MED",
    lab_test: "LAB",
    lab_package: "PKG",
    physio_equipment: "PHY",
    home_care_service: "HC",
    home_visit_service: "HV",
  };
  const compactName = String(name || "ITEM")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 6);
  return `${prefixes[type] || "ITM"}-${compactName || "ITEM"}-AUTO`;
}

function createEmptyForm(type: string) {
  return {
    code: "",
    name: "",
    generic_name: "",
    mrp_price: "",
    price: "",
    purchase_price: serviceItemTypes.includes(type) ? "" : "0",
    supplier_id: "",
    reorder_level: "",
    sample_type: "",
    description: "",
    modality_type: "ift",
    manufacturer: "",
    model_number: "",
    serial_number: "",
    is_portable: "false",
    branch_scope: "tenant",
  };
}

export function Items({ apiSession, branchId }: any) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: "",
      generic_name: "",
      mrp_price: "",
      price: "",
      purchase_price: "",
      supplier_id: "",
      reorder_level: "",
      sample_type: "",
      description: "",
      modality_type: "ift",
      manufacturer: "",
      model_number: "",
      serial_number: "",
      is_portable: "false",
    },
  });
  const [type, setType] = useState("medicine");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const {
    medicines,
    tests,
    packages,
    equipment,
    homeCareServices,
    stockSuppliers,
    loading,
    loadError,
    load,
  } = useItemsData({ apiSession, branchId });
  const [packageTestIds, setPackageTestIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [confirmAction, setConfirmAction] = useState<any>(null);
  const [filters, setFilters] = useState({
    type: "all",
    query: "",
    labOnly: "all",
    priceBand: "all",
    sortBy: "name",
  });
  const [page, setPage] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 10;
  function setFiltersAndReset(f: any) {
    setFilters(f);
    setPage(1);
  }
  const [form, setForm] = useState<any>(() => createEmptyForm("medicine"));
  const autoCode = editing
    ? type === "physio_equipment"
      ? form.serial_number || form.code || ""
      : form.code || ""
    : itemCodePreview(type, form.name);

  const supplierName = (id: string | null | undefined) =>
    stockSuppliers.find((supplier: any) => supplier.id === id)?.name || "-";
  const rows = useMemo(
    () => [
      ...medicines.map((row: any) => ({
        type: "medicine",
        kind: "Medicine",
        name: row.name,
        code: row.code,
        mrp_price: row.mrp_price || 0,
        price: row.default_sale_price,
        purchase_price: row.purchase_price || 0,
        supplier: supplierName(row.supplier_id),
        meta: row.generic_name || row.form || "-",
        created_at: row.created_at || row.updated_at || "",
        id: row.id,
        raw: row,
      })),
      ...tests.map((row: any) => ({
        type: "lab_test",
        kind: "Lab Test",
        name: row.name,
        code: row.code,
        mrp_price: row.mrp_price || 0,
        price: row.default_price,
        purchase_price: row.purchase_price || 0,
        supplier: supplierName(row.supplier_id),
        meta: row.sample_type || "-",
        created_at: row.created_at || row.updated_at || "",
        id: row.id,
        raw: row,
      })),
      ...packages.map((row: any) => ({
        type: "lab_package",
        kind: "Service",
        name: row.name,
        code: row.code,
        mrp_price: row.mrp_price || 0,
        price: row.package_price,
        purchase_price: null,
        supplier: "-",
        meta: row.description || `${row.test_ids?.length || 0} tests`,
        created_at: row.created_at || row.updated_at || "",
        id: row.id,
        raw: row,
      })),
      ...equipment.map((row: any) => ({
        type: "physio_equipment",
        kind: "Physio Equipment",
        name: row.name,
        code: row.serial_number || row.code || "",
        mrp_price: row.mrp_price || 0,
        price: null,
        purchase_price: row.purchase_price || 0,
        supplier: supplierName(row.supplier_id),
        meta: `${row.modality_type} · ${row.is_portable ? "Portable" : "Fixed"}`,
        created_at: row.created_at || row.updated_at || "",
        id: row.id,
        raw: row,
      })),
      ...homeCareServices.filter((row: any) =>
        String(row.code || "").startsWith("HV-"),
      ).map((row: any) => {
        return {
          type: "home_visit_service",
          kind: "Home Visit Service",
          name: row.name,
          code: row.code,
          mrp_price: row.mrp_price || 0,
          price: row.default_price,
          purchase_price: null,
          supplier: "-",
          meta: row.description || "Home visit",
          created_at: row.created_at || row.updated_at || "",
          id: row.id,
          raw: row,
        };
      }),
    ],
    [medicines, tests, packages, equipment, homeCareServices, stockSuppliers],
  );
  const filteredRows = useMemo(
    () =>
      rows.filter((row: any) => {
        if (filters.type !== "all" && row.type !== filters.type) return false;
        if (
          filters.labOnly === "lab" &&
          !["lab_test", "lab_package"].includes(row.type)
        )
          return false;
        if (filters.priceBand === "priced" && Number(row.price || 0) <= 0)
          return false;
        if (filters.priceBand === "free" && Number(row.price || 0) > 0)
          return false;
        const query = String(filters.query || "")
          .trim()
          .toLowerCase();
        if (
          query &&
          !`${row.kind} ${row.name} ${row.code} ${row.meta} ${row.id}`
            .toLowerCase()
            .includes(query)
        )
          return false;
        return true;
      }),
    [rows, filters],
  );
  const sortedRows = useMemo(() => {
    const valueFor = (row: any) => {
      if (filters.sortBy === "latest") return row.created_at || row.id || "";
      if (filters.sortBy === "type") return row.kind || "";
      if (filters.sortBy === "code") return row.code || "";
      if (filters.sortBy === "price") return Number(row.price ?? -1);
      if (filters.sortBy === "mrp") return Number(row.mrp_price ?? -1);
      return row.name || "";
    };
    return [...filteredRows].sort((a: any, b: any) => {
      const left = valueFor(a);
      const right = valueFor(b);
      if (typeof left === "number" && typeof right === "number") {
        return left - right;
      }
      const result = String(left).localeCompare(String(right));
      return filters.sortBy === "latest" ? -result : result;
    });
  }, [filteredRows, filters.sortBy]);

  useEffect(() => {
    if (loadError) setMessage(loadError);
  }, [loadError]);

  function setField(key: string, value: any) {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  }

  function changeItemType(nextType: string) {
    if (
      editing &&
      homeServiceTypes.includes(type) &&
      homeServiceTypes.includes(nextType)
    ) {
      setType(nextType);
      setForm((prev: any) => ({
        ...prev,
        code: generatedItemCode(nextType, prev.name),
      }));
      return;
    }
    setType(nextType);
    setEditing(null);
    setPackageTestIds([]);
    resetItemForm(nextType);
  }

  function resetItemForm(nextType = type) {
    setForm(createEmptyForm(nextType));
    setPackageTestIds([]);
  }

  const { handleItemSubmit, confirmDelete } = useItemsActions({
    apiSession,
    type,
    editing,
    rows,
    packageTestIds,
    setEditing,
    setBusy,
    setMessage,
    setConfirmAction,
    confirmAction,
    resetItemForm,
    load,
  });

  function startEdit(row: any) {
    const raw = row.raw;
    setEditing(row);
    setType(row.type);
    if (row.type === "lab_package") {
      setPackageTestIds(raw.test_ids || []);
    } else {
      setPackageTestIds([]);
    }
  }

  function cancelEdit() {
    setEditing(null);
    setPackageTestIds([]);
    resetItemForm(type);
  }

  function deleteItem(row: any) {
    setConfirmAction({
      kind: "delete",
      entity: "item",
      row,
    });
  }

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pagedRows = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6 scroll-mt-24" ref={containerRef}>
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <h3 className="card-title font-bold">Items</h3>
            <p className="card-desc text-slate-500">
              ERP-style item master for medicines, lab tests, Service,
              physiotherapy equipment, and home care / visit services.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={load} />
            <Badge tone="blue" className="normal-badge">
              {sortedRows.length} items
            </Badge>
          </div>
        </div>
        <StatusToast message={message} onClose={() => setMessage("")} />
        <ItemForm
          type={type}
          initialData={editing?.raw}
          stockSuppliers={stockSuppliers}
          busy={busy === "save"}
          onSubmit={handleItemSubmit}
          onCancel={cancelEdit}
          editing={editing}
          onTypeChange={changeItemType}
        />
      </Card>
      <Card>
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="card-title font-bold">Item List</h3>
            <p className="card-desc text-slate-500">
              Configure items used across healthcare services
            </p>
          </div>
          <div className="grid w-full gap-3 md:grid-cols-2 xl:grid-cols-4">
            <FormField label="Search">
              <Input
                value={filters.query}
                onChange={(event: any) =>
                  setFiltersAndReset({
                    ...filters,
                    query: event.target.value,
                  })
                }
                placeholder="Name, code, type"
              />
            </FormField>
            <FormField label="Type">
              <SearchableSelect
                value={filters.type}
                onChange={(v) => setFiltersAndReset({ ...filters, type: v })}
                searchable={false}
                options={[
                  { value: "all", label: "All item types" },
                  ...itemTypes.map(([value, label]) => ({
                    value,
                    label,
                  })),
                ]}
              />
            </FormField>
            <FormField label="Sort By">
              <SearchableSelect
                value={filters.sortBy}
                onChange={(v) => setFiltersAndReset({ ...filters, sortBy: v })}
                searchable={false}
                options={sort_type_options}
              />
            </FormField>
            <FormField label="Price">
              <SearchableSelect
                value={filters.priceBand}
                onChange={(v) =>
                  setFiltersAndReset({ ...filters, priceBand: v })
                }
                searchable={false}
                options={price_options}
              />
            </FormField>
          </div>
        </div>
        <div className="mt-4 overflow-auto rounded-2xl border">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 ">Type</th>
                <th>Item</th>
                <th>Supplier</th>
                <th>MRP</th>
                <th>Purchase</th>
                <th>Sale Price</th>
                <th className="pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && (
                <tr>
                  <td colSpan={9} className="p-0">
                    <TableSkeleton />
                  </td>
                </tr>
              )}
              {!loading && sortedRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-4 text-slate-500">
                    No items match your filter.
                  </td>
                </tr>
              )}
              {!loading && pagedRows.map((row: any) => (
                <tr key={`${row.kind}-${row.id}`}>
                  <td className="px-4 py-3">
                    <p className="text-xs font-bold">
                      {humanizeOptionLabel(row.kind)}
                    </p>
                  </td>
                  <td className="text-xs">
                    <b>{row.name}</b>
                  </td>
                  <td className="text-xs">{row.supplier}</td>
                  <td className="text-xs">
                    {row.mrp_price === null ? "-" : `₹${row.mrp_price || 0}`}
                  </td>
                  <td className="text-xs">
                    {row.purchase_price === null
                      ? "-"
                      : `₹${row.purchase_price || 0}`}
                  </td>

                  <td className="text-xs text-center pr-2">
                    {row.price === null ? "-" : `₹${row.price}`}
                  </td>
                  <td className="pr-4">
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
                            label:
                              busy === `delete-${row.id}`
                                ? "Deleting..."
                                : "Delete",
                            onClick: () => deleteItem(row),
                            disabled: busy === `delete-${row.id}`,
                            danger: true,
                          },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {confirmAction && (
            <ConfirmModal
              action={confirmAction}
              busy={busy === `delete-${confirmAction.row.id}`}
              onCancel={() => setConfirmAction(null)}
              onConfirm={confirmDelete}
            />
          )}
        </div>
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
          <span className="text-slate-500">
            Page {page} of {totalPages} · {sortedRows.length} items
          </span>
          <div className="flex gap-2">
            <ActionButton
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </ActionButton>
            <ActionButton
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
            </ActionButton>
          </div>
        </div>
      </Card>
    </div>
  );
}
