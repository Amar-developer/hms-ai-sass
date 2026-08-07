import { humanizeOptionLabel } from "@/lib/options";
import { capitalizeFirst, displayDateTime } from "@/utils/helper";
import { patientLabel } from "./helpers";
import { uploadAssetUrl } from "@/lib/api";
import { RowActions } from "./components/RowActions";
import { Badge } from "@/app/components/common/ui";

interface ConfirmDeleteState {
  kind: string;
  entity: string;
  file: any;
}
interface GetFileColumnProps {
  busy: boolean;
  setConfirmDelete: ({ kind, entity, file }: ConfirmDeleteState) => void;
  patients: any[];
}
export function getFileColumns({
  busy,
  setConfirmDelete,
  patients,
}: GetFileColumnProps) {
  return [
    {
      key: "file_name",
      header: "File",
      width: "200px",
      render: (file: any) => (
        <div className="max-w-[200px]">
          <p className="font-bold truncate text-xs" title={file?.file_name}>
            {capitalizeFirst(file.file_name)}
          </p>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      width: "120px",
      render: (file: any) => (
        <Badge tone="blue" className="normal-badge">
          {humanizeOptionLabel(file.category)}
        </Badge>
      ),
    },
    {
      key: "attached_to_doctype",
      header: "Attached To",
      render: (file: any) => (
        <div className="text-xs">{file.attached_to_doctype || "-"}</div>
      ),
    },
    {
      key: "patient_id",
      header: "Patient",
      render: (file: any) => (
        <div className="text-xs">{patientLabel(patients, file.patient_id)}</div>
      ),
    },
    {
      key: "created_at",
      header: "Created",
      render: (file: any) => (
        <div className="text-xs">
          {file.created_at ? displayDateTime(file.created_at) : "-"}
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "100px",
      disableRowClick: true,
      render: (file: any) => {
        const actions = [
          {
            label: "Open",
            onClick: () =>
              window.open(
                uploadAssetUrl(file.file_url),
                "_blank",
                "noopener,noreferrer",
              ),
          },
          {
            label: "Delete",
            danger: true,
            disabled: busy,
            onClick: () =>
              setConfirmDelete({ kind: "delete", entity: "file", file }),
          },
        ];

        return <RowActions actions={actions} className="right-5 -bottom-7" />;
      },
    },
  ];
}
