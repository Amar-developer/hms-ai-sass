import { Badge } from "@/app/components/common/ui";
import { CopyIdButton } from "@/app/components/common/CopyIdButton";
import { Column } from "@/utils/types";
import { formatDate } from "../../helpers";
import { RowActions } from "@/features/admin/components/RowActions";
import { UserRoleList } from "./UserRoleList";

type UserColumnsParams = {
  canCopyIds: boolean;
  setSelectedUserId: (id: string) => void;
  setSection: (section: string) => void;
  setConfirmAction: (action: any) => void;
};

export function getUserColumns({
  canCopyIds,
  setSelectedUserId,
  setSection,
  setConfirmAction,
}: UserColumnsParams): Column<any>[] {
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
      key: "name",
      header: "User",
      width: "180px",
      sortable: true,
      render: (user: any) => (
        <div>
          <div className="flex items-center gap-2">
            <b className="text-xs lg:text-sm">{user.name}</b>

            <CopyIdButton
              value={user.id}
              label="User ID"
              allowed={canCopyIds}
            />
          </div>

          <p className="text-[10px] lg:text-xs text-slate-500">
            {user.user_number || "User account"}
          </p>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      width: "200px",
      sortable: true,
      render: (user: any) => (
        <span className="break-all text-xs lg:text-sm">{user.email}</span>
      ),
    },

    {
      key: "roles",
      header: "Roles",
      width: "150px",
      className: "text-center",
      render: (user: any) => <UserRoleList user={user} />,
    },

    {
      key: "mobile",
      header: "Mobile",
      width: "120px",
      className: "text-center",
      render: (user: any) => (
        <span className="text-xs lg:text-sm">{user.mobile || "-"}</span>
      ),
    },

    {
      key: "is_active",
      header: "Status",
      width: "120px",
      className: "text-center",
      sortable: true,
      render: (user: any) => (
        <Badge
          tone={user.is_active ? "green" : "red"}
          className="rounded-full py-1 px-1 text-xs"
        >
          {user.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },

    {
      key: "created_at",
      header: "Created",
      width: "120px",
      sortable: true,
      render: (user: any) => (
        <span className="text-xs lg:text-sm">
          {formatDate(user.created_at)}
        </span>
      ),
    },

    {
      key: "updated_at",
      header: "Modified",
      width: "120px",
      sortable: true,
      render: (user: any) => (
        <span className="text-xs lg:text-sm">
          {formatDate(user.updated_at)}
        </span>
      ),
    },

    {
      key: "actions",
      header: "Actions",
      width: "100px",
      disableRowClick: true,
      render: (user: any) => {
        const actions = [
          {
            label: "Edit",
            onClick: () => {
              setSelectedUserId(user.id);
              setSection("userEdit");
            },
          },
          {
            label: user.is_active ? "Inactive" : "Active",
            onClick: () =>
              setConfirmAction({
                entity: "user",
                kind: "status",
                user,
              }),
          },
          {
            label: "Delete",
            danger: true,
            onClick: () =>
              setConfirmAction({
                entity: "user",
                kind: "delete",
                user,
              }),
          },
        ];

        return <RowActions actions={actions} className="right-16 -bottom-5" />;
      },
    },
  ];
}
