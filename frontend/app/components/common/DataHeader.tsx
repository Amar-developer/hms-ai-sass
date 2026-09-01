import { type LucideIcon, type Icon, PlusCircle } from "lucide-react";
import { Badge, Card } from "./ui";

type DataHeaderTypes = {
  title: string;
  description: string;
  cardIcon: LucideIcon;
  buttonText: string;
  canCreate?: boolean;
  open: (view: string) => void;
  count?: string;
};
const DataHeader = ({
  title,
  description,
  cardIcon: Icon,
  buttonText,
  canCreate = true,
  open,
  count,
}: DataHeaderTypes) => {
  return (
    <Card className="p-0">
      <div className="w-full min-w-[700px] bg-white px-4 py-3 rounded-lg flex flex-col justify-between gap-3 lg:flex-row lg:items-center ">
        <div className="flex w-2/3">
          <div className="p-2 rounded-lg mr-2 flex h-fit text-emarald-900 bg-emerald-50">
            <Icon className="text-emerald-600" />
          </div>
          <div>
            <div className="flex">
              <h3 className="card-title font-bold">{title}</h3>
              <Badge tone="blue" className="normal-label ml-2">
                {count}{" "}
                {title == "EMR / Patient Management"
                  ? "patients"
                  : title === "Lab / Service Workspace" ||
                      title === "Pharmacy Workspace"
                    ? "orders"
                    : title === "Home Care / Visit Workspace"
                      ? "bookings"
                      : title.toLocaleLowerCase()}
              </Badge>
            </div>
            <p className="card-desc text-slate-500">{description}</p>
          </div>
        </div>
        <div className="flex justify-start items-center gap-2">
          {canCreate && (
            <button
              type="button"
              onClick={() => open("create")}
              className="primary-action gap-2 px-4 py-2 text-xs lg:w-auto"
            >
              <PlusCircle size={16} />
              {buttonText}
            </button>
          )}
        </div>
      </div>
    </Card>
  );
};

export default DataHeader;
