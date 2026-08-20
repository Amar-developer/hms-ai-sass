"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionButton,
  Card,
  RefreshButton,
  StatusToast,
} from "@/app/components/common/ui";
import { NumberField, SelectField } from "@/app/components/FormElements";
import {
  homeServiceTypes,
  modalities,
  serviceItemTypes,
} from "@/features/items/constants";
import { ItemForm } from "@/features/items/forms/ItemForms";
import { ItemFormValues, itemSchema } from "@/features/items/items.schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";
import { generatedItemCode } from "./helpers";
import { useItemsActions, useItemsData } from "./api";
import { AdaptiveFilterTrigger } from "@/app/components/common/AdaptiveFilterTrigger";
import { AdaptiveSortTrigger } from "@/app/components/common/AdaptiveSortTrigger";
import { AdaptiveResultCount } from "@/app/components/common/AdaptiveResultCount";
import { BreadcrumbSlot } from "@/features/shell/AppShell";
import { DataTable } from "@/app/components/common/DataTable";
import { Pagination } from "@/app/components/common/Pagination";
import { getItemsColumns } from "./Column";
import { getItemsTableSchema, getItemsQueryFields } from "./filterSchema";
import { sortRows } from "@/utils/sortRows";
import { applyQueryFilters, type QueryFilterRow } from "@/utils/queryFilter";
import type { SortState } from "@/utils/types";

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
    labOnly: "all",
  });
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState | null>({
    key: "name",
    dir: "asc",
  });
  const [queryFilters, setQueryFilters] = useState<QueryFilterRow[]>([]);
  const [page, setPage] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 10;
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
      ...homeCareServices
        .filter((row: any) => String(row.code || "").startsWith("HV-"))
        .map((row: any) => {
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
        if (
          filters.labOnly === "lab" &&
          !["lab_test", "lab_package"].includes(row.type)
        )
          return false;
        const trimmedQuery = query.trim().toLowerCase();
        if (
          trimmedQuery &&
          !`${row.kind} ${row.name} ${row.code} ${row.meta} ${row.id}`
            .toLowerCase()
            .includes(trimmedQuery)
        )
          return false;
        return true;
      }),
    [rows, filters, query],
  );
  const itemsQueryFields = useMemo(
    () => getItemsQueryFields({ rows }),
    [rows],
  );
  const sortedRows = useMemo(
    () =>
      sortRows(
        applyQueryFilters(filteredRows, itemsQueryFields, queryFilters),
        sort,
        (row, key) => {
          if (key === "type") return row.kind || "";
          if (key === "mrp_price") return Number(row.mrp_price ?? -1);
          if (key === "price") return Number(row.price ?? -1);
          return row[key];
        },
      ),
    [filteredRows, itemsQueryFields, queryFilters, sort],
  );

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

  function updateFilter(key: string, value: string) {
    setFilters((prev: any) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  const itemsSchema = getItemsTableSchema();

  const filterValues = {};

  function resetItemFilters() {
    setFilters({ labOnly: "all" });
    setSort({ key: "name", dir: "asc" });
    setPage(1);
  }

  const itemColumns = getItemsColumns({
    deleteItem,
    startEdit,
    containerRef,
    busy,
  });

  return (
    <div className="space-y-6 scroll-mt-24" ref={containerRef}>
      <BreadcrumbSlot>
        <div className="flex items-center gap-2">
          <AdaptiveResultCount
            shown={pagedRows.length}
            total={sortedRows.length}
            noun="items"
          />
          <RefreshButton
            onRefresh={load}
            className="h-auto rounded-md px-2.5 py-1 text-[11px]"
          />
          <AdaptiveFilterTrigger
            schema={itemsSchema}
            query={query}
            setQuery={(value: string) => {
              setQuery(value);
              setPage(1);
            }}
            filterValues={filterValues}
            onFilterChange={updateFilter}
            sort={sort}
            onSortChange={setSort}
            showSort={false}
            onReset={resetItemFilters}
            queryFields={itemsQueryFields}
            queryFilters={queryFilters}
            onQueryFiltersChange={setQueryFilters}
          />
          <AdaptiveSortTrigger
            fields={itemsSchema.sortFields}
            sort={sort}
            onSortChange={setSort}
          />
        </div>
      </BreadcrumbSlot>
      <Card className="p-0">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <h3 className="card-title font-bold">Items</h3>
            <p className="card-desc text-slate-500">
              ERP-style item master for medicines, lab tests, Service,
              physiotherapy equipment, and home care / visit services.
            </p>
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

      {/* Item List */}
      <Card className="p-0 shadow-none">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="card-title font-bold">Item List</h3>
            <p className="card-desc text-slate-500">
              Configure items used across healthcare services
            </p>
          </div>
        </div>
        <div className="mt-4">
          <DataTable
            columns={itemColumns}
            data={pagedRows}
            loading={loading}
            emptyMessage="No items match your filter."
            sort={sort ?? undefined}
            onSortChange={setSort}
          />
          {confirmAction && (
            <ConfirmModal
              action={confirmAction}
              busy={busy === `delete-${confirmAction.row.id}`}
              onCancel={() => setConfirmAction(null)}
              onConfirm={confirmDelete}
            />
          )}
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={sortedRows.length}
          onPage={setPage}
        />
      </Card>
    </div>
  );
}
