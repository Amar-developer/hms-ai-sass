import { type LucideIcon, type Icon, PlusCircle } from "lucide-react";
import { Card } from "./ui";

type DataHeaderTypes = {
  title: string;
  description: string;
  cardIcon: LucideIcon;
  buttonText: string;
  canCreate?: boolean;
  open: (view: string) => void;
};
const DataHeader = ({
  title,
  description,
  cardIcon: Icon,
  buttonText,
  canCreate = true,
  open,
}: DataHeaderTypes) => {
  return (
    <Card className="p-0">
      <div className="w-full min-w-[700px] bg-white px-4 py-3 rounded-lg flex flex-col justify-between gap-3 lg:flex-row lg:items-center ">
        <div className="flex w-2/3">
          <div className="p-2 rounded-lg mr-2 flex h-fit text-emarald-900 bg-emerald-50">
            <Icon className="text-emerald-600" />
          </div>
          <div>
            <h3 className="card-title font-bold">{title}</h3>
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
