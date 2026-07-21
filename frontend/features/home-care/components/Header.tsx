import { Button } from "@/app/components/common/ui";
export function Header({ view, count, onList, onCreate }: any) {
  const listActive =
    view === "list" || view === "view" || view === "edit" || view === "invoice";
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h3 className="card-title font-bold">Home Care / Visit Booking</h3>
        <p className="card-desc text-slate-500">
          Create patient-linked home care and visit bookings. {count} total
          bookings.
        </p>
      </div>
      <div className="grid gap-1 sm:grid-cols-1">
        <Button
          type="button"
          onClick={onCreate}
          className="save-button text-xs"
        >
          New Booking
        </Button>
      </div>
    </div>
  );
}
