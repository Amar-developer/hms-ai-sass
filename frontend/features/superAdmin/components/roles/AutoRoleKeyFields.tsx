"use client";

import { useState } from "react";
import { Field, Input } from "@/app/components/common/ui";
import { roleKeyFromName } from "@/utils/helper";

export function AutoRoleKeyFields({ role, onNameChange }: any) {
  const [name, setName] = useState(role?.name || "");
  const key = roleKeyFromName(name || role?.key || "");
  return (
    <>
      <Field label="Role Name">
        <Input
          name="name"
          value={name}
          onChange={(e: any) => {
            setName(e.target.value);
            onNameChange?.(e.target.value);
          }}
          required
          placeholder="Reception Staff"
        />
      </Field>
      <input type="hidden" name="key" value={key} />
      <div className="rounded-lg bg-slate-50 p-4 text-sm">
        <p className="text-xs lg:text-sm font-bold uppercase text-slate-500">
          Generated Role Key
        </p>
        <p className="mt-1 text-[11px] lg:text-xs font-bold text-slate-800">
          {key || "Enter role name"}
        </p>
      </div>
    </>
  );
}
