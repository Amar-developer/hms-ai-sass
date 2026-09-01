import { useEffect, useRef, useState } from "react";
import { apiFetch, type ApiSession } from "@/lib/api";
import {
  clearNotificationTarget,
  readNotificationTarget,
} from "@/lib/notificationTarget";
import { Button, Card } from "./ui";
import { parseInstant, userIcon } from "@/utils/helper";
import { MentionCommentInput, type MentionUser } from "./MentionCommentInput";

type ActivityChange = {
  field: string;
  label: string;
  old: any;
  new: any;
};

type ActivityEvent = {
  id: string;
  action: string;
  actor_name?: string | null;
  actor_email?: string | null;
  metadata_json?: string;
  created_at: string;
};

type ActivityComment = {
  id: string;
  author_name?: string | null;
  author_email?: string | null;
  body: string;
  mentions?: MentionUser[];
  created_at: string;
};

function renderCommentBody(comment: ActivityComment) {
  const names = (comment.mentions || [])
    .map((user) => user.name)
    .sort((first, second) => second.length - first.length);
  if (names.length === 0) return comment.body;
  const escaped = names.map((name) =>
    name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const mentionPattern = new RegExp(`(@(?:${escaped.join("|")}))`, "g");
  const mentionTokens = new Set(names.map((name) => `@${name}`));
  return comment.body.split(mentionPattern).map((part, index) =>
    mentionTokens.has(part) ? (
      <span
        key={`${part}-${index}`}
        className="rounded bg-blue-50 px-1 font-bold text-blue-700"
      >
        {part}
      </span>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

function timeAgo(iso: string, now = Date.now()): string {
  const then = parseInstant(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  const steps: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let value = seconds;
  let unit = "second";
  for (const [size, label] of steps) {
    if (value < size) {
      unit = label;
      break;
    }
    value = Math.floor(value / size);
    unit = label;
  }
  if (unit === "second" && value < 5) return "just now";
  return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
}

function formatValue(value: any): string {
  if (value === null || value === undefined || value === "") return "null";
  return String(value);
}

function comparableValue(value: any): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function describeEvent(event: ActivityEvent): string {
  let changes: ActivityChange[] = [];
  try {
    const parsed = event.metadata_json ? JSON.parse(event.metadata_json) : {};
    changes = Array.isArray(parsed.changes)
      ? parsed.changes.filter(
          (change: ActivityChange) =>
            comparableValue(change.old) !== comparableValue(change.new),
        )
      : [];
  } catch {
    changes = [];
  }
  const actor = event.actor_email || event.actor_name || "Someone";
  if (event.action.endsWith(".created")) return `${actor} created this`;
  if (event.action.endsWith(".submitted"))
    return `${actor} submitted this document`;
  if (changes.length > 0) {
    const parts = changes.map(
      (change) =>
        `${change.label} from ${formatValue(change.old)} to ${formatValue(change.new)}`,
    );
    return `${actor} changed the value of ${parts.join(", ")}`;
  }
  return `${actor} ${event.action.split(".").slice(1).join(" ").replaceAll("_", " ") || "updated this"}`;
}

export function ActivityLog({
  resourceType,
  resourceId,
  apiSession,
}: {
  resourceType: string;
  resourceId: string | null | undefined;
  apiSession?: ApiSession | null;
}) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [comments, setComments] = useState<ActivityComment[]>([]);
  const [draft, setDraft] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [highlightedCommentId, setHighlightedCommentId] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const { initials, color } = userIcon();

  const load = async () => {
    if (!apiSession || !resourceId) return;
    setLoading(true);
    try {
      const data = await apiFetch(
        `/activity/${resourceType}/${resourceId}`,
        apiSession,
      );
      setEvents(data?.events || []);
      setComments(data?.comments || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceType, resourceId, apiSession?.tenantId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!resourceId) return;
    const target = readNotificationTarget(resourceType);
    if (!target || target.resourceId !== resourceId) return;
    if (
      target.commentId &&
      !comments.some((comment) => comment.id === target.commentId)
    )
      return;
    setHighlightedCommentId(target.commentId || "");
    const frame = window.requestAnimationFrame(() => {
      containerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      clearNotificationTarget(target);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [resourceType, resourceId, comments]);

  const postComment = async () => {
    if (!apiSession || !resourceId || !draft.trim()) return;
    setPosting(true);
    try {
      await apiFetch(
        `/activity/${resourceType}/${resourceId}/comments`,
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            body: draft.trim(),
            mentioned_user_ids: mentionedUserIds,
          }),
        },
      );
      setDraft("");
      setMentionedUserIds([]);
      await load();
    } finally {
      setPosting(false);
    }
  };
  const timeline = [
    ...comments.map((comment) => ({
      kind: "comment" as const,
      at: comment.created_at,
      data: comment,
    })),
    ...events.map((event) => ({
      kind: "event" as const,
      at: event.created_at,
      data: event,
    })),
  ].sort((a, b) => parseInstant(a.at).getTime() - parseInstant(b.at).getTime());
  return (
    <div ref={containerRef}>
      <Card className="mt-3">
        <h4 className="text-sm font-black text-slate-950">Comments</h4>
        <div className="mt-2 flex gap-2">
          <MentionCommentInput
            value={draft}
            onChange={setDraft}
            onMentionedUserIdsChange={setMentionedUserIds}
            apiSession={apiSession}
            disabled={posting}
          />
        </div>
        {draft.length > 0 && (
          <div className="mt-2 flex justify-end">
            <Button
              type="button"
              disabled={posting || !draft.trim()}
              onClick={postComment}
              className="rounded-lg px-4 py-2 text-xs"
            >
              {posting ? "Posting…" : "Comment"}
            </Button>
          </div>
        )}

        <h4 className="mt-5 text-sm font-black text-slate-950">Activity</h4>
        {loading && timeline.length === 0 && (
          <p className="mt-3 text-xs font-semibold text-slate-500">
            Loading activity…
          </p>
        )}
        {!loading && timeline.length === 0 && (
          <p className="mt-3 text-xs font-semibold text-slate-500">
            No activity yet.
          </p>
        )}
        <ul className="mt-3 space-y-3 h-[130px] overflow-y-auto scrollbar-thin">
          {timeline.map((item) => {
            const name =
              item.kind === "comment"
                ? item.data.author_name || item.data.author_email || "Someone"
                : item.data.actor_name || item.data.actor_email || "Someone";

            const { initials, color } = userIcon(name);

            return (
              <li
                key={`${item.kind}-${item.data.id}`}
                className={`border-l-2 pl-3 text-sm text-slate-700 ${
                  item.kind === "comment" &&
                  item.data.id === highlightedCommentId
                    ? "rounded-r-lg border-blue-500 bg-blue-50 px-3 py-2 ring-1 ring-blue-200"
                    : "border-slate-200"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${color}`}
                  >
                    {initials}
                  </span>

                  <div>
                    {item.kind === "comment" ? (
                      <>
                        <span className="font-black text-slate-950">
                          {name}
                        </span>{" "}
                        commented: <span>{renderCommentBody(item.data)}</span>
                      </>
                    ) : (
                      <span>{describeEvent(item.data)}</span>
                    )}

                    <div className="mt-1 text-xs text-slate-500">
                      {timeAgo(item.at, now)}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
