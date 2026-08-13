import { Badge } from "@/app/components/common/ui";
import { RowActions } from "@/features/admin/components/RowActions";
import { displayDate } from "@/utils/helper";
import { Column } from "@/utils/types";

type DepartmentColumnsParams = {
  setSelectedDepartmentId: (id: string) => void;
  setSection: (section: string) => void;
  setConfirmAction: (action: any) => void;
};
export function getDepartmentColumns({
  setSelectedDepartmentId,
  setSection,
  setConfirmAction,
}: DepartmentColumnsParams) : Column<any>[]{
  return [
    {
      key: "name",
      header: "Department",
      render: (department: any) => {
        const locked =
          department.is_template_locked ||
          department.source_template_department_id;

        return (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <b className="text-xs lg:text-sm">{department.name}</b>

              {department.is_global_template && (
                <Badge tone="blue" className="normal-badge">
                  Global
                </Badge>
              )}

              {locked && (
                <Badge tone="purple" className="normal-badge">
                  Locked
                </Badge>
              )}
            </div>
          </div>
        );
      },
    },

    {
      key: "code",
      header: "Code",
      render: (department: any) => (
        <span className="text-xs lg:text-sm">{department.code}</span>
      ),
    },

    {
      key: "is_active",
      header: "Status",
      render: (department: any) => (
        <Badge
          tone={department.is_active ? "green" : "red"}
          className="normal-badge w-[60%]"
        >
          {department.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },

    {
      key: "updated_at",
      header: "Modified",
      render: (department: any) => (
        <span className="text-xs lg:text-sm">
          {displayDate(department.updated_at || department.created_at)}
        </span>
      ),
    },

    {
      key: "actions",
      header: "Actions",
      disableRowClick: true,
      render: (department: any) => {
        const locked =
          department.is_template_locked ||
          department.source_template_department_id;

        return (
          <RowActions
            actions={[
              {
                label: "Edit",
                hidden: locked,
                onClick: () => {
                  setSelectedDepartmentId(department.id);
                  setSection("departmentEdit");
                },
              },
              {
                label: "Assign",
                onClick: () => {
                  setSelectedDepartmentId(department.id);
                  setSection("departmentAssign");
                },
              },
              {
                label: department.is_active ? "Inactive" : "Active",
                hidden: locked,
                onClick: () =>
                  setConfirmAction({
                    entity: "department",
                    kind: "status",
                    department,
                  }),
              },
              {
                label: "Delete",
                danger: true,
                hidden: locked,
                onClick: () =>
                  setConfirmAction({
                    entity: "department",
                    kind: "delete",
                    department,
                  }),
              },
            ]}
            className="right-40 -bottom-7"
          />
        );
      },
    },
  ];
}
