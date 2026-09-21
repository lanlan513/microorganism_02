import type {
  GramEventInput,
  GramReplay,
  GramSessionSnapshot,
  GramVerdict,
} from '../../shared/gram';

const API_BASE = '/api';

export class ApiOperationError extends Error {
  snapshot?: GramSessionSnapshot;
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string, snapshot?: GramSessionSnapshot) {
    super(message);
    this.name = 'ApiOperationError';
    this.status = status;
    this.code = code;
    this.snapshot = snapshot;
  }
}

async function request<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  const body = await res.json();
  if (!body.success) {
    throw new ApiOperationError(
      body.error || '请求失败',
      res.status,
      body.code,
      body.snapshot as GramSessionSnapshot | undefined
    );
  }
  return body.data as T;
}

export const gramApi = {
  createSession: () =>
    request<GramSessionSnapshot>('/gram/sessions', { method: 'POST' }),
  getSession: (sessionId: string) =>
    request<GramSessionSnapshot>(`/gram/sessions/${sessionId}`),
  sendEvent: (sessionId: string, event: GramEventInput) =>
    request<GramSessionSnapshot>(`/gram/sessions/${sessionId}/events`, {
      method: 'POST',
      body: JSON.stringify(event),
    }),
  submitVerdict: (sessionId: string, choice: GramVerdict, clientAttemptId: string) =>
    request<GramSessionSnapshot>(`/gram/sessions/${sessionId}/verdict`, {
      method: 'POST',
      body: JSON.stringify({ choice, clientAttemptId }),
    }),
  getReplay: (sessionId: string) =>
    request<GramReplay>(`/gram/sessions/${sessionId}/replay`),
};
