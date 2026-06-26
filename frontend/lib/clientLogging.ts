const API_BASE = (
  process.env.NEXT_PUBLIC_MEDIZINHUB_API_URL ||
  'http://127.0.0.1:8000/api/v1'
).replace(/\/$/, '');

type ClientLogSession = {
  token?: string;
  tenantId?: string;
  user?: {id?: string};
};

type ClientLogContext = {
  event?: string;
  module?: string;
  requestId?: string | null;
  level?: 'warning' | 'error';
};

const recentLogs = new Map<string, number>();
const LOG_DEDUPE_MS = 10_000;
const sentLogTimes: number[] = [];
const MAX_LOGS_PER_MINUTE = 20;

function sanitize(value: unknown, maxLength: number) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/(password|token|secret)(["'\s:=]+)[^\s,"'}]+/gi, '$1$2[redacted]')
    .slice(0, maxLength);
}

export function storedClientLogSession(): ClientLogSession | null {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem('medizinhub.session') || 'null');
  } catch {
    return null;
  }
}

export function reportClientError(
  error: unknown,
  context: ClientLogContext = {},
  providedSession?: ClientLogSession | null,
) {
  if (typeof window === 'undefined') return;
  const session = providedSession || storedClientLogSession();
  if (!session?.tenantId) return;
  const resolvedError = error instanceof Error ? error : new Error(String(error));
  const message = sanitize(resolvedError.message, 1000);
  const event = sanitize(context.event || 'frontend.unhandled_error', 120);
  const fingerprint = `${event}|${message}`;
  const now = Date.now();
  if ((recentLogs.get(fingerprint) || 0) > now - LOG_DEDUPE_MS) return;
  while (sentLogTimes.length && sentLogTimes[0] <= now - 60_000) {
    sentLogTimes.shift();
  }
  if (sentLogTimes.length >= MAX_LOGS_PER_MINUTE) return;
  recentLogs.set(fingerprint, now);
  sentLogTimes.push(now);

  void fetch(`${API_BASE}/client-logs`, {
    method: 'POST',
    keepalive: true,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': session.tenantId,
    },
    body: JSON.stringify({
      level: context.level || 'error',
      event,
      message,
      module: sanitize(context.module || 'frontend', 100),
      route: sanitize(window.location.pathname, 300),
      request_id: sanitize(context.requestId, 100) || null,
      stack: sanitize(resolvedError.stack, 4000) || null,
    }),
  }).catch(() => undefined);
}
