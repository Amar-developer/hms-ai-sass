import { capitalizeFirst } from "@/utils/helper";
import { Badge } from "@/app/components/common/ui";
import { CopyIdButton } from "@/app/components/common/CopyIdButton";
import { RowActions } from "@/features/admin/components/RowActions";
import { Column } from "@/utils/types";
import { displayPatientGender, patientDisplayMobile } from "./helpers";
import { PatientFlagBadges } from "./components/PatientFlagBadges";

type PatientColumnsParams = {
  branches: any[];
  canCopyIds: boolean;
  canEditPatient: boolean;
  canDeletePatient: boolean;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (row: any) => void;
  onActivate: (row: any) => void;
};

export function getPatientColumns({
  branches,
  canCopyIds,
  canEditPatient,
  canDeletePatient,
  onView,
  onEdit,
  onDelete,
  onActivate,
}: PatientColumnsParams): Column<any>[] {
  return [
    {
      key: "full_name",
      header: "Patient",
      width: "220px",
      render: (row: any) => (
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <b className="block truncate text-sm text-slate-950">
              {capitalizeFirst(row.full_name)}
            </b>
            <CopyIdButton
              value={row.id}
              label="Patient ID"
              allowed={canCopyIds}
            />
          </div>
          <p className="mt-0.5 text-sm font-medium text-slate-500">
            {row.patient_number}
          </p>
          <PatientFlagBadges patient={row} className="mt-1.5" maxVisible={3} />
        </div>
      ),
    },
    {
      key: "mobile",
      header: "Mobile",
      width: "150px",
      render: (row: any) => (
        <span className="block truncate text-sm text-slate-700">
          {patientDisplayMobile(row) || "-"}
        </span>
      ),
    },
    {
      key: "branch_id",
      header: "Branch",
      width: "170px",
      render: (row: any) => {
        const branch = branches.find((item: any) => item.id === row.branch_id);
        return (
          <span className="block truncate text-sm text-slate-700">
            {branch?.name || "No branch"}
          </span>
        );
      },
    },
    {
      key: "gender",
      header: "Gender / Age",
      width: "130px",
      render: (row: any) => (
        <span className="text-sm text-slate-700">
          {displayPatientGender(row.gender)} / {row.age_years ?? "-"}
        </span>
      ),
    },
    {
      key: "subscription_plan_name",
      header: "Plan",
      width: "160px",
      render: (row: any) =>
        row.subscription_plan_name ? (
          <span className="block truncate text-sm text-slate-700">
            {row.subscription_plan_name}
          </span>
        ) : (
          <span className="text-sm text-slate-400">-</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      width: "110px",
      className: "text-center",
      cellClassName: "text-center",
      render: (row: any) => (
        <Badge
          tone={
            row.status === "active"
              ? "green"
              : row.status === "deceased"
                ? "purple"
                : "red"
          }
          className="normal-badge text-sm"
        >
          {row.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "110px",
      className: "text-center",
      cellClassName: "text-center",
      disableRowClick: true,
      render: (row: any) => (
        <div className="flex justify-center">
          <RowActions
            actions={[
              { label: "View", onClick: () => onView(row.id) },
              {
                label: "Edit",
                onClick: () => onEdit(row.id),
                hidden: !canEditPatient,
              },
              {
                label: "Delete",
                onClick: () => onDelete(row),
                hidden: !canDeletePatient || row.status !== "active",
                danger: true,
              },
              {
                label: "Activate",
                onClick: () => onActivate(row),
                hidden: !canEditPatient || row.status !== "inactive",
              },
            ]}
            className="right-7 -bottom-5"
          />
        </div>
      ),
    },
  ];
}
