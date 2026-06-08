"use client";

import { useState } from "react";
import { Field, Input } from "@/components/common/ui";
import { roleKeyFromName } from "../../../utils/superAdmin/superAdmin";

export function AutoRoleKeyFields({ role }: any) {
  const [name, setName] = useState(role?.name || "");
  const key = roleKeyFromName(name || role?.key || "");
  return (
    <>
      <Field label="Role Name">
        <Input
          name="name"
          value={name}
          onChange={(e: any) => setName(e.target.value)}
          required
          placeholder="Reception Staff"
        />
      </Field>
      <input type="hidden" name="key" value={key} />
      <div className="rounded-2xl bg-slate-50 p-4 text-sm">
        <p className="text-xs font-bold uppercase text-slate-500">
          Generated Role Key
        </p>
        <p className="mt-1 font-bold text-slate-800">
          {key || "Enter role name"}
        </p>
      </div>
    </>
  );
}
