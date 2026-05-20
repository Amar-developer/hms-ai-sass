export const API_BASE = (
  process.env.NEXT_PUBLIC_MEDIZINHUB_API_URL || 'http://127.0.0.1:8000/api/v1'
).replace(/\/$/, '');

export const UPLOADS_BASE = API_BASE.replace(/\/api\/v1$/, '');

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
      `Could not connect to MedizinHub HMS backend at ${API_BASE}. Start the FastAPI server, confirm /health or /api/v1/health opens, and check NEXT_PUBLIC_MEDIZINHUB_API_URL/CORS settings.`
    );
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      detail =
        typeof body.detail === 'string'
          ? body.detail
          : body.detail
            ? JSON.stringify(body.detail)
            : detail;
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
      `Could not connect to MedizinHub HMS backend at ${API_BASE}. Start the FastAPI server, confirm /health or /api/v1/health opens, and check NEXT_PUBLIC_MEDIZINHUB_API_URL/CORS settings.`
    );
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      detail =
        typeof body.detail === 'string'
          ? body.detail
          : body.detail
            ? JSON.stringify(body.detail)
            : detail;
    } catch {}
    throw new Error(`${path}: ${detail}`);
  }
  return res.blob();
}

export async function apiUpload(path: string, session: ApiSession, formData: FormData) {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.token}`,
        'X-Tenant-ID': session.tenantId,
      },
      body: formData,
    });
  } catch {
    throw new Error(`Could not connect to MedizinHub HMS backend at ${API_BASE}.`);
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

export type PhysiotherapyInvoicePayload = {
  discount_amount?: number;
  tax_rule_id?: string | null;
  created_by_user_id?: string | null;
};

export type InvoicePaymentPayload = {
  method: string;
  amount: number;
  reference_number?: string | null;
  collected_by_user_id?: string | null;
};

export function getPhysiotherapyInvoice(session: ApiSession, caseId: string) {
  return apiFetch(`/physiotherapy/cases/${caseId}/invoice`, session);
}

export function generatePhysiotherapyInvoice(
  session: ApiSession,
  caseId: string,
  payload: PhysiotherapyInvoicePayload = {},
) {
  return apiFetch(`/physiotherapy/cases/${caseId}/invoice`, session, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function recordInvoicePayment(session: ApiSession, invoiceId: string, payload: InvoicePaymentPayload) {
  return apiFetch(`/billing/invoices/${invoiceId}/payments`, session, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
