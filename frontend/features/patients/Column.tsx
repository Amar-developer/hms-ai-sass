import { capitalizeFirst } from "@/utils/helper";
import { Badge } from "@/app/components/common/ui";
import { RecordIdCell } from "@/app/components/common/RecordIdCell";
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
      header: "Patient",
      width: "200px",
      sortable: true,
      render: (row: any) => (
        <div className="min-w-0">
          <RecordIdCell
            id={row.id}
            label="Patient ID"
            allowed={canCopyIds}
            value={capitalizeFirst(row.full_name)}
            valueClassName="text-sm text-slate-950"
          />

          <PatientFlagBadges patient={row} className="mt-1.5" maxVisible={3} />
        </div>
      ),
    },
    {
      key: "patient_number",
      header: "Number",
      width: "150px",
      sortable: true,
      render: (row: any) => <p className="">{row.patient_number}</p>,
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
      sortable: true,
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
      sortable: true,
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
      width: "100px",
      className: "text-center",
      cellClassName: "text-center",
      sortable: true,
      render: (row: any) => (
        <Badge
          tone={
            row.status === "active"
              ? "green"
              : row.status === "deceased"
                ? "purple"
                : "red"
          }
         className="normal-label"
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
