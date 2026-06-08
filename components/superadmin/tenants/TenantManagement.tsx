"use client";

import { useEffect, useState } from "react";
import { Badge, Card, Field, Input, Select } from "@/components/common/ui";
import { tenantTypes } from "../../../utils/superAdmin/constants";
import { addressText, formatDate, formatTenantType } from "../../../utils/superAdmin/superAdmin";
import { CreateActionButton } from "../shared/CreateActionButton";
import { Empty } from "../shared/Empty";
import { Pagination } from "../shared/Pagination";
import { SortButton } from "../shared/SortButton";

export function TenantManagement({
  tenants,
  setSelectedId,
  setSection,
  switchTenant,
  apiSession,
  busy,
  suspendTenant,
}: any) {
  const [filters, setFilters] = useState({
    tenant: "",
    type: "all",
    status: "all",
    contact: "",
    fromDate: "",
    toDate: "",
    dateField: "updated_at",
  });
  const [sort, setSort] = useState({ key: "updated_at", dir: "desc" });
  const [page, setPage] = useState(1);
  const pageSize = 8;

  function updateFilter(key: string, value: string) {
    setFilters({ ...filters, [key]: value });
  }
  function changeSort(key: string) {
    setSort(
      sort.key === key
        ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }
  function sortValue(tenant: any, key: string) {
    if (key === "tenant")
      return `${tenant.name || ""} ${tenant.legal_name || ""}`.toLowerCase();
    if (key === "contact")
      return `${tenant.email || ""} ${tenant.phone || ""}`.toLowerCase();
    if (key === "created_at" || key === "updated_at")
      return new Date(tenant[key] || tenant.created_at || 0).getTime();
    return String(tenant[key] || "").toLowerCase();
  }

  const filtered = tenants
    .filter((tenant: any) => {
      const tenantText = [tenant.name, tenant.legal_name, tenant.id]
        .join(" ")
        .toLowerCase();
      const contactText = [tenant.email, tenant.phone, addressText(tenant)]
        .join(" ")
        .toLowerCase();
      const dateValue = tenant[filters.dateField] || tenant.created_at;
      const timestamp = dateValue ? new Date(dateValue).getTime() : 0;
      const from = filters.fromDate
        ? new Date(filters.fromDate).getTime()
        : 0;
      const to = filters.toDate
        ? new Date(`${filters.toDate}T23:59:59`).getTime()
        : Number.MAX_SAFE_INTEGER;
      return (
        (!filters.tenant ||
          tenantText.includes(filters.tenant.toLowerCase())) &&
        (filters.type === "all" || tenant.tenant_type === filters.type) &&
        (filters.status === "all" || tenant.status === filters.status) &&
        (!filters.contact ||
          contactText.includes(filters.contact.toLowerCase())) &&
        (!filters.fromDate || timestamp >= from) &&
        (!filters.toDate || timestamp <= to)
      );
    })
    .sort((a: any, b: any) => {
      const left = sortValue(a, sort.key);
      const right = sortValue(b, sort.key);
      if (left < right) return sort.dir === "asc" ? -1 : 1;
      if (left > right) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [filters, sort, tenants.length]);

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h3 className="text-lg font-bold">Tenants</h3>
          <p className="text-sm text-slate-500">
            Latest created or updated tenants appear first. Use filters and
            sortable headers to manage tenant records.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="blue">{filtered.length} tenants</Badge>
          <CreateActionButton
            label="Create Tenant"
            onClick={() => setSection("createTenant")}
          />
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Field label="Tenant">
          <Input
            value={filters.tenant}
            onChange={(e: any) => updateFilter("tenant", e.target.value)}
            placeholder="Tenant name or ID"
          />
        </Field>
        <Field label="Type">
          <Select
            value={filters.type}
            onChange={(e: any) => updateFilter("type", e.target.value)}
          >
            <option value="all">All types</option>
            {tenantTypes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select
            value={filters.status}
            onChange={(e: any) => updateFilter("status", e.target.value)}
          >
            <option value="all">All status</option>
            <option value="trial">Trial</option>
            <option value="active">Active</option>
          </Select>
        </Field>
        <Field label="Contact">
          <Input
            value={filters.contact}
            onChange={(e: any) => updateFilter("contact", e.target.value)}
            placeholder="Email, phone, address"
          />
        </Field>
        <Field label="Date field">
          <Select
            value={filters.dateField}
            onChange={(e: any) => updateFilter("dateField", e.target.value)}
          >
            <option value="updated_at">Modified date</option>
            <option value="created_at">Created date</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="From">
            <Input
              type="date"
              value={filters.fromDate}
              onChange={(e: any) => updateFilter("fromDate", e.target.value)}
            />
          </Field>
          <Field label="To">
            <Input
              type="date"
              value={filters.toDate}
              onChange={(e: any) => updateFilter("toDate", e.target.value)}
            />
          </Field>
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        <div className="hidden grid-cols-[1.45fr_.9fr_.7fr_1.1fr_.7fr_.7fr_1.15fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 xl:grid">
          <SortButton label="Tenant" field="tenant" sort={sort} onSort={changeSort} />
          <SortButton label="Type" field="tenant_type" sort={sort} onSort={changeSort} />
          <SortButton label="Status" field="status" sort={sort} onSort={changeSort} />
          <SortButton label="Contact" field="contact" sort={sort} onSort={changeSort} />
          <SortButton label="Created" field="created_at" sort={sort} onSort={changeSort} />
          <SortButton label="Modified" field="updated_at" sort={sort} onSort={changeSort} />
          <span>Actions</span>
        </div>
        <div className="divide-y divide-slate-200">
          {rows.length === 0 && <Empty text="No tenants match your search." />}
          {rows.map((tenant: any) => (
            <div
              key={tenant.id}
              className="grid gap-3 px-4 py-4 text-sm xl:grid-cols-[1.45fr_.9fr_.7fr_1.1fr_.7fr_.7fr_1.15fr] xl:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="truncate">{tenant.name}</b>
                  {tenant.is_primary && <Badge tone="blue">Primary</Badge>}
                </div>
                <p className="break-all text-xs text-slate-500">{tenant.id}</p>
              </div>
              <div>
                <span className="xl:hidden text-xs font-bold uppercase text-slate-500">
                  Type:{" "}
                </span>
                {formatTenantType(tenant.tenant_type)}
              </div>
              <div>
                <Badge
                  tone={
                    tenant.status === "active"
                      ? "green"
                      : tenant.status === "trial"
                        ? "amber"
                        : "red"
                  }
                >
                  {tenant.status}
                </Badge>
              </div>
              <div className="min-w-0">
                <p className="truncate">{tenant.email || "-"}</p>
                <p className="text-xs text-slate-500">{tenant.phone || ""}</p>
              </div>
              <div>{formatDate(tenant.created_at)}</div>
              <div>{formatDate(tenant.updated_at)}</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(tenant.id);
                    setSection("tenantEdit");
                  }}
                  className="rounded-xl border px-3 py-2 text-xs font-bold"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => switchTenant(tenant.id)}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:bg-slate-300"
                  disabled={busy || apiSession.tenantId === tenant.id}
                >
                  {apiSession.tenantId === tenant.id ? "Opened" : "Open"}
                </button>
                <button
                  type="button"
                  onClick={() => suspendTenant(tenant)}
                  disabled={tenant.is_primary || busy}
                  className="rounded-xl border px-3 py-2 text-xs font-bold text-red-600 disabled:text-slate-300"
                >
                  Deactivate
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Pagination
        page={safePage}
        totalPages={totalPages}
        total={filtered.length}
        pageSize={pageSize}
        onPage={setPage}
      />
    </Card>
  );
}
