import { CopyIdButton } from "@/app/components/common/CopyIdButton";
import { Badge } from "@/app/components/common/ui";
import { RowActions } from "@/features/admin/components/RowActions";
import { Column } from "@/utils/types";
import { formatDate } from "../../helpers";
type BranchColumnsParams = {
  canCopyIds: boolean;
  setSelectedBranchId: (id: string) => void;
  setSection: (section: string) => void;
  setConfirmAction: (action: any) => void;
};
export function getBranchColumns({
  canCopyIds,
  setSelectedBranchId,
  setSection,
  setConfirmAction,
}: BranchColumnsParams): Column<any>[] {
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
      header: "Branch",
      width: "250px",
      render: (branch: any) => {
        const locked =
          branch.is_template_locked || branch.source_template_branch_id;

        return (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <b className="text-xs lg:text-sm">{branch.name}</b>

              <CopyIdButton
                value={branch.id}
                label="Branch ID"
                allowed={canCopyIds}
              />

              {branch.is_global_template && <Badge tone="blue">Global</Badge>}

              {locked && <Badge tone="purple">Locked</Badge>}
            </div>
          </div>
        );
      },
    },

    {
      key: "code",
      header: "Code",
      width: "150px",
      render: (branch: any) => (
        <span className="text-xs lg:text-sm">{branch.code}</span>
      ),
    },
    {
      key: "is_active",
      header: "Status",
      width: "180px",
      className: "text-center",
      render: (branch: any) => (
        <Badge
          tone={branch.is_active ? "green" : "red"}
          className="rounded-full py-1 px-1 text-xs lg:text-sm"
        >
          {branch.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },

    {
      key: "updated_at",
      header: "Modified",
      width: "180px",
      render: (branch: any) => (
        <span className="text-xs lg:text-sm">
          {formatDate(branch.updated_at || branch.created_at)}
        </span>
      ),
    },

    {
      key: "actions",
      header: "Actions",
      disableRowClick: true,
      render: (branch: any) => {
        const locked =
          branch.is_template_locked || branch.source_template_branch_id;

        const actions = [
          {
            label: "Edit",
            hidden: locked,
            onClick: () => {
              setSelectedBranchId(branch.id);
              setSection("branchEdit");
            },
          },

          {
            label: "Assign",
            onClick: () => {
              setSelectedBranchId(branch.id);
              setSection("branchAssign");
            },
          },

          {
            label: branch.is_active ? "Inactive" : "Active",
            hidden: locked,
            onClick: () =>
              setConfirmAction({
                entity: "branch",
                kind: "status",
                branch,
              }),
          },

          {
            label: "Delete",
            danger: true,
            hidden: locked,
            onClick: () =>
              setConfirmAction({
                entity: "branch",
                kind: "delete",
                branch,
              }),
          },
        ];

        return <RowActions actions={actions} className="right-5 -bottom-7" />;
      },
    },
  ];
}
