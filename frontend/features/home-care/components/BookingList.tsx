import {
  Card,
  RefreshButton,
  Button,
  Input,
  Badge,
} from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { statuses } from "../constants";
import {
  capitalizeFirst,
  displayDate,
  money,
  patientName,
} from "@/utils/helper";
import { bookingTotal, isBookingLocked, bookingStaffName } from "../helpers";
import { humanizeOptionLabel } from "@/lib/options";
import { Pagination } from "@/app/components/common/Pagination";
import { CopyIdButton } from "@/app/components/common/CopyIdButton";
import { RowActions } from "@/features/admin/components/RowActions";
import { FilterSection } from "@/app/components/common/FilterSection";
import { DataTable } from "@/app/components/common/DataTable";
import { Column } from "@/utils/types";
import { PatientFlagBadges } from "@/features/patients/components/PatientFlagBadges";

export function BookingsList({
  bookings,
  total,
  page,
  totalPages,
  onPage,
  filters,
  setFilters,
  patientMap,
  staffMap,
  loading = false,
  onRefresh,
  onCreate,
  onView,
  onEdit,
  onInvoice,
  canManage = false,
  canCreate = false,
  canCopyIds = false,
}: any) {
  const statusFilterConfigs = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "all", label: "All statuses" },
        ...statuses.map(([value, label]: [string, string]) => ({
          value,
          label,
        })),
      ],
    },
  ];

  const bookingColumns: Column<any>[] = [
    {
      key: "booking_number",
      header: "Booking ID",
      width: "180px",
      render: (booking: any) => (
        <div>
          <div className="flex items-center gap-2">
            <b className="text-sm">{booking.booking_number}</b>
            <CopyIdButton
              value={booking.id}
              label="Home Care Booking ID"
              allowed={canCopyIds}
            />
          </div>
        </div>
      ),
    },
    {
      key: "service_count",
      header: "Service Count",
      width: "160px",
      render: (booking: any) => (
        <div>
          <p className="text-sm ">{booking.services?.length || 0} services</p>
        </div>
      ),
    },
    {
      key: "patient",
      header: "Patient",
      width: "160px",
      render: (booking: any) => {
        const patient: any = patientMap.get(booking.patient_id);
        return (
          <div>
            <span className="text-sm">
              {capitalizeFirst(booking.patient_name || patientName(patient))}
            </span>
            <PatientFlagBadges patient={patient} className="mt-1" />
          </div>
        );
      },
    },
    {
      key: "staff",
      header: "Staff",
      width: "160px",
      render: (booking: any) => (
        <div className="text-sm">
          {bookingStaffName(booking, staffMap)}
          {booking.staff_type && (
            <p className="text-xs text-slate-500">
              {humanizeOptionLabel(booking.staff_type)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "date_range",
      header: "Date Range",
      width: "160px",
      render: (booking: any) => (
        <div className="text-sm">
          {displayDate(booking.start_date)} to {displayDate(booking.end_date)}
        </div>
      ),
    },
    {
      key: "recurrence",
      header: "Recurrence",
      width: "160px",
      render: (booking: any) => (
        <div className="text-sm">
            {humanizeOptionLabel(booking.recurrence || "daily")}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "text-center",
      width: "120px",
      render: (booking: any) => {
        return (
          <Badge
            className="normal-badge"
            tone={`${String(
              booking.status == "requested"
                ? "orange"
                : booking.status == "paid"
                  ? "green"
                  : booking.status == "invoiced"
                    ? "skyblue"
                    : booking.status == "scheduled"
                      ? "purple"
                      : booking.status == "in_progress"
                        ? "blue"
                        : booking.status == "completed"
                          ? "amber"
                          : booking.status == "cancelled"
                            ? "red"
                            : "",
            )}`}
          >
            {humanizeOptionLabel(booking.status)}
          </Badge>
        );
      },
    },
    {
      key: "total",
      header: "Total",
      width: "120px",
      className: "text-center",
      cellClassName: "text-center",
      render: (booking: any) => money(bookingTotal(booking)),
    },
    {
      key: "actions",
      header: "Actions",
      width:'100px',
      className: "text-center",
      cellClassName: "text-center",
      disableRowClick: true,
      render: (booking: any) => (
        <div className="flex justify-center">
          <RowActions
            actions={[
              {
                label: "View",
                onClick: () => onView(booking),
              },
              ...(canManage
                ? [
                    {
                      label: "Edit",
                      onClick: () => onEdit(booking),
                      disabled: isBookingLocked(booking),
                    },
                  ]
                : []),
              {
                label: "Invoice",
                onClick: () => onInvoice(booking),
              },
            ]}
            className="right-8 -bottom-5"
          />
        </div>
      ),
    },
  ];

  return (
    <Card>
      <div className="flex flex-col gap-3  lg:items-end lg:justify-between">
        <div className=" w-full flex justify-between">
          <div>
            {" "}
            <h3 className="card-title font-bold">Home Care / Visit Booking</h3>
            <p className="card-desc text-slate-500">
              Create patient-linked home care and visit bookings. bookings.
            </p>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <RefreshButton onRefresh={onRefresh} />
            {canCreate && (
              <Button type="button" onClick={onCreate} className="save-button">
                New Booking
              </Button>
            )}
          </div>
        </div>

        <FilterSection
          title="Bookings"
          query={filters.query}
          setQuery={(value: string) => setFilters({ ...filters, query: value })}
          filters={statusFilterConfigs}
          filterValues={filters}
          className="lg:grid-cols-5 xl:grid-cols-5"
          onFilterChange={(key: string, value: string) =>
            setFilters({ ...filters, [key]: value })
          }
          onReset={() =>
            setFilters({
              ...filters,
              query: "",
              status: "all",
              fromDate: "",
              toDate: "",
            })
          }
        >
          <FormField label="From">
            <Input
              type="date"
              value={filters.fromDate}
              onChange={(event: any) =>
                setFilters({ ...filters, fromDate: event.target.value })
              }
            />
          </FormField>
          <FormField label="To">
            <Input
              type="date"
              value={filters.toDate}
              onChange={(event: any) =>
                setFilters({ ...filters, toDate: event.target.value })
              }
            />
          </FormField>
        </FilterSection>
      </div>

      <div className="mt-4 overflow-x-auto scrollbar-hidden rounded-2xl border border-slate-200">
        <div className="min-w-[980px] ">
          <DataTable
            columns={bookingColumns}
            data={bookings}
            loading={loading}
            emptyMessage="No home care / visit bookings match your filter."
            onRowClick={(booking: any) => onView(booking)}
          />
        </div>
      </div>
      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        onPage={onPage}
      />
    </Card>
  );
}
