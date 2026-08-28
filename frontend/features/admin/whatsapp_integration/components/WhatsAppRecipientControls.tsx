import { useMemo, useState } from "react";

import { Input } from "@/app/components/common/ui";
import { WhatsAppSettingsDraft } from "../../types";
import { WhatsAppSwitch } from "./WhatsAppSwitch";

const RECIPIENT_OPTIONS = [
  {
    key: "patientNotificationsEnabled" as const,
    label: "Patient notifications",
    description: "Appointments, payments, and invoice receipts.",
  },
  {
    key: "doctorNotificationsEnabled" as const,
    label: "Doctor notifications",
    description: "New appointment alerts for assigned doctors.",
  },
];

export function WhatsAppRecipientControls({
  draft,
  update,
}: {
  draft: WhatsAppSettingsDraft;
  update: <K extends keyof WhatsAppSettingsDraft>(
    key: K,
    value: WhatsAppSettingsDraft[K],
  ) => void;
}) {
  const [userSearch, setUserSearch] = useState("");
  const selectedIds = new Set(draft.adminRecipientUserIds);
  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return draft.adminRecipientOptions;
    return draft.adminRecipientOptions.filter((user) =>
      `${user.name} ${user.mobile} ${user.userType}`.toLowerCase().includes(query),
    );
  }, [draft.adminRecipientOptions, userSearch]);

  function toggleAdminRecipient(userId: string, selected: boolean) {
    update(
      "adminRecipientUserIds",
      selected
        ? Array.from(new Set([...draft.adminRecipientUserIds, userId]))
        : draft.adminRecipientUserIds.filter((id) => id !== userId),
    );
  }

  return (
    <div className="rounded-lg  bg-white p-3 shadow-sm">
      <h4 className="card-title font-bold text-slate-800">
        Recipient controls
      </h4>
      <p className="mt-1 card-desc text-slate-500">
        A recipient switch disables every notification for that audience.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {RECIPIENT_OPTIONS.map((option) => (
          <div
            key={option.key}
            className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 p-4"
          >
            <div>
              <p className="text-sm font-bold text-slate-800">
                {option.label}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {option.description}
              </p>
            </div>
            <WhatsAppSwitch
              label={option.label}
              checked={draft[option.key]}
              onChange={(checked) => update(option.key, checked)}
              disabled={!draft.enabled}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-800">
              Admin template recipients
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Daily clinic reports and future admin templates are sent only to
              the selected users. Only active users with mobile numbers are listed.
            </p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
            {draft.adminRecipientUserIds.length} selected
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1">
            <label htmlFor="whatsapp-admin-recipient-search" className="sr-only">
              Search admin template recipients
            </label>
            <Input
              id="whatsapp-admin-recipient-search"
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              placeholder="Search users by name, role, or mobile"
              disabled={!draft.enabled}
            />
          </div>
          <button
            type="button"
            className="close-button font-bold disabled:cursor-not-allowed disabled:text-slate-400"
            disabled={!draft.enabled || filteredUsers.length === 0}
            onClick={() =>
              update(
                "adminRecipientUserIds",
                Array.from(
                  new Set([
                    ...draft.adminRecipientUserIds,
                    ...filteredUsers.map((user) => user.userId),
                  ]),
                ),
              )
            }
          >
            Select shown
          </button>
          <button
            type="button"
            className="close-button font-bold disabled:cursor-not-allowed disabled:text-slate-400"
            disabled={!draft.enabled || draft.adminRecipientUserIds.length === 0}
            onClick={() => update("adminRecipientUserIds", [])}
          >
            Clear
          </button>
        </div>

        <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {filteredUsers.map((user) => (
            <label
              key={user.userId}
              className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(user.userId)}
                disabled={!draft.enabled}
                onChange={(event) =>
                  toggleAdminRecipient(user.userId, event.target.checked)
                }
                className="h-4 w-4 rounded border-slate-300 text-emerald-600"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-800">
                  {user.name}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {user.userType.replaceAll("_", " ")} · {user.mobile}
                </span>
              </span>
            </label>
          ))}
          {filteredUsers.length === 0 && (
            <p className="px-3 py-5 text-center text-xs text-slate-500">
              {draft.adminRecipientOptions.length === 0
                ? "No active users with mobile numbers are available."
                : "No users match this search."}
            </p>
          )}
        </div>
        {draft.flows.admin_daily_report &&
          draft.adminRecipientUserIds.length === 0 && (
            <p className="mt-2 text-xs font-semibold text-amber-700">
              No users are selected. You can save this setup, but admin reports
              will not be sent until at least one recipient is selected.
            </p>
          )}
      </div>
    </div>
  );
}
