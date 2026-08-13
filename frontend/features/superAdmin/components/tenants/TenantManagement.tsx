"use client";

import { useEffect, useState } from "react";
import { Badge, Card, Input, RefreshButton } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import {
  dateFieldOptions,
  tenant_status_options,
  tenantTypes,
} from "../../constants";
import { addressText } from "../../helpers";
import { CreateActionButton } from "../shared/CreateActionButton";
import { Pagination } from "@/app/components/common/Pagination";
import {
  FilterSection,
  FilterConfig,
} from "@/app/components/common/FilterSection";
import { DataTable } from "@/app/components/common/DataTable";
import { SortState } from "@/utils/types";
import { getTenantColumns } from "./Column";

const filterConfigs: FilterConfig[] = [
  {
    key: "type",
    label: "Type",
    options: [
      { value: "all", label: "All types" },
      ...tenantTypes.map(([value, label]) => ({ value, label })),
    ],
  },
  {
    key: "status",
    label: "Status",
    options: tenant_status_options,
  },
  // {
  //   key: "dateField",
  //   label: "Date field",
  //   options: dateFieldOptions,
  // },
];

export function TenantManagement({
  tenants,
  setSelectedId,
  setSection,
  switchTenant,
  apiSession,
  canCopyIds = false,
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
  const [sort, setSort] = useState<SortState>({ key: "updated_at", dir: "desc" });
  const [page, setPage] = useState(1);
  const pageSize = 8;

  function updateFilter(key: string, value: string) {
    setFilters({ ...filters, [key]: value });
  }
  function resetFilters() {
    setFilters({
      tenant: "",
      type: "all",
      status: "all",
      contact: "",
      fromDate: "",
      toDate: "",
      dateField: "updated_at",
    });
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

  const tenantColumns = getTenantColumns({
    setSelectedId,
    setSection,
    switchTenant,
    apiSession,
    canCopyIds,
    busy,
    suspendTenant,
  });

  return (
    <div className="mt-3">
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
        <FilterSection
          title="Tenant"
          query={filters.tenant}
          setQuery={(value) => updateFilter("tenant", value)}
          searchPlaceholder="Tenant name or ID"
          filters={filterConfigs}
          filterValues={filters}
          onFilterChange={updateFilter}
          onReset={resetFilters}
          className="lg:grid-cols-4 xl:grid-cols-6"
        >
          {/* <FormField label="Contact">
            <Input
              value={filters.contact}
              onChange={(e: any) => updateFilter("contact", e.target.value)}
              placeholder="Email, phone, address"
              className="search-filter"
            />
          </FormField> */}
          <FormField label="From">
            <Input
              type="date"
              value={filters.fromDate}
              onChange={(e: any) => updateFilter("fromDate", e.target.value)}
            />
          </FormField>
          <FormField label="To">
            <Input
              type="date"
              value={filters.toDate}
              onChange={(e: any) => updateFilter("toDate", e.target.value)}
            />
          </FormField>
        </FilterSection>
        <div className="mt-4 overflow-x-auto scrollbar-hidden rounded-2xl border border-slate-200">
          <div className="min-w-[980px]">
            <DataTable
              columns={tenantColumns}
              data={rows}
              loading={busy && rows.length === 0}
              emptyMessage="No tenants match your search."
              sort={sort}
              onSortChange={setSort}
            />
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
    </div>
  );
}
