"use client";

import { KeyRound } from "lucide-react";
import { Button, Card, Field, Input, Select } from "@/app/components/common/ui";
import { userTypes } from "@/utils/superAdmin/constants";
import { canResetUserPassword } from "@/utils/superAdmin/superAdmin";
import { BranchSelect } from "./BranchSelect";
import { RoleCheckboxes } from "./RoleCheckboxes";

export function EditUser({
  apiSession,
  selected,
  user,
  branches,
  roles,
  busy,
  updateUser,
  onResetPassword,
  back,
}: any) {
  if (!user)
    return (
      <Card>
        <h3 className="text-lg font-bold">User not found</h3>
        <button
          type="button"
          onClick={back}
          className="mt-4 rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
        >
          Back to Users
        </button>
      </Card>
    );
  const canReset = canResetUserPassword(apiSession, user, selected);
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-base lg:text-lg font-bold">Edit User</h3>
          <p className="text-xs lg:text-sm text-slate-500">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={back}
          className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
        >
          Back to Users
        </button>
      </div>
      <form
        onSubmit={updateUser}
        className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <Field label="Name">
          <Input
            name="name"
            defaultValue={user.name}
            required
            className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
          />
        </Field>
        <Field label="Email">
          <Input
            name="email"
            type="email"
            defaultValue={user.email}
            required
            className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
          />
        </Field>
        <Field label="User Type">
          <Select
            name="userType"
            defaultValue={user.user_type || "staff"}
            className="rounded-lg px-2 py-1.5 lg:px-4 lg:py-3 text-xs lg:text-sm"
          >
            {userTypes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Mobile">
          <Input
            name="mobile"
            defaultValue={user.mobile || ""}
            className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
          />
        </Field>
        <BranchSelect branches={branches} defaultValue={user.branch_id} />
        <Field label="Status">
          <Select
            name="isActive"
            defaultValue={String(user.is_active)}
            className="rounded-lg px-2 py-1.5 lg:px-4 lg:py-3 text-xs lg:text-sm"
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </Field>
        <Field label="Must Change Password">
          <Select
            name="mustChangePassword"
            defaultValue={String(user.must_change_password)}
            className="rounded-lg px-2 py-1.5 lg:px-4 lg:py-3 text-xs lg:text-sm"
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </Select>
        </Field>
        <div className="md:col-span-2 xl:col-span-3">
          <RoleCheckboxes
            roles={roles}
            selected={user.roles?.length ? user.roles : [user.user_type]}
          />
        </div>
        {canReset && (
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2 xl:col-span-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold">Password reset</p>
              <p className="mt-1 text-xs text-slate-500">
                Set a temporary password for this tenant user.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onResetPassword(user)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-bold shadow-sm transition hover:bg-slate-100"
            >
              <KeyRound size={16} />
              <span>Reset Password</span>
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3">
          <Button disabled={busy}>{busy ? "Saving..." : "Save User"}</Button>
          <button
            type="button"
            onClick={back}
            className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
          >
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
