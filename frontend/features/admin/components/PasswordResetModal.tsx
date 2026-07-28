import { Card,Input,Button,Field, SearchableSelect } from "@/app/components/common/ui";
import { MUST_CHANGE_OPTIONS } from "../constants";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
export function PasswordResetModal({ user, busy, onSubmit, onCancel }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-md">
        <h3 className="text-lg font-bold">Reset Password</h3>

        <p className="mt-1 text-sm text-slate-500">
          {user.name} · {user.email}
        </p>

        <form onSubmit={onSubmit} className="mt-4 grid gap-3">
          <Field label="New Password">
            <Input name="newPassword" type="password" minLength={8} required />
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
            <SearchableSelect
              name="mustChangePassword"
              searchable={false}
              options={MUST_CHANGE_OPTIONS}
              value="true"
            />
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
      </Card>
    </div>
  );
}
