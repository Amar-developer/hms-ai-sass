"use client";

import { useEffect, useMemo, useState } from "react";
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
import { apiFetch } from "@/lib/api";
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
  serviceItemTypes,
} from "@/features/items/constants";
import { ItemForm } from "@/features/items/forms/ItemForms";
import { ItemFormValues, itemSchema } from "@/features/items/items.schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

function generatedItemCode(type: string, name: string) {
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
  return `${prefixes[type] || "ITM"}-${compactName || "ITEM"}-${Date.now().toString().slice(-5)}`;
}

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
  const [medicines, setMedicines] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [homeCareServices, setHomeCareServices] = useState<any[]>([]);
  const [packageTestIds, setPackageTestIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [filters, setFilters] = useState({
    type: "all",
    query: "",
    labOnly: "all",
    priceBand: "all",
    sortBy: "name",
  });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  function setFiltersAndReset(f: any) {
    setFilters(f);
    setPage(1);
  }
  const [stockSuppliers, setStockSuppliers] = useState<any[]>([]);
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
      ...homeCareServices.map((row: any) => {
        const isHomeVisit = String(row.code || "").startsWith("HV-");
        const rowType = isHomeVisit
          ? "home_visit_service"
          : "home_care_service";
        return {
          type: rowType,
          kind: isHomeVisit ? "Home Visit Service" : "Home Care Service",
          name: row.name,
          code: row.code,
          mrp_price: row.mrp_price || 0,
          price: row.default_price,
          purchase_price: null,
          supplier: "-",
          meta: row.description || (isHomeVisit ? "Home visit" : "Home care"),
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
        const query = filters.query.trim().toLowerCase();
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
    load();
  }, [apiSession?.tenantId, branchId]);

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
    console.log("resetForm");
    setForm(createEmptyForm(nextType));
    setPackageTestIds([]);
  }

  async function load() {
    if (!apiSession) return;
    try {
      const [
        medicineRows,
        testRows,
        packageRows,
        equipmentRows,
        homeCareServiceRows,
        supplierRows,
      ] = await Promise.all([
        apiFetch("/pharmacy/medicines", apiSession).catch(() => []),
        apiFetch("/lab/catalog/tests", apiSession).catch(() => []),
        apiFetch("/lab/catalog/packages", apiSession).catch(() => []),
        apiFetch("/physiotherapy/equipment", apiSession).catch(() => []),
        apiFetch("/home-care/services", apiSession).catch(() => []),
        apiFetch("/pharmacy/suppliers", apiSession).catch(() => []),
      ]);
      setMedicines(medicineRows);
      setTests(testRows);
      setPackages(packageRows);
      setEquipment(equipmentRows);
      setHomeCareServices(homeCareServiceRows);
      setStockSuppliers(supplierRows);
    } catch (err: any) {
      setMessage(err.message || "Could not load items.");
    }
  }

  async function createItem(e: any) {
    e.preventDefault();
    if (!apiSession) return;
    setBusy("save");
    setMessage("");
    try {
      const method = editing ? "PATCH" : "POST";
      const supplierId = form.supplier_id || null;
      const purchasePrice = Number(form.purchase_price || 0);
      const itemCode = editing
        ? type === "physio_equipment"
          ? form.serial_number ||
            form.code ||
            generatedItemCode(type, form.name)
          : form.code || generatedItemCode(type, form.name)
        : generatedItemCode(type, form.name);
      let savedHomeCareService: any = null;
      if (type === "medicine") {
        await apiFetch(
          editing ? `/pharmacy/medicines/${editing.id}` : "/pharmacy/medicines",
          apiSession,
          {
            method,
            body: JSON.stringify({
              branch_id: null,
              code: itemCode,
              name: form.name,
              generic_name: form.generic_name || null,
              form: "Tablet",
              supplier_id: supplierId,
              mrp_price: Number(form.mrp_price || 0),
              purchase_price: purchasePrice,
              default_sale_price: Number(form.price || 0),
              reorder_level: Number(form.reorder_level || 0),
              created_by_user_id: apiSession.user?.id,
              updated_by_user_id: apiSession.user?.id,
            }),
          },
        );
      } else if (type === "lab_test") {
        await apiFetch(
          editing ? `/lab/catalog/tests/${editing.id}` : "/lab/catalog/tests",
          apiSession,
          {
            method,
            body: JSON.stringify({
              branch_id: null,
              code: itemCode,
              name: form.name,
              supplier_id: supplierId,
              mrp_price: Number(form.mrp_price || 0),
              purchase_price: purchasePrice,
              sample_type: form.sample_type || null,
              default_price: Number(form.price || 0),
              created_by_user_id: apiSession.user?.id,
              updated_by_user_id: apiSession.user?.id,
            }),
          },
        );
      } else if (type === "lab_package") {
        await apiFetch(
          editing
            ? `/lab/catalog/packages/${editing.id}`
            : "/lab/catalog/packages",
          apiSession,
          {
            method,
            body: JSON.stringify({
              code: itemCode,
              name: form.name,
              branch_id: null,
              description: form.description || null,
              supplier_id: null,
              mrp_price: Number(form.mrp_price || 0),
              purchase_price: 0,
              package_price: Number(form.price || 0),
              test_ids: packageTestIds,
              created_by_user_id: apiSession.user?.id,
              updated_by_user_id: apiSession.user?.id,
            }),
          },
        );
        setPackageTestIds([]);
      } else if (homeServiceTypes.includes(type)) {
        savedHomeCareService = await apiFetch(
          editing ? `/home-care/services/${editing.id}` : "/home-care/services",
          apiSession,
          {
            method,
            body: JSON.stringify({
              branch_id: null,
              code: itemCode,
              name: form.name,
              description: form.description || null,
              mrp_price: Number(form.mrp_price || 0),
              default_price: Number(form.price || 0),
            }),
          },
        );
      } else {
        await apiFetch(
          editing
            ? `/physiotherapy/equipment/${editing.id}`
            : "/physiotherapy/equipment",
          apiSession,
          {
            method,
            body: JSON.stringify({
              branch_id: null,
              name: form.name,
              modality_type: form.modality_type,
              supplier_id: supplierId,
              mrp_price: Number(form.mrp_price || 0),
              purchase_price: purchasePrice,
              manufacturer: form.manufacturer || null,
              model_number: form.model_number || null,
              serial_number: itemCode,
              is_portable: form.is_portable === "true",
            }),
          },
        );
      }
      const wasEditing = Boolean(editing);
      setEditing(null);
      setPackageTestIds([]);
      resetItemForm(type);
      if (homeServiceTypes.includes(type) && savedHomeCareService) {
        setHomeCareServices((prev: any[]) =>
          wasEditing
            ? prev.map((row) =>
                row.id === savedHomeCareService.id ? savedHomeCareService : row,
              )
            : [savedHomeCareService, ...prev],
        );
        void load();
      } else {
        await load();
      }
      setMessage(wasEditing ? "Item updated." : "Item saved.");
    } catch (err: any) {
      setMessage(err.message || "Could not save item.");
    } finally {
      setBusy("");
    }
  }
  async function handleItemSubmit(data: ItemFormValues) {
    if (!apiSession) return;

    setBusy("save");
    setMessage("");

    try {
      const isEditing = !!editing;
      const method = isEditing ? "PATCH" : "POST";
      const itemCode = isEditing
        ? type === "physio_equipment"
          ? editing.serial_number ||
            editing.code ||
            generatedItemCode(type, data.name)
          : editing.code || generatedItemCode(type, data.name)
        : generatedItemCode(type, data.name);

      let endpoint = "";
      let body: any = { code: itemCode, name: data.name };

      if (type === "medicine") {
        endpoint = isEditing
          ? `/pharmacy/medicines/${editing.id}`
          : "/pharmacy/medicines";
        body = {
          ...body,
          generic_name: data.generic_name || null,
          supplier_id: data.supplier_id || null,
          mrp_price: Number(data.mrp_price),
          purchase_price: Number(data.purchase_price || 0),
          default_sale_price: Number(data.price),
          reorder_level: Number(data.reorder_level || 0),
        };
      } else if (type === "lab_test") {
        endpoint = isEditing
          ? `/lab/catalog/tests/${editing.id}`
          : "/lab/catalog/tests";
        body = {
          ...body,
          supplier_id: data.supplier_id || null,
          mrp_price: Number(data.mrp_price),
          purchase_price: Number(data.purchase_price || 0),
          default_price: Number(data.price),
          sample_type: data.sample_type || null,
        };
      } else if (homeServiceTypes.includes(type)) {
        endpoint = isEditing
          ? `/home-care/services/${editing.id}`
          : "/home-care/services";
        body = {
          ...body,
          description: data.description || null,
          mrp_price: Number(data.mrp_price),
          default_price: Number(data.price),
        };
      } else if (type === "physio_equipment") {
        endpoint = isEditing
          ? `/physiotherapy/equipment/${editing.id}`
          : "/physiotherapy/equipment";
        body = {
          ...body,
          modality_type: data.modality_type,
          supplier_id: data.supplier_id || null,
          mrp_price: Number(data.mrp_price),
          purchase_price: Number(data.purchase_price || 0),
          manufacturer: data.manufacturer || null,
          model_number: data.model_number || null,
          serial_number: itemCode,
          is_portable: data.is_portable === "true",
        };
      }

      await apiFetch(endpoint, apiSession, {
        method,
        body: JSON.stringify(body),
      });

      // ✅ Refresh data
      await load();

      // ✅ Reset form + editing state
      setEditing(null);
      resetItemForm(type); // This should clear the form

      setMessage(
        isEditing ? "Item updated successfully." : "Item created successfully.",
      );
      return true;
    } catch (err: any) {
      console.error(err);
      setMessage(err.message || "Failed to save item.");
      return false;
    } finally {
      setBusy("");
    }
  }
  function startEdit(row: any) {
    const raw = row.raw;
    setEditing(row);
    setType(row.type);
    if (row.type === "medicine")
      setForm({
        ...form,
        code: raw.code,
        name: raw.name,
        generic_name: raw.generic_name || "",
        mrp_price: String(raw.mrp_price || 0),
        price: String(raw.default_sale_price || 0),
        purchase_price: String(raw.purchase_price || 0),
        supplier_id: raw.supplier_id || "",
        reorder_level: String(raw.reorder_level || 0),
        branch_scope: raw.branch_id ? "branch" : "tenant",
      });
    else if (row.type === "lab_test")
      setForm({
        ...form,
        code: raw.code,
        name: raw.name,
        mrp_price: String(raw.mrp_price || 0),
        price: String(raw.default_price || 0),
        purchase_price: String(raw.purchase_price || 0),
        supplier_id: raw.supplier_id || "",
        sample_type: raw.sample_type || "",
        branch_scope: raw.branch_id ? "branch" : "tenant",
      });
    else if (row.type === "lab_package") {
      setForm({
        ...form,
        code: raw.code,
        name: raw.name,
        mrp_price: String(raw.mrp_price || 0),
        price: String(raw.package_price || 0),
        purchase_price: "",
        supplier_id: "",
        description: raw.description || "",
        branch_scope: raw.branch_id ? "branch" : "tenant",
      });
      setPackageTestIds(raw.test_ids || []);
    } else if (homeServiceTypes.includes(row.type))
      setForm({
        ...form,
        code: raw.code,
        name: raw.name,
        mrp_price: String(raw.mrp_price || 0),
        price: String(raw.default_price || 0),
        description: raw.description || "",
        branch_scope: raw.branch_id ? "branch" : "tenant",
      });
    else
      setForm({
        ...form,
        code: raw.serial_number || "",
        name: raw.name,
        modality_type: raw.modality_type,
        mrp_price: String(raw.mrp_price || 0),
        purchase_price: String(raw.purchase_price || 0),
        supplier_id: raw.supplier_id || "",
        manufacturer: raw.manufacturer || "",
        model_number: raw.model_number || "",
        serial_number: raw.serial_number || "",
        is_portable: String(Boolean(raw.is_portable)),
        branch_scope: raw.branch_id ? "branch" : "tenant",
      });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditing(null);
    setPackageTestIds([]);
    resetItemForm(type);
  }

  async function deleteItem(row: any) {
    if (!apiSession || !confirm(`Delete ${row.name}?`)) return;
    setBusy(`delete-${row.id}`);
    setMessage("");
    const path =
      row.type === "medicine"
        ? `/pharmacy/medicines/${row.id}`
        : row.type === "lab_test"
          ? `/lab/catalog/tests/${row.id}`
          : row.type === "lab_package"
            ? `/lab/catalog/packages/${row.id}`
            : homeServiceTypes.includes(row.type)
              ? `/home-care/services/${row.id}`
              : `/physiotherapy/equipment/${row.id}`;
    try {
      await apiFetch(path, apiSession, { method: "DELETE" });
      await load();
      setMessage("Item deleted.");
    } catch (err: any) {
      setMessage(err.message || "Could not delete item.");
    } finally {
      setBusy("");
    }
  }

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pagedRows = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
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
          initialData={editing}
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
                onChange={(v) => setFiltersAndReset({ ...filters, query: v })}
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
                options={[
                  { value: "name", label: "Name" },
                  { value: "latest", label: "Latest" },
                  { value: "type", label: "Type" },
                  { value: "code", label: "Code" },
                  { value: "mrp", label: "MRP" },
                  { value: "price", label: "Sale Price" },
                ]}
              />
            </FormField>
            <FormField label="Price">
              <SearchableSelect
                value={filters.priceBand}
                onChange={(v) =>
                  setFiltersAndReset({ ...filters, priceBand: v })
                }
                searchable={false}
                options={[
                  { value: "all", label: "All prices" },
                  { value: "priced", label: "Priced only" },
                  { value: "free", label: "Free / zero" },
                ]}
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
              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-4 text-slate-500">
                    No items match your filter.
                  </td>
                </tr>
              )}
              {pagedRows.map((row: any) => (
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
                    <ActionGroup className="justify-end">
                      <ActionButton onClick={() => startEdit(row)}>
                        Edit
                      </ActionButton>
                      <ActionButton
                        tone="danger"
                        disabled={busy === `delete-${row.id}`}
                        onClick={() => deleteItem(row)}
                      >
                        {busy === `delete-${row.id}` ? "Deleting..." : "Delete"}
                      </ActionButton>
                    </ActionGroup>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
