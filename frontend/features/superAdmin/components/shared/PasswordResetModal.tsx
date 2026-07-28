"use client";

import { Button, Card, Field, Input, Select } from "@/app/components/common/ui";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";

export function PasswordResetModal({ user, busy, onSubmit, onCancel }: any) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-md">
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="text-lg font-bold">Reset Password</h3>
            <p className="text-sm text-slate-500">
              {user.name} · {user.email}
            </p>
          </div>
          <form onSubmit={onSubmit} className="grid gap-3">
            <Field label="New Password">
              <Input
                name="newPassword"
                type="password"
                minLength={8}
                required
                autoFocus
              />
            </Field>
            <Field label="Confirm Password">
              <Input
                name="confirmPassword"
                type="password"
                minLength={8}
                required
              />
            </Field>
            <Field label="Must Change On Login">
              <Select name="mustChangePassword" defaultValue="true">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy}>
                <ButtonLoader loading={busy}>
                  {busy ? "Saving..." : "Reset Password"}
                </ButtonLoader>
              </Button>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-2xl border px-4 py-3 text-sm font-bold"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
