import type {
  ActionId,
  ClaimId,
  LabSession,
  LabFrame,
  ReplayResponse,
  SessionEnvelope,
} from '../../shared/gram-types';

const API_BASE = '/api/gram';

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || !body.success) {
    throw Object.assign(new Error(body.error || '请求失败'), { status: res.status, data: body.data });
  }
  return body.data as T;
}

export const gramApi = {
  create: () => request<SessionEnvelope>('/sessions', { method: 'POST', body: JSON.stringify({}) }),
  get: (sessionId: string) => request<SessionEnvelope>(`/sessions/${sessionId}`),
  start: (sessionId: string, action: ActionId) => request<SessionEnvelope>(
    `/sessions/${sessionId}/actions/${action}/start`,
    { method: 'POST', body: JSON.stringify({ clientAt: Date.now() }) },
  ),
  end: (sessionId: string, action: ActionId) => request<SessionEnvelope>(
    `/sessions/${sessionId}/actions/${action}/end`,
    { method: 'POST', body: JSON.stringify({ clientAt: Date.now() }) },
  ),
  claim: (sessionId: string, claim: ClaimId) => request<SessionEnvelope>(
    `/sessions/${sessionId}/claim`,
    { method: 'POST', body: JSON.stringify({ claim }) },
  ),
  replay: (sessionId: string, at: number) => request<ReplayResponse>(
    `/sessions/${sessionId}/replay?at=${Math.round(at)}`,
  ),
};

export type { LabSession, LabFrame };
