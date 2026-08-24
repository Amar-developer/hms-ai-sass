import { Card } from "@/app/components/common/ui";
import { Inbox, Plus } from "lucide-react";
import { DataTable } from "@/app/components/common/DataTable";

// Search, sort, reset, and the "+ Add a Filter" custom builder now live in
// the breadcrumb row (AdaptiveFilterTrigger/AdaptiveSortTrigger/
// AdaptiveResultCount, rendered by TenantAdmin per section) — this stays a
// header (title + create button) wrapped around a shared DataTable over
// whatever pre-filtered/sorted `rows` it's given.
export function ListCard({
  title,
  rows,
  createLabel,
  onCreate,
  canCreate = true,
  columns,
  onRowClick,
  loading = false,
}: any) {
  return (
    <Card className="p-0">
      {/* HEADER */}
      <div className="pb-3  flex flex-col rounded-lg justify-between gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-col justify-center">
          <h3 className="card-title font-bold">{title}</h3>
          <p className="card-desc text-slate-500">
            Latest created or updated records appear first. Click a row to open
            it.
          </p>
        </div>

        {canCreate && onCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="primary-action gap-2 px-4 py-3 text-xs"
          >
            <Plus size={16} />
            {createLabel}
          </button>
        )}
      </div>

      {/* TABLE */}
      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        paginate
        pageSize={8}
        onRowClick={onRowClick}
        emptyMessage="No records match your search."
        emptyDescription="Items will show up here once added."
        emptyIcon={Inbox}
        minBodyHeight="220px"
      />
    </Card>
  );
}
