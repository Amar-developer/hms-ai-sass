"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  Card,
  Field,
  Input,
  RefreshButton,
  Select,
} from "@/app/components/common/ui";
import { tenantTypes } from "../../constants";
import { addressText, formatDate, formatTenantType } from "../../helpers";
import { CreateActionButton } from "../shared/CreateActionButton";
import { Empty } from "@/app/components/common/Empty";
import { SortButton } from "../shared/SortButton";
import { Pagination } from "@/app/components/common/Pagination";
import { RowActions } from "@/features/admin/components/RowActions";

export function TenantManagement({
  tenants,
  setSelectedId,
  setSection,
  switchTenant,
  apiSession,
  busy,
  suspendTenant,
  onRefresh,
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
      const from = filters.fromDate ? new Date(filters.fromDate).getTime() : 0;
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
          <div className="flex ">
            <h3 className="text-lg font-bold mr-2">Tenants</h3>
            <Badge tone="blue" className="card-badge">
              {filtered.length} tenants
            </Badge>
          </div>
          <p className="card-desc text-slate-500">
            Active and trial tenants appear here. Deactivated tenants are
            suspended and hidden from this workspace.
          </p>
        </div>
        <div className="flex items-center gap-2 ">
          {onRefresh ? <RefreshButton onRefresh={onRefresh} /> : null}
          <CreateActionButton
            label="Create Tenant"
            onClick={() => setSection("createTenant")}
          />
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Field label="Tenant">
          <Input
            value={filters.tenant}
            onChange={(e: any) => updateFilter("tenant", e.target.value)}
            placeholder="Tenant name or ID"
            className="search-filter"
          />
        </Field>
        <Field label="Type">
          <Select
            value={filters.type}
            onChange={(e: any) => updateFilter("type", e.target.value)}
            className="select-filter"
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
            className="select-filter"
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
            className="search-filter"
          />
        </Field>
        <Field label="Date field">
          <Select
            value={filters.dateField}
            onChange={(e: any) => updateFilter("dateField", e.target.value)}
            className="select-filter"
          >
            <option value="updated_at">Modified date</option>
            <option value="created_at">Created date</option>
          </Select>
        </Field>
        <Field label="From">
          <Input
            type="date"
            value={filters.fromDate}
            onChange={(e: any) => updateFilter("fromDate", e.target.value)}
            className="date-filter"
          />
        </Field>
        <Field label="To">
          <Input
            type="date"
            value={filters.toDate}
            onChange={(e: any) => updateFilter("toDate", e.target.value)}
            className="date-filter"
          />
        </Field>
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        <div className="hidden md:grid grid-cols-[1.45fr_.9fr_.7fr_1.1fr_.7fr_.7fr_.7fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500">
          <SortButton
            label="Tenant"
            field="tenant"
            sort={sort}
            onSort={changeSort}
          />
          <SortButton
            label="Type"
            field="tenant_type"
            sort={sort}
            onSort={changeSort}
          />
          <SortButton
            label="Status"
            field="status"
            sort={sort}
            onSort={changeSort}
          />
          <SortButton
            label="Contact"
            field="contact"
            sort={sort}
            onSort={changeSort}
          />
          <SortButton
            label="Created"
            field="created_at"
            sort={sort}
            onSort={changeSort}
          />
          <SortButton
            label="Modified"
            field="updated_at"
            sort={sort}
            onSort={changeSort}
          />
          <span>Actions</span>
        </div>
        <div className="divide-y divide-slate-200">
          {rows.length === 0 && <Empty text="No tenants match your search." />}
          {rows.map((tenant: any) => {
            const actions = [
              {
                label: "Edit",
                onClick: () => {
                  setSelectedId(tenant.id);
                  setSection("tenantEdit");
                },
              },
              {
                label: apiSession.tenantId === tenant.id ? "Opened" : "Open",
                onClick: () => switchTenant(tenant.id),
                disabled: busy || apiSession.tenantId === tenant.id,
              },
              {
                label: "Deactivate",
                onClick: () => suspendTenant(tenant),
                disabled: tenant.is_primary || busy,
                danger: true,
              },
            ];
            return (
              <div
                key={tenant.id}
                className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[1.45fr_.9fr_.7fr_1.1fr_.7fr_.7fr_.7fr] md:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="truncate text-xs md:text-sm">{tenant.name}</b>
                    {tenant.is_primary && (
                      <Badge tone="blue" className="rounded-xl px-2 py-1">
                        Primary
                      </Badge>
                    )}
                  </div>
                </div>
                <div>
                  <span className="xl:hidden text-[10px] lg:text-xs font-bold uppercase text-slate-500">
                    Type:{" "}
                  </span>
                  <p className="text-xs lg:text-sm">
                    {formatTenantType(tenant.tenant_type)}
                  </p>
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
                    className="table-status"
                  >
                    {tenant.status}
                  </Badge>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs lg:text-sm">
                    {tenant.email || "-"}
                  </p>
                  <p className="text-[10px] lg:text-xs text-slate-500">
                    {tenant.phone || ""}
                  </p>
                </div>
                <div className="text-xs lg:text-sm">
                  {formatDate(tenant.created_at)}
                </div>
                <div className="text-xs lg:text-sm">
                  {formatDate(tenant.updated_at)}
                </div>
                <div
                  className="flex justify-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <RowActions
                    actions={actions}
                    className="right-28 -bottom-5"
                  />
                </div>
              </div>
            );
          })}
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
