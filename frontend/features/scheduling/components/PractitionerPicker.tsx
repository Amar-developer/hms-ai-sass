import { useState } from "react";
import { formatPractitionerType } from "../helpers";
import { Input } from "@/app/components/common/ui";

export function PractitionerPicker({ doctors, value, onChange }: any) {
  const selected = doctors.find((doctor: any) => doctor.id === value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const search = query.trim().toLowerCase();
  const rows = [...doctors]
    .sort((a: any, b: any) =>
      String(a.full_name || "").localeCompare(String(b.full_name || "")),
    )
    .filter((doctor: any) => {
      if (!search) return true;
      return [
        doctor.full_name,
        doctor.primary_specialty,
        doctor.practitioner_type,
        doctor.registration_number,
        ...(doctor.branch_ids || []),
        ...(doctor.department_ids || []),
      ]
        .filter(Boolean)
        .some((item) => String(item).toLowerCase().includes(search));
    });
  return (
    <div className="relative">
      <Input
        value={open ? query : selected?.full_name || ""}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(event: any) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event: any) => {
          if (event.key === "Enter") event.preventDefault();
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder="Type doctor or physiotherapist"
        required={!value}
        className=' placeholder:text-xs search-input'
      />
      {open && (
        <div className="absolute z-40 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl">
          {rows.length === 0 && (
            <div className="px-3 py-3 text-sm text-slate-500">
              No practitioner found.
            </div>
          )}
          {rows.map((doctor: any) => (
            <button
              key={doctor.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(doctor.id);
                setQuery("");
                setOpen(false);
              }}
              className={`w-full rounded-xl px-3 py-2 text-left text-xs hover:bg-slate-50 ${
                doctor.id === value
                  ? "bg-slate-900 text-white hover:bg-slate-900"
                  : ""
              }`}
            >
              <b>{doctor.full_name}</b>
              <span
                className={`ml-2 text-xs ${
                  doctor.id === value ? "text-slate-200" : "text-slate-500"
                }`}
              >
                {formatPractitionerType(doctor.practitioner_type)}
              </span>
              {doctor.primary_specialty && (
                <p
                  className={`text-xs ${
                    doctor.id === value ? "text-slate-200" : "text-slate-500"
                  }`}
                >
                  {doctor.primary_specialty}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
