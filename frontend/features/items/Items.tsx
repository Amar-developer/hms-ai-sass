"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Plus } from "lucide-react";
import { Card, RefreshButton, StatusToast } from "@/app/components/common/ui";
import { homeServiceTypes, serviceItemTypes } from "@/features/items/constants";
import { ItemForm } from "@/features/items/forms/ItemForms";
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
import { newSegment, editSegment } from "@/lib/routeSlugs";
import {
  applyQueryFilters,
  type QueryFieldOption,
  type QueryFilterRow,
} from "@/utils/queryFilter";
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

function mergeFilterOptions(
  ...sources: Record<string, QueryFieldOption[]>[]
): Record<string, QueryFieldOption[]> {
  const merged: Record<string, QueryFieldOption[]> = {};
  sources.forEach((source) => {
    Object.entries(source || {}).forEach(([key, options]) => {
      const seen = new Set((merged[key] || []).map((option) => option.value));
      const next = [...(merged[key] || [])];
      options.forEach((option) => {
        if (seen.has(option.value)) return;
        seen.add(option.value);
        next.push(option);
      });
      merged[key] = next;
    });
  });
  return merged;
}

export function Items({
  apiSession,
  branchId,
  view = "list",
  selectedId = "",
  itemType = "medicine",
}: any) {
  const router = useRouter();
  const [type, setType] = useState(itemType);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const {
    medicines,
    tests,
    packages,
    equipment,
    homeCareServices,
    stockSuppliers,
    medicineFilterOptions,
    labTestFilterOptions,
    labPackageFilterOptions,
    physioEquipmentFilterOptions,
    homeCareServiceFilterOptions,
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
    key: "updated_at",
    dir: "desc",
  });
  const [queryFilters, setQueryFilters] = useState<QueryFilterRow[]>([]);
  const [page, setPage] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 10;
  const [form, setForm] = useState<any>(() => createEmptyForm(itemType));
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
        supplier_id: row.supplier_id || "",
        supplier: supplierName(row.supplier_id),
        branch_id: row.branch_id || "",
        department: "",
        sample_type: "",
        generic_name: row.generic_name || "",
        form: row.form || "",
        manufacturer: row.manufacturer || "",
        modality_type: "",
        is_portable: "",
        meta: row.generic_name || row.form || row.manufacturer || "-",
        created_by_user_id: row.created_by_user_id || "",
        updated_by_user_id: row.updated_by_user_id || "",
        created_at: row.created_at || row.updated_at || "",
        updated_at: row.updated_at || row.created_at || "",
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
        supplier_id: row.supplier_id || "",
        supplier: supplierName(row.supplier_id),
        branch_id: row.branch_id || "",
        department: row.department || "",
        sample_type: row.sample_type || "",
        modality_type: "",
        is_portable: "",
        meta: row.sample_type || "-",
        created_by_user_id: row.created_by_user_id || "",
        updated_by_user_id: row.updated_by_user_id || "",
        created_at: row.created_at || row.updated_at || "",
        updated_at: row.updated_at || row.created_at || "",
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
        supplier_id: "",
        supplier: "-",
        branch_id: row.branch_id || "",
        department: "",
        sample_type: "",
        modality_type: "",
        is_portable: "",
        meta: row.description || `${row.test_ids?.length || 0} tests`,
        created_by_user_id: row.created_by_user_id || "",
        updated_by_user_id: row.updated_by_user_id || "",
        created_at: row.created_at || row.updated_at || "",
        updated_at: row.updated_at || row.created_at || "",
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
        supplier_id: row.supplier_id || "",
        supplier: supplierName(row.supplier_id),
        branch_id: row.branch_id || "",
        department: "",
        sample_type: "",
        modality_type: row.modality_type || "",
        is_portable: String(Boolean(row.is_portable)),
        manufacturer: row.manufacturer || "",
        meta: `${row.modality_type} · ${row.is_portable ? "Portable" : "Fixed"}`,
        created_by_user_id: row.created_by_user_id || "",
        updated_by_user_id: row.updated_by_user_id || "",
        created_at: row.created_at || row.updated_at || "",
        updated_at: row.updated_at || row.created_at || "",
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
            supplier_id: "",
            supplier: "-",
            branch_id: row.branch_id || "",
            department: "",
            sample_type: "",
            modality_type: "",
            is_portable: "",
            meta: row.description || "Home visit",
            created_by_user_id: row.created_by_user_id || "",
            updated_by_user_id: row.updated_by_user_id || "",
            created_at: row.created_at || row.updated_at || "",
            updated_at: row.updated_at || row.created_at || "",
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
    () =>
      getItemsQueryFields({
        rows,
        filterOptions: mergeFilterOptions(
          medicineFilterOptions,
          labTestFilterOptions,
          labPackageFilterOptions,
          physioEquipmentFilterOptions,
          homeCareServiceFilterOptions,
        ),
      }),
    [
      rows,
      medicineFilterOptions,
      labTestFilterOptions,
      labPackageFilterOptions,
      physioEquipmentFilterOptions,
      homeCareServiceFilterOptions,
    ],
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

  // The route is the source of truth for which type is being created — this
  // component instance isn't remounted on navigation (same [[...segments]]
  // page), so `type`/`form` local state needs to be re-seeded whenever the
  // URL's type segment changes, not just on first mount.
  useEffect(() => {
    if (view !== "create") return;
    setType(itemType);
    setForm(createEmptyForm(itemType));
    setPackageTestIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, itemType]);

  function setField(key: string, value: any) {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  }

  function open(nextView: string, id = "", nextType = "medicine") {
    const path =
      nextView === "create"
        ? `/clinic/items/${nextType}/${newSegment("item")}`
        : nextView === "edit" && id
          ? `/clinic/items/${id}/${editSegment("item")}`
          : "/clinic/items";
    router.push(path);
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
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
    setPackageTestIds([]);
    resetItemForm(nextType);
    if (view === "create") router.replace(`/clinic/items/${nextType}/${newSegment("item")}`);
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

  async function submitItem(data: any) {
    const ok = await handleItemSubmit(data);
    if (ok) open("list");
    return ok;
  }

  function startEdit(row: any) {
    open("edit", row.id);
  }

  function cancelEdit() {
    open("list");
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

  // Route-driven create/edit, mirroring Doctors.tsx: these two views render
  // only the form, no breadcrumb/filter bar/table alongside it.
  if (view === "create" || view === "edit") {
    const editingRow =
      view === "edit" ? rows.find((row: any) => row.id === selectedId) : null;

    if (view === "edit" && !loading && !editingRow) {
      // Bookmarked/direct edit link no longer resolves to a real item.
      if (typeof window !== "undefined") open("list");
      return null;
    }

    return (
      <div className="space-y-4">
        <StatusToast message={message} onClose={() => setMessage("")} />
        <button
          type="button"
          onClick={() => open("list")}
          className="close-button font-bold"
        >
          Back to Items
        </button>
        <Card className="p-0">
          <div>
            <h3 className="card-title font-bold">
              {view === "edit" ? "Edit Item" : "Create Item"}
            </h3>
            <p className="card-desc text-slate-500">
              ERP-style item master for medicines, lab tests, Service,
              physiotherapy equipment, and home care / visit services.
            </p>
          </div>
          <ItemForm
            type={view === "edit" ? editingRow.type : type}
            initialData={view === "edit" ? editingRow.raw : undefined}
            stockSuppliers={stockSuppliers}
            busy={busy === "save"}
            onSubmit={submitItem}
            onCancel={cancelEdit}
            editing={view === "edit" ? editingRow : null}
            onTypeChange={changeItemType}
          />
        </Card>
        {confirmAction && (
          <ConfirmModal
            action={confirmAction}
            busy={busy === `delete-${confirmAction.row.id}`}
            onCancel={() => setConfirmAction(null)}
            onConfirm={confirmDelete}
          />
        )}
      </div>
    );
  }

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

      {/* Item List */}
      <Card className="p-0 shadow-none">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <h3 className="card-title font-bold">Item List</h3>
            <p className="card-desc text-slate-500">
              Configure items used across healthcare services
            </p>
          </div>
          <button
            type="button"
            onClick={() => open("create", "", "medicine")}
            className="primary-action gap-2 px-4 py-3 text-xs"
          >
            <Plus size={16} />
            Create Item
          </button>
        </div>
        <StatusToast message={message} onClose={() => setMessage("")} />
        <div className="mt-4">
          <DataTable
            columns={itemColumns}
            data={pagedRows}
            loading={loading}
            emptyMessage="No items match your filter."
            emptyDescription="Medicines, tests, services, and equipment added here will show up in this list."
            emptyIcon={Package}
            minBodyHeight="220px"
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
