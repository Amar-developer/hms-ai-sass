import { MapPin, Phone } from "lucide-react";
import { useEffect, useState } from "react";

const InvoiceHeader = ({ company }) => {
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => setLogoFailed(false), [company.logoUrl]);

  return (
    <div className="flex items-center gap-4 border-b-2  border-emerald-400 px-6 py-2">
      {/* Logo */}
      <div className="shrink-0">
        {company.logoUrl && !logoFailed ? (
          <img
            src={company.logoUrl}
            alt={`${company.name} logo`}
            className="h-[60px] w-[100px] object-contain"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-400 text-xs font-bold text-emerald-500">
            LOGO
          </div>
        )}
      </div>

      {/* Company Details */}
      <div className="min-w-0 flex-1 flex flex-col items-center justify-center  text-center">
        <div className="border-b-2 w-fit text-center  pb-3 border-emerald-500 pb-2 text-2xl font-extrabold tracking-tight ">
          <span className="text-sky-500 text-center">{company.name.split(" ")[0]}</span>{" "}
          <span className="text-emerald-500">
            {company.name.split(" ").slice(1).join(" ")}
          </span>
        </div>

        <div className="mt-2 space-y-1 text-[13px] font-medium text-emerald-600">
          <div className="flex items-center justify-center gap-1">
            <span className="pt-2"><MapPin className="mt-0.5  h-4 w-4 shrink-0" /></span>
            <span className="break-words">{company.address}</span></div>

          <div className="flex items-center justify-center gap-1">
           <span className="pt-2"> <Phone className="h-4 w-4 shrink-0" /></span>
            <span>{company.phone}</span>
          </div>
        </div>
      </div>

      {/* Invoice */}
      <div className="shrink-0 text-lg font-bold text-red-600">INVOICE</div>
    </div>
  );
};

export default InvoiceHeader;
