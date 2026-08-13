import { Badge } from "@/app/components/common/ui";
import { CopyIdButton } from "@/app/components/common/CopyIdButton";
import { Column } from "@/utils/types";
import { formatDate } from "../../helpers";
import { RowActions } from "@/features/admin/components/RowActions";

type RoleColumnsParams = {
  canCopyIds: boolean;
  openRole: (role: any, sectionId?: string) => void;
  setConfirmAction: (action: any) => void;
};

export function getRoleColumns({
  canCopyIds,
  openRole,
  setConfirmAction,
}: RoleColumnsParams): Column<any>[] {
  return [
    {
      key: "name",
      header: "Role",
      width:'300px',
      sortable: true,
      render: (role: any) => (
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-xs lg:text-sm">{role.name}</b>
          <CopyIdButton
            value={role.primary?.id || role.id}
            label="Role ID"
            allowed={canCopyIds}
          />
          {role.is_global_template && (
            <Badge tone="blue" className="normal-label">
              Global
            </Badge>
          )}
          {role.locked && (
            <Badge
              tone="purple"
              className="normal-label"
            >
              Locked
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "display_key",
      header: "Scope",
      width:'130px',
      render: (role: any) => (
        <span className="text-xs lg:text-sm">{role.display_key}</span>
      ),
    },
    {
      key: "is_active",
      header: "Status",
      width:'130px',
      className:'text-center',
      sortable: true,
      render: (role: any) => (
        <Badge
          tone={role.is_active ? "green" : "red"}
          className="normal-badge"
        >
          {role.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "created_at",
      header: "Created",
      sortable: true,
      render: (role: any) => (
        <span className="text-xs lg:text-sm">
          {formatDate(role.created_at)}
        </span>
      ),
    },
    {
      key: "updated_at",
      header: "Modified",
      sortable: true,
      render: (role: any) => (
        <span className="text-xs lg:text-sm">
          {formatDate(role.updated_at)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      disableRowClick: true,
      render: (role: any) => {
        const locked = role.locked;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <RowActions
              className="right-24 -bottom-14 w-28"
              actions={[
                {
                  label: "Edit",
                  hidden: locked,
                  onClick: () => openRole(role, "roleEdit"),
                },
                {
                  label: "Permissions",
                  disabled: locked,
                  onClick: () => openRole(role, "rolePermissions"),
                },
                {
                  label: "Assign",
                  hidden: role.key === "super_admin",
                  onClick: () => openRole(role, "roleAssign"),
                },
                {
                  label: role.is_active ? "Inactive" : "Active",
                  hidden: locked,
                  onClick: () =>
                    setConfirmAction({
                      entity: "role",
                      kind: "status",
                      role: role.primary,
                    }),
                },
                {
                  label: "Delete",
                  danger: true,
                  hidden: locked,
                  onClick: () =>
                    setConfirmAction({
                      entity: "role",
                      kind: "delete",
                      role: role.primary,
                    }),
                },
              ]}
            />
          </div>
        );
      },
    },
  ];
}
