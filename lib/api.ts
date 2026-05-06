export const API_BASE = (
  process.env.NEXT_PUBLIC_MEDIZINHUB_API_URL || 'http://127.0.0.1:8000/api/v1'
).replace(/\/$/, '');

export type ApiSession = {
  token: string;
  tenantId: string;
  email: string;
  user: any;
};

export async function apiFetch(path: string, session: ApiSession, options: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
        'X-Tenant-ID': session.tenantId,
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error(
      `Could not connect to MedizinHub HMS backend at ${API_BASE}. Start the FastAPI server, confirm /health opens, and check NEXT_PUBLIC_MEDIZINHUB_API_URL/CORS settings.`
    );
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {}
    throw new Error(`${path}: ${detail}`);
  }
  return res.json();
}

export async function apiBlob(path: string, session: ApiSession, options: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${session.token}`,
        'X-Tenant-ID': session.tenantId,
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error(
      `Could not connect to MedizinHub HMS backend at ${API_BASE}. Start the FastAPI server, confirm /health opens, and check NEXT_PUBLIC_MEDIZINHUB_API_URL/CORS settings.`
    );
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {}
    throw new Error(`${path}: ${detail}`);
  }
  return res.blob();
}
