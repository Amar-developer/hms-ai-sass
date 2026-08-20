import { Badge } from "@/app/components/common/ui";
import { RecordIdCell } from "@/app/components/common/RecordIdCell";
import { RowActions } from "@/features/admin/components/RowActions";
import { Column } from "@/utils/types";
import { doctorTypes } from "@/features/doctors/constants";
import {
  activeDoctorDepartmentFeeRules,
  activeDoctorFeeRule,
  formatPractitionerName,
} from "@/features/doctors/helpers";

type DoctorColumnsParams = {
  canCopyIds: boolean;
  branches: any[];
  departments: any[];
  feeRules: any[];
  selectedBranchByDoctor: Record<string, string>;
  setSelectedBranchByDoctor: (
    updater: (previous: Record<string, string>) => Record<string, string>,
  ) => void;
  selectedDepartmentByDoctor: Record<string, string>;
  setSelectedDepartmentByDoctor: (
    updater: (previous: Record<string, string>) => Record<string, string>,
  ) => void;
  canEditDoctor: boolean;
  canDeleteDoctor: boolean;
  openEdit: (id: string) => void;
  setConfirm: (value: any) => void;
};

export function getDoctorColumns({
  canCopyIds,
  branches,
  departments,
  feeRules,
  selectedBranchByDoctor,
  setSelectedBranchByDoctor,
  selectedDepartmentByDoctor,
  setSelectedDepartmentByDoctor,
  canEditDoctor,
  canDeleteDoctor,
  openEdit,
  setConfirm,
}: DoctorColumnsParams): Column<any>[] {
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
      key: "full_name",
      header: "Doctor",
      width: "140px",
      sortable: true,
      render: (row: any) => (
        <RecordIdCell
          id={row.id}
          label="Doctor ID"
          allowed={canCopyIds}
          value={formatPractitionerName(row)}
          valueClassName="text-sm"
        />
      ),
    },
    {
      key: "practitioner_type",
      header: "Type",
      width: "100px",
      sortable: true,
      render: (row: any) => (
        <span className="text-sm">
          {doctorTypes.find(
            ([value]) => value === row.practitioner_type,
          )?.[1] || row.practitioner_type}
        </span>
      ),
    },
    {
      key: "branch_ids",
      header: "Branches",
      width: "140px",
      disableRowClick: true,
      render: (row: any) => {
        const rowBranches = (row.branch_ids || []).map((id: string) => ({
          branchId: id,
          branchName: branches.find((branch: any) => branch.id === id)?.name || id,
        }));
        if (!rowBranches.length) return <span className="text-sm">-</span>;
        if (rowBranches.length === 1)
          return (
            <span className="text-slate-600 text-sm">
              {rowBranches[0].branchName}
            </span>
          );
        const selectedBranchId =
          selectedBranchByDoctor[row.id] || rowBranches[0].branchId;
        return (
          <select
            value={selectedBranchId}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) =>
              setSelectedBranchByDoctor((previous) => ({
                ...previous,
                [row.id]: event.target.value,
              }))
            }
            className="border rounded px-2 py-1 text-sm"
          >
            {rowBranches.map((branch: any) => (
              <option value={branch.branchId} key={branch.branchId}>
                {branch.branchName}
              </option>
            ))}
          </select>
        );
      },
    },
    {
      key: "department_ids",
      header: "Departments",
      cellClassName: "text-center",
      className: "text-center",
      width: "180px",
      disableRowClick: true,
      render: (row: any) => {
        const specialties = (row.department_ids || []).map(
          (departmentId: string) => ({
            departmentId,
            departmentName:
              departments.find((department: any) => department.id === departmentId)
                ?.name || departmentId,
          }),
        );
        if (!specialties.length) return <span className="text-sm">-</span>;
        if (specialties.length === 1)
          return (
            <span className="text-slate-600 text-sm">
              {specialties[0].departmentName}
            </span>
          );
        const selectedDepartmentId =
          selectedDepartmentByDoctor[row.id] || specialties[0].departmentId;
        return (
          <select
            value={selectedDepartmentId}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) =>
              setSelectedDepartmentByDoctor((previous) => ({
                ...previous,
                [row.id]: event.target.value,
              }))
            }
            className="border rounded px-2 py-1 text-sm"
          >
            {specialties.map((specialty: any) => (
              <option className="" value={specialty.departmentId} key={specialty.departmentId}>
                {specialty.departmentName}
              </option>
            ))}
          </select>
        );
      },
    },
    {
      key: "contact",
      header: "Contact",
      width: "120px",
      render: (row: any) => (
        <span className="break-all text-sm">
          {row.mobile || "-"}
        </span>
      ),
    },
    {
      key: "fee",
      header: "Fee",
      width: "80px",
      render: (row: any) => {
        const departmentIds = row.department_ids || [];
        if (!departmentIds.length) return <span className="text-sm">-</span>;
        const selectedDepartmentId =
          selectedDepartmentByDoctor[row.id] || departmentIds[0];
        const departmentFeeRules = activeDoctorDepartmentFeeRules(
          feeRules,
          row,
        );
        const fallbackFeeRule = activeDoctorFeeRule(feeRules, row);
        const feeRule =
          departmentFeeRules.find(
            (rule: any) => rule.department_id === selectedDepartmentId,
          ) || fallbackFeeRule;
        return (
          <span className="text-sm">
            {feeRule
              ? `₹${Number(feeRule.fee_amount || 0).toLocaleString("en-IN")}`
              : "-"}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      width: "100px",
      className: "text-center",
      cellClassName: "text-center",
      sortable: true,
      render: (row: any) => (
        <Badge
          tone={row.status === "active" ? "green" : "red"}
          className="normal-label"
        >
          {row.status === "active" ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "100px",
      className: "text-center",
      cellClassName: "text-center",
      disableRowClick: true,
      render: (row: any) => (
        <div className="flex justify-center">
          <RowActions
            actions={[
              {
                label: "Edit",
                onClick: () => openEdit(row.id),
              },
              {
                label: row.status === "active" ? "Inactive" : "Active",
                onClick: () => setConfirm({ kind: "status", row }),
                hidden: !canEditDoctor,
              },
              {
                label: "Delete",
                onClick: () => setConfirm({ kind: "delete", row }),
                hidden: !canDeleteDoctor,
                danger: true,
              },
            ]}
          />
        </div>
      ),
    },
  ];
}
