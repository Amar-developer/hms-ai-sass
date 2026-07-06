"use client";

import { useState } from "react";
import { KeyRound, X } from "lucide-react";
import { Button, Card } from "@/app/components/common/ui";
import { apiFetch } from "@/lib/api";
import {
  FormErrorBanner,
  FormSuccessBanner,
  PasswordField,
} from "@/app/components/FormElements";

export function ChangePassword({ apiSession, onClose }: any) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: any) {
    e.preventDefault();
    setMessage("");
    setError("");
    if (newPassword !== confirmPassword) {
      setError("New password and confirm password must match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/auth/change-password", apiSession, {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      setMessage("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(onClose, 700);
    } catch (err: any) {
      setError(err.message || "Could not change password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-md">
       <div className="flex justify-end" onClick={()=>onClose()}>
         <X className="cursor-pointer hover:bg-slate-100"/>
       </div>
        <div className="mb-5 flex items-center gap-3">
          <KeyRound />
          <div>
            <h3 className="text-lg font-bold">Change Password</h3>
            <p className="text-sm text-slate-500">
              Password update is audited in the backend API.
            </p>
          </div>
        </div>
        <form onSubmit={submit} className="grid gap-3">
          <PasswordField
            label="Current Password"
            value={currentPassword}
            onChange={setCurrentPassword}
            required
          />
          <PasswordField
            label="New Password"
            value={newPassword}
            onChange={setNewPassword}
            required
            hint="Minimum 8 characters"
          />
          <PasswordField
            label="Confirm Password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            required
          />
          <FormErrorBanner error={error} />
          <FormSuccessBanner message={message} />
          <div className="flex gap-2  justify-end">
            <button
              type="button"
              onClick={onClose}
              className="close-button font-bold hover:bg-slate-100"
            >
              Cancel
            </button>
            <Button disabled={busy} className='save-button'>
              {busy ? "Updating..." : "Update Password"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
