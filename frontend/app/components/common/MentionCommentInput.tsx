"use client";

import { useEffect, useRef, useState } from "react";
import { AtSign, Search, UserRound } from "lucide-react";
import { apiFetch, type ApiSession } from "@/lib/api";

export type MentionUser = {
  id: string;
  name: string;
  email: string;
  user_type: string;
  branch_id?: string | null;
};

type MentionContext = {
  start: number;
  cursor: number;
  query: string;
};

function mentionContext(value: string, cursor: number): MentionContext | null {
  const beforeCursor = value.slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)@([^\s@]*)$/);
  if (!match) return null;
  return {
    start: cursor - match[2].length - 1,
    cursor,
    query: match[2],
  };
}

export function MentionCommentInput({
  value,
  onChange,
  onMentionedUserIdsChange,
  apiSession,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onMentionedUserIdsChange: (userIds: string[]) => void;
  apiSession?: ApiSession | null;
  disabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [context, setContext] = useState<MentionContext | null>(null);
  const [users, setUsers] = useState<MentionUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<MentionUser[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (value) return;
    setSelectedUsers([]);
    onMentionedUserIdsChange([]);
  }, [onMentionedUserIdsChange, value]);

  useEffect(() => {
    if (!apiSession || !context) {
      setUsers([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await apiFetch(
          `/activity/mention-users?q=${encodeURIComponent(context.query)}&limit=20`,
          apiSession,
        );
        if (!cancelled) {
          setUsers(Array.isArray(rows) ? rows : []);
          setActiveIndex(0);
        }
      } catch {
        if (!cancelled) setUsers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [apiSession, context?.query]);

  function updateContext(nextValue: string, cursor: number) {
    setContext(mentionContext(nextValue, cursor));
  }

  function updateSelected(nextValue: string) {
    const retained = selectedUsers.filter((user) =>
      nextValue.includes(`@${user.name}`),
    );
    if (retained.length !== selectedUsers.length) {
      setSelectedUsers(retained);
      onMentionedUserIdsChange(retained.map((user) => user.id));
    }
  }

  function selectUser(user: MentionUser) {
    if (!context) return;
    const insertion = `@${user.name} `;
    const nextValue =
      value.slice(0, context.start) + insertion + value.slice(context.cursor);
    const nextCursor = context.start + insertion.length;
    const nextSelected = selectedUsers.some((row) => row.id === user.id)
      ? selectedUsers
      : [...selectedUsers, user];
    setSelectedUsers(nextSelected);
    onMentionedUserIdsChange(nextSelected.map((row) => row.id));
    onChange(nextValue);
    setContext(null);
    setUsers([]);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  const showMenu = Boolean(context);

  return (
    <div className="relative flex-1">
      <textarea
        ref={textareaRef}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue);
          updateSelected(nextValue);
          updateContext(nextValue, event.target.selectionStart);
        }}
        onClick={(event) =>
          updateContext(value, event.currentTarget.selectionStart)
        }
        onKeyDown={(event) => {
          if (!showMenu) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) =>
              users.length ? (index + 1) % users.length : 0,
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) =>
              users.length ? (index - 1 + users.length) % users.length : 0,
            );
          } else if (event.key === "Enter" && users[activeIndex]) {
            event.preventDefault();
            selectUser(users[activeIndex]);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setContext(null);
          }
        }}
        onBlur={() => window.setTimeout(() => setContext(null), 120)}
        placeholder="Type a comment. Use @ to mention a user"
        aria-label="Comment"
        aria-autocomplete="list"
        aria-expanded={showMenu}
        rows={2}
        className="max-h-[50px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
      />

      {showMenu && (
        <div
          role="listbox"
          aria-label="Mention a tenant user"
          className="absolute left-0 top-[calc(100%+0.25rem)] z-50 max-h-64 w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 px-2 py-2 text-xs font-bold text-slate-500">
            <AtSign size={14} /> Mention someone
          </div>
          {loading && (
            <div className="flex items-center gap-2 px-3 py-4 text-xs text-slate-500">
              <Search size={14} /> Searching tenant users…
            </div>
          )}
          {!loading && users.length === 0 && (
            <p className="px-3 py-4 text-xs text-slate-500">
              No active tenant users found.
            </p>
          )}
          {!loading &&
            users.map((user, index) => (
              <button
                key={user.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectUser(user)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${
                  index === activeIndex ? "bg-slate-100" : "hover:bg-slate-50"
                }`}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-900 text-white">
                  <UserRound size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-900">
                    {user.name}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {user.email} · {user.user_type.replaceAll("_", " ")}
                  </span>
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
