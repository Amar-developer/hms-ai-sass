"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionButton,
  ActionGroup,
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
} from "@/components/ui";
import { apiFetch } from "@/lib/api";

const itemTypes = [
  ["medicine", "Medicine"],
  ["lab_test", "Lab Test"],
  ["lab_package", "Lab Package"],
  ["physio_equipment", "Physiotherapy Equipment"],
];

const modalities = [
  ["ift", "IFT / Interferential Therapy"],
  ["ultrasound", "Ultrasound Therapy"],
  ["tens", "TENS Pain Relief"],
  ["laser", "Laser Therapy"],
  ["swd", "Shortwave Diathermy"],
  ["cpm", "CPM Joint Rehabilitation"],
  ["muscle_stimulator", "Muscle Stimulator / EMS"],
  ["exercise", "Therapeutic Exercise"],
];

export function Items({ apiSession, branchId }: any) {
  const [type, setType] = useState("medicine");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [medicines, setMedicines] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [packageTestIds, setPackageTestIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [filters, setFilters] = useState({
    type: "all",
    query: "",
    labOnly: "all",
  });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  function setFiltersAndReset(f: any) {
    setFilters(f);
    setPage(1);
  }
  const [stockBatches, setStockBatches] = useState<any[]>([]);
  const [stockSuppliers, setStockSuppliers] = useState<any[]>([]);
  const [stockLow, setStockLow] = useState<any[]>([]);
  const [stockMedId, setStockMedId] = useState("");
  const [stockBatchId, setStockBatchId] = useState("");
  const [suppNameInput, setSuppNameInput] = useState("Demo Pharma Supplier");
  const [poId, setPoId] = useState("PO-001");
  const [poDate, setPoDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [poQty, setPoQty] = useState("50");
  const [poHdrDisc, setPoHdrDisc] = useState("0");
  const [poLineDisc, setPoLineDisc] = useState("0");
  const [poCgst, setPoCgst] = useState("6");
  const [poSgst, setPoSgst] = useState("6");
  const [retQty, setRetQty] = useState("1");
  const [form, setForm] = useState<any>({
    code: "PCM500",
    name: "Paracetamol 500mg",
    generic_name: "Paracetamol",
    price: "5",
    purchase_price: "0",
    supplier_id: "",
    reorder_level: "10",
    sample_type: "Blood",
    modality_type: "ift",
    manufacturer: "",
    model_number: "",
    serial_number: "",
    is_portable: "false",
    branch_scope: "branch",
  });

  const supplierName = (id: string | null | undefined) =>
    stockSuppliers.find((supplier: any) => supplier.id === id)?.name || "-";
  const rows = useMemo(
    () => [
      ...medicines.map((row: any) => ({
        type: "medicine",
        kind: "Medicine",
        name: row.name,
        code: row.code,
        price: row.default_sale_price,
        purchase_price: row.purchase_price || 0,
        supplier: supplierName(row.supplier_id),
        meta: row.generic_name || row.form || "-",
        id: row.id,
        raw: row,
      })),
      ...tests.map((row: any) => ({
        type: "lab_test",
        kind: "Lab Test",
        name: row.name,
        code: row.code,
        price: row.default_price,
        purchase_price: row.purchase_price || 0,
        supplier: supplierName(row.supplier_id),
        meta: row.sample_type || "-",
        id: row.id,
        raw: row,
      })),
      ...packages.map((row: any) => ({
        type: "lab_package",
        kind: "Lab Package",
        name: row.name,
        code: row.code,
        price: row.package_price,
        purchase_price: row.purchase_price || 0,
        supplier: supplierName(row.supplier_id),
        meta: `${row.test_ids?.length || 0} tests`,
        id: row.id,
        raw: row,
      })),
      ...equipment.map((row: any) => ({
        type: "physio_equipment",
        kind: "Physio Equipment",
        name: row.name,
        code: row.serial_number || row.id,
        price: null,
        purchase_price: row.purchase_price || 0,
        supplier: supplierName(row.supplier_id),
        meta: `${row.modality_type} · ${row.is_portable ? "Portable" : "Fixed"}`,
        id: row.id,
        raw: row,
      })),
    ],
    [medicines, tests, packages, equipment, stockSuppliers],
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

  useEffect(() => {
    load();
  }, [apiSession?.token, apiSession?.tenantId, branchId]);
  useEffect(() => {
    if (!stockMedId && medicines[0]?.id) setStockMedId(medicines[0].id);
  }, [medicines, stockMedId]);
  useEffect(() => {
    const b = stockBatches.find((b: any) => b.medicine_id === stockMedId);
    setStockBatchId(b?.id || "");
  }, [stockMedId, stockBatches]);

  function setField(key: string, value: any) {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  }

  function setCodeOrSerial(value: any) {
    setForm((prev: any) => ({
      ...prev,
      code: value,
      serial_number: type === "physio_equipment" ? value : prev.serial_number,
    }));
  }

  async function load() {
    if (!apiSession) return;
    try {
      const [
        medicineRows,
        testRows,
        packageRows,
        equipmentRows,
        batchRows,
        supplierRows,
        lowRows,
      ] = await Promise.all([
        apiFetch("/pharmacy/medicines", apiSession).catch(() => []),
        apiFetch("/lab/catalog/tests", apiSession).catch(() => []),
        apiFetch("/lab/catalog/packages", apiSession).catch(() => []),
        apiFetch("/physiotherapy/equipment", apiSession).catch(() => []),
        apiFetch("/pharmacy/batches", apiSession).catch(() => []),
        apiFetch("/pharmacy/suppliers", apiSession).catch(() => []),
        apiFetch(`/pharmacy/low-stock?branch_id=${branchId}`, apiSession).catch(
          () => [],
        ),
      ]);
      setMedicines(medicineRows);
      setTests(testRows);
      setPackages(packageRows);
      setEquipment(equipmentRows);
      setStockBatches(batchRows);
      setStockSuppliers(supplierRows);
      setStockLow(lowRows);
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
      if (type === "medicine") {
        await apiFetch(
          editing ? `/pharmacy/medicines/${editing.id}` : "/pharmacy/medicines",
          apiSession,
          {
            method,
            body: JSON.stringify({
              branch_id: branchId,
              code: form.code,
              name: form.name,
              generic_name: form.generic_name || null,
              form: "Tablet",
              supplier_id: supplierId,
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
              branch_id: branchId,
              code: form.code,
              name: form.name,
              supplier_id: supplierId,
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
              code: form.code,
              name: form.name,
              supplier_id: supplierId,
              purchase_price: purchasePrice,
              package_price: Number(form.price || 0),
              test_ids: packageTestIds,
              created_by_user_id: apiSession.user?.id,
              updated_by_user_id: apiSession.user?.id,
            }),
          },
        );
        setPackageTestIds([]);
      } else {
        await apiFetch(
          editing
            ? `/physiotherapy/equipment/${editing.id}`
            : "/physiotherapy/equipment",
          apiSession,
          {
            method,
            body: JSON.stringify({
              branch_id: form.branch_scope === "branch" ? branchId : null,
              name: form.name,
              modality_type: form.modality_type,
              supplier_id: supplierId,
              purchase_price: purchasePrice,
              manufacturer: form.manufacturer || null,
              model_number: form.model_number || null,
              serial_number: form.serial_number || form.code || null,
              is_portable: form.is_portable === "true",
            }),
          },
        );
      }
      setEditing(null);
      await load();
      setMessage(editing ? "Item updated." : "Item saved.");
    } catch (err: any) {
      setMessage(err.message || "Could not save item.");
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
        price: String(raw.default_sale_price || 0),
        purchase_price: String(raw.purchase_price || 0),
        supplier_id: raw.supplier_id || "",
        reorder_level: String(raw.reorder_level || 0),
      });
    else if (row.type === "lab_test")
      setForm({
        ...form,
        code: raw.code,
        name: raw.name,
        price: String(raw.default_price || 0),
        purchase_price: String(raw.purchase_price || 0),
        supplier_id: raw.supplier_id || "",
        sample_type: raw.sample_type || "",
      });
    else if (row.type === "lab_package") {
      setForm({
        ...form,
        code: raw.code,
        name: raw.name,
        price: String(raw.package_price || 0),
        purchase_price: String(raw.purchase_price || 0),
        supplier_id: raw.supplier_id || "",
      });
      setPackageTestIds(raw.test_ids || []);
    } else
      setForm({
        ...form,
        code: raw.serial_number || "",
        name: raw.name,
        modality_type: raw.modality_type,
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
  }

  async function createSupplier() {
    if (!apiSession) return;
    setBusy("supplier");
    setMessage("");
    try {
      await apiFetch("/pharmacy/suppliers", apiSession, {
        method: "POST",
        body: JSON.stringify({
          name: suppNameInput,
          created_by_user_id: apiSession.user?.id,
        }),
      });
      await load();
      setMessage("Supplier created.");
    } catch (err: any) {
      setMessage(err.message || "Could not create supplier.");
    } finally {
      setBusy("");
    }
  }

  async function createPurchase() {
    if (!apiSession || !stockMedId) return;
    setBusy("purchase");
    setMessage("");
    try {
      const med = medicines.find((m: any) => m.id === stockMedId);
      await apiFetch("/pharmacy/purchases", apiSession, {
        method: "POST",
        body: JSON.stringify({
          branch_id: branchId,
          supplier_id: stockSuppliers[0]?.id || null,
          purchase_order_id: poId,
          invoice_number: `PINV-${Date.now().toString().slice(-5)}`,
          purchase_date: new Date(`${poDate}T00:00:00`).toISOString(),
          discount_percentage: Number(poHdrDisc || 0),
          items: [
            {
              medicine_id: stockMedId,
              batch_number: `B-${Date.now().toString().slice(-4)}`,
              quantity: Number(poQty || 0),
              cost_price: Math.max(1, Number(med?.default_sale_price || 0) - 2),
              sale_price: Number(med?.default_sale_price || 0),
              discount_percentage: Number(poLineDisc || 0),
              cgst_percentage: Number(poCgst || 0),
              sgst_percentage: Number(poSgst || 0),
            },
          ],
          purchased_by_user_id: apiSession.user?.id,
        }),
      });
      await load();
      setMessage("Purchase added and stock ledger updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not create purchase.");
    } finally {
      setBusy("");
    }
  }

  async function returnExpiredStock() {
    if (!apiSession || !stockMedId || !stockBatchId) return;
    setBusy("return");
    setMessage("");
    try {
      const batch = stockBatches.find((b: any) => b.id === stockBatchId);
      await apiFetch("/pharmacy/returns", apiSession, {
        method: "POST",
        body: JSON.stringify({
          branch_id: branchId,
          supplier_id: stockSuppliers[0]?.id || null,
          purchase_id: batch?.purchase_id || null,
          reason: "Expired medicine returned to supplier",
          items: [
            {
              medicine_id: stockMedId,
              batch_id: stockBatchId,
              quantity: Number(retQty || 1),
              amount: Number(retQty || 1) * Number(batch?.cost_price || 0),
            },
          ],
          returned_by_user_id: apiSession.user?.id,
        }),
      });
      await load();
      setMessage("Expired stock returned and ledger updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not return expired stock.");
    } finally {
      setBusy("");
    }
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

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <h3 className="text-xl font-bold">Items</h3>
            <p className="text-sm text-slate-500">
              ERP-style item master for medicines, lab tests, lab packages, and
              physiotherapy equipment.
            </p>
          </div>
          <Badge tone="blue">{filteredRows.length} items</Badge>
        </div>
        {message && (
          <div className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">
            {message}
          </div>
        )}
        <form onSubmit={createItem} className="mt-5 grid gap-3 md:grid-cols-4">
          <Field label="Item Type">
            <Select value={type} onChange={(e: any) => setType(e.target.value)}>
              {itemTypes.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Code / Serial">
            <Input
              value={form.code}
              onChange={(e: any) => setCodeOrSerial(e.target.value)}
            />
          </Field>
          <Field label="Item Name">
            <Input
              value={form.name}
              onChange={(e: any) => setField("name", e.target.value)}
              required
            />
          </Field>
          {type !== "physio_equipment" && (
            <Field label={type === "lab_package" ? "Package Price" : "Price"}>
              <Input
                type="number"
                value={form.price}
                onChange={(e: any) => setField("price", e.target.value)}
              />
            </Field>
          )}
          <Field label="Supplier">
            <Select
              value={form.supplier_id}
              onChange={(e: any) => setField("supplier_id", e.target.value)}
            >
              <option value="">No supplier</option>
              {stockSuppliers.map((supplier: any) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Purchase Price">
            <Input
              type="number"
              value={form.purchase_price}
              onChange={(e: any) => setField("purchase_price", e.target.value)}
            />
          </Field>
          {type === "medicine" && (
            <>
              <Field label="Generic">
                <Input
                  value={form.generic_name}
                  onChange={(e: any) =>
                    setField("generic_name", e.target.value)
                  }
                />
              </Field>
              <Field label="Reorder Level">
                <Input
                  type="number"
                  value={form.reorder_level}
                  onChange={(e: any) =>
                    setField("reorder_level", e.target.value)
                  }
                />
              </Field>
            </>
          )}
          {type === "lab_test" && (
            <Field label="Sample Type">
              <Input
                value={form.sample_type}
                onChange={(e: any) => setField("sample_type", e.target.value)}
              />
            </Field>
          )}
          {type === "lab_package" && (
            <div className="md:col-span-4 rounded-2xl bg-slate-50 p-4">
              <p className="mb-3 text-xs font-bold uppercase text-slate-500">
                Package Tests
              </p>
              <div className="flex flex-wrap gap-2">
                {tests.map((test: any) => (
                  <button
                    key={test.id}
                    type="button"
                    onClick={() =>
                      setPackageTestIds((ids) =>
                        ids.includes(test.id)
                          ? ids.filter((id) => id !== test.id)
                          : [...ids, test.id],
                      )
                    }
                    className={`rounded-xl border px-3 py-2 text-xs font-bold ${packageTestIds.includes(test.id) ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}
                  >
                    {test.name} · ₹{test.default_price}
                  </button>
                ))}
              </div>
            </div>
          )}
          {type === "physio_equipment" && (
            <>
              <Field label="Modality">
                <Select
                  value={form.modality_type}
                  onChange={(e: any) =>
                    setField("modality_type", e.target.value)
                  }
                >
                  {modalities.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Manufacturer">
                <Input
                  value={form.manufacturer}
                  onChange={(e: any) =>
                    setField("manufacturer", e.target.value)
                  }
                />
              </Field>
              <Field label="Model">
                <Input
                  value={form.model_number}
                  onChange={(e: any) =>
                    setField("model_number", e.target.value)
                  }
                />
              </Field>
              <Field label="Serial Number">
                <Input
                  value={form.serial_number}
                  onChange={(e: any) => {
                    setField("serial_number", e.target.value);
                    setField("code", e.target.value);
                  }}
                />
              </Field>
              <Field label="Portable">
                <Select
                  value={form.is_portable}
                  onChange={(e: any) => setField("is_portable", e.target.value)}
                >
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </Select>
              </Field>
              <Field label="Scope">
                <Select
                  value={form.branch_scope}
                  onChange={(e: any) =>
                    setField("branch_scope", e.target.value)
                  }
                >
                  <option value="branch">Current Branch</option>
                  <option value="tenant">All Branches</option>
                </Select>
              </Field>
            </>
          )}
          <div className="flex items-end gap-2">
            <Button disabled={busy === "save"}>
              {busy === "save"
                ? "Saving..."
                : editing
                  ? "Update Item"
                  : "Save Item"}
            </Button>
            {editing && (
              <ActionButton onClick={cancelEdit}>Cancel</ActionButton>
            )}
          </div>
        </form>
      </Card>
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <h3 className="text-lg font-bold">Pharmacy Stock</h3>
            <p className="text-sm text-slate-500">
              Suppliers, purchases, batches, stock ledger, and low-stock alerts.
            </p>
          </div>
          <Badge tone={stockLow.length ? "amber" : "green"}>
            {stockLow.length} low stock
          </Badge>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <Field label="Supplier Name">
              <Input
                value={suppNameInput}
                onChange={(e: any) => setSuppNameInput(e.target.value)}
              />
            </Field>
            <button
              type="button"
              onClick={createSupplier}
              disabled={busy === "supplier"}
              className="mt-2 rounded-xl border px-3 py-2 text-xs font-bold disabled:text-slate-300"
            >
              {busy === "supplier" ? "Adding..." : "Add Supplier"}
            </button>
            <p className="mt-2 text-xs text-slate-500">
              {stockSuppliers.length} suppliers
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="grid gap-2 md:grid-cols-2">
              <Field label="PO ID">
                <Input
                  value={poId}
                  onChange={(e: any) => setPoId(e.target.value)}
                />
              </Field>
              <Field label="Purchase Date">
                <Input
                  type="date"
                  value={poDate}
                  onChange={(e: any) => setPoDate(e.target.value)}
                />
              </Field>
              <Field label="Medicine">
                <Select
                  value={stockMedId}
                  onChange={(e: any) => setStockMedId(e.target.value)}
                >
                  {medicines.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Quantity">
                <Input
                  type="number"
                  value={poQty}
                  onChange={(e: any) => setPoQty(e.target.value)}
                />
              </Field>
              <Field label="Header Discount %">
                <Input
                  type="number"
                  value={poHdrDisc}
                  onChange={(e: any) => setPoHdrDisc(e.target.value)}
                />
              </Field>
              <Field label="Line Discount %">
                <Input
                  type="number"
                  value={poLineDisc}
                  onChange={(e: any) => setPoLineDisc(e.target.value)}
                />
              </Field>
              <Field label="CGST %">
                <Input
                  type="number"
                  value={poCgst}
                  onChange={(e: any) => setPoCgst(e.target.value)}
                />
              </Field>
              <Field label="SGST %">
                <Input
                  type="number"
                  value={poSgst}
                  onChange={(e: any) => setPoSgst(e.target.value)}
                />
              </Field>
            </div>
            <button
              type="button"
              onClick={createPurchase}
              disabled={busy === "purchase"}
              className="mt-2 rounded-xl border px-3 py-2 text-xs font-bold disabled:text-slate-300"
            >
              {busy === "purchase" ? "Saving..." : "Create Purchase"}
            </button>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase text-slate-500">
              Low Stock / Return
            </p>
            <div className="mt-2 grid gap-2">
              {stockLow.length === 0 ? (
                <p className="text-sm text-slate-500">No low-stock items.</p>
              ) : (
                stockLow.map((row: any) => (
                  <div
                    key={row.medicine_id}
                    className="rounded-xl bg-white p-3 text-sm"
                  >
                    <b>{row.medicine_name}</b>
                    <p className="text-xs text-slate-500">
                      Qty {row.quantity_on_hand} / Reorder {row.reorder_level}
                    </p>
                  </div>
                ))
              )}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <Field label="Return Batch">
                <Select
                  value={stockBatchId}
                  onChange={(e: any) => setStockBatchId(e.target.value)}
                >
                  {stockBatches
                    .filter((b: any) => b.medicine_id === stockMedId)
                    .map((b: any) => (
                      <option key={b.id} value={b.id}>
                        {b.batch_number} · Qty {b.quantity_on_hand}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Return Qty">
                <Input
                  type="number"
                  value={retQty}
                  onChange={(e: any) => setRetQty(e.target.value)}
                />
              </Field>
            </div>
            <button
              type="button"
              onClick={returnExpiredStock}
              disabled={busy === "return"}
              className="mt-2 rounded-xl border px-3 py-2 text-xs font-bold text-red-600 disabled:text-slate-300"
            >
              {busy === "return" ? "Returning..." : "Return Expired"}
            </button>
          </div>
        </div>
      </Card>
      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-lg font-bold">Item List</h3>
            <p className="text-sm text-slate-500">
              Filter, edit, or delete catalog items used by Lab, Pharmacy, and
              Physiotherapy.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3 lg:min-w-[720px]">
            <Field label="Search">
              <Input
                value={filters.query}
                onChange={(e: any) =>
                  setFiltersAndReset({ ...filters, query: e.target.value })
                }
                placeholder="Name, code, type"
              />
            </Field>
            <Field label="Type">
              <Select
                value={filters.type}
                onChange={(e: any) =>
                  setFiltersAndReset({ ...filters, type: e.target.value })
                }
              >
                <option value="all">All item types</option>
                {itemTypes.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Lab Items">
              <Select
                value={filters.labOnly}
                onChange={(e: any) =>
                  setFiltersAndReset({ ...filters, labOnly: e.target.value })
                }
              >
                <option value="all">All items</option>
                <option value="lab">Lab tests & packages</option>
              </Select>
            </Field>
          </div>
        </div>
        <div className="mt-4 overflow-auto rounded-2xl border">
          <table className="w-full min-w-[1240px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th>Item</th>
                <th>Code</th>
                <th>Details</th>
                <th>Supplier</th>
                <th>Purchase</th>
                <th>Price</th>
                <th className="pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-4 text-slate-500">
                    No items match your filter.
                  </td>
                </tr>
              )}
              {pagedRows.map((row: any) => (
                <tr key={`${row.kind}-${row.id}`}>
                  <td className="px-4 py-3">
                    <Badge>{row.kind}</Badge>
                  </td>
                  <td>
                    <b>{row.name}</b>
                    <p className="text-xs text-slate-500">{row.id}</p>
                  </td>
                  <td>{row.code || "-"}</td>
                  <td>{row.meta}</td>
                  <td>{row.supplier}</td>
                  <td>₹{row.purchase_price || 0}</td>
                  <td>{row.price === null ? "-" : `₹${row.price}`}</td>
                  <td className="pr-4">
                    <ActionGroup>
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
            Page {page} of {totalPages} · {filteredRows.length} items
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
