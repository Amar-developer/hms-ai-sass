import { MapPin, Phone } from "lucide-react";

const InvoiceHeader = ({company}) => {
  return (
    <div className="flex items-center justify-around gap-4 px-6 py-2 border-b-2 border-emerald-400">
      <div className="flex items-center justify-center">
        {company.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <div className="flex justify-start ">
            <img
              src={company.logoUrl}
              alt={`${company.name} logo`}
              className="h-20 w-20 object-contain"
            />
          </div>
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-400 text-xs font-bold text-emerald-500">
            LOGO
          </div>
        )}
      </div>
      <div className="flex flex-col justify-center items-center flex-wrap ">
        <div className="text-2xl font-extrabold tracking-tight  border-emerald-500 border-b-2  text-center">
          <span className="text-sky-500 ">{company.name.split(" ")[0]}</span>{" "}
          <span className="text-emerald-500">
            {company.name.split(" ").slice(1).join(" ")}
          </span>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] font-medium text-emerald-600">
          <MapPin className="h-4 w-4" />
          <span> {company.address}</span>
          <span>|</span>
          <Phone className="h-4 w-4" />
          <span> {company.phone}</span>
        </p>
      </div>
      <div className="flex justify-center shrink-0 text-lg font-bold text-red-600 ">
        INVOICE
      </div>
    </div>
  );
};

export default InvoiceHeader;
