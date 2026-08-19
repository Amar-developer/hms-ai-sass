import { Badge } from "@/app/components/common/ui";
import { CopyIdButton } from "@/app/components/common/CopyIdButton";
import { Column } from "@/utils/types";
import { formatDate, formatTenantType } from "../../helpers";
import { RowActions } from "@/features/admin/components/RowActions";

type TenantColumnsParams = {
  setSelectedId: (id: string) => void;
  setSection: (section: string) => void;
  switchTenant: (id: string) => void;
  apiSession: any;
  canCopyIds: boolean;
  busy: boolean;
  suspendTenant: (tenant: any) => void;
};

export function getTenantColumns({
  setSelectedId,
  setSection,
  switchTenant,
  apiSession,
  canCopyIds,
  busy,
  suspendTenant,
}: TenantColumnsParams): Column<any>[] {
  return [
    {
      key: "s.no",
      header: "S.No",
      width: "50px",
      className: "text-center",
      cellClassName: "text-center",
      sortable: true,
      render: (_, index: number) => index + 1,
    },
    {
      key: "tenant",
      header: "Tenant",
      width: "230px",
      sortable: true,
      render: (tenant: any) => (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <b className="truncate text-xs md:text-sm">{tenant.name}</b>
            <CopyIdButton
              value={tenant.id}
              label="Tenant ID"
              allowed={canCopyIds}
            />
            {tenant.is_primary && (
              <Badge tone="blue" className="normal-label">
                Primary
              </Badge>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "tenant_type",
      header: "Type",
      width: "150px",
      sortable: true,
      render: (tenant: any) => (
        <p className="text-xs lg:text-sm">
          {formatTenantType(tenant.tenant_type)}
        </p>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "text-center",
      width: "100px",
      sortable: true,
      render: (tenant: any) => (
        <Badge
          tone={
            tenant.status === "active"
              ? "green"
              : tenant.status === "trial"
                ? "amber"
                : "red"
          }
          className="normal-badge"
        >
          {tenant.status}
        </Badge>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      width: "200px",
      sortable: true,
      render: (tenant: any) => (
        <div className="min-w-0">
          <p className="truncate text-xs lg:text-sm">{tenant.email || "-"}</p>
          <p className="text-[10px] lg:text-xs text-slate-500">
            {tenant.phone || ""}
          </p>
        </div>
      ),
    },
    {
      key: "created_at",
      header: "Created",
      width: "120px",
      sortable: true,
      render: (tenant: any) => (
        <span className="text-xs lg:text-sm">
          {formatDate(tenant.created_at)}
        </span>
      ),
    },
    {
      key: "updated_at",
      header: "Modified",
      width: "120px",
      sortable: true,
      render: (tenant: any) => (
        <span className="text-xs lg:text-sm">
          {formatDate(tenant.updated_at)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "100px",
      className: "text-center",
      disableRowClick: true,
      render: (tenant: any) => (
        <div
          className="flex justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <RowActions
            actions={[
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
            ]}
            className="right-10 -bottom-5 w-28"
          />
        </div>
      ),
    },
  ];
}
