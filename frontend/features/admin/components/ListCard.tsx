import { Card } from "@/app/components/common/ui";
import {
  ShieldCheck,
  ClipboardList,
  Inbox,
  Building2,
  Truck,
  PlusCircle,
  Users,
  Percent,
  Tags,
} from "lucide-react";
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
      <div className="flex flex-col rounded-lg mb-2 justify-between bg-white gap-3 lg:flex-row lg:items-center p-2">
        <div className="flex justify-center items-center">
          <div className="p-2 rounded-lg mr-2 text-emarald-900 bg-emerald-50">
            {title == "Users" ? (
              <Users className='text-emerald-600 '/>
            ) : title == "Roles" ? (
              <ShieldCheck className='text-emerald-600 '/>
            ) : title == "Medical Departments" ? (
              <ClipboardList className='text-emerald-600 '/>
            ) : title == "Branches" ? (
              <Building2 className='text-emerald-600 '/>
            ) : title == "Suppliers" ? (
              <Truck className='text-emerald-600 '/>
            ) : title == "Tax Rules" ? (
              <Percent className='text-emerald-600 '/>
            ) : title == "Discounts & Offers" ? (
              <Tags className='text-emerald-600 '/>
            ) : (
              ""
            )}
          </div>
          <div className="flex flex-col">
            <h3 className="card-title font-bold">{title}</h3>
            <p className="card-desc text-slate-500">
              Latest created or updated records appear first. Click a row to
              open it.
            </p>
          </div>
        </div>

        {canCreate && onCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="primary-action gap-2 p-2 text-xs"
          >
            <PlusCircle size={16} />
            {createLabel}
          </button>
        )}
      </div>

      {/* TABLE */}
      <div>
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
          minBodyHeight={`${rows.length > 0 ? "" : "220px"}`}
        />
      </div>
    </Card>
  );
}
