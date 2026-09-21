import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  ActionId,
  ClaimId,
  LabEvent,
  LabSession,
  ReagentId,
  SessionEnvelope,
} from '../../../shared/gram-types.js';
import {
  ACTION_LABELS,
  CLAIM_LABELS,
  SPECIMENS,
  expectedAction,
  findSpecimen,
  getFrameAt,
  gradeSession,
  startRejectionReason,
} from './engine.js';

interface StoredSession extends LabSession {
  specimenId: string;
}

const sessions = new Map<string, StoredSession>();
const DATA_FILE = path.resolve(process.cwd(), '.data', 'gram-sessions.json');
let persistenceReady = false;

async function loadSessions() {
  if (persistenceReady) return;
  persistenceReady = true;
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    const records = JSON.parse(raw) as StoredSession[];
    records.forEach((session) => sessions.set(session.id, session));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('Failed to load Gram lab sessions:', error);
    }
  }
}

async function persistSessions() {
  try {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify([...sessions.values()]), 'utf-8');
  } catch (error) {
    console.error('Failed to persist Gram lab sessions:', error);
  }
}

const REAGENTS: ReagentId[] = ['crystal_violet', 'iodine', 'alcohol', 'safranin'];

function now() {
  return Date.now();
}

function publicSession(session: StoredSession): LabSession {
  const safeSession: LabSession = {
    id: session.id,
    specimenCode: session.specimenCode,
    specimenLabel: session.specimenLabel,
    status: session.status,
    stage: session.stage,
    activeEventId: session.activeEventId,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    events: session.events,
    claim: session.claim,
    grade: session.grade,
    logHash: session.logHash,
  };
  return safeSession;
}

function eventCanonical(event: LabEvent) {
  return {
    type: event.type,
    attemptedAction: event.attemptedAction ?? null,
    startedAt: event.startedAt,
    endedAt: event.endedAt,
    at: event.at,
    reason: event.reason ?? null,
    claim: event.claim ?? null,
  };
}

function calculateLogHash(events: LabEvent[]) {
  const canonical = events
    .map((event, index) => JSON.stringify({ index, ...eventCanonical(event) }))
    .join('\n');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function appendEvent(
  session: StoredSession,
  event: Omit<LabEvent, 'id' | 'index' | 'sessionId'>,
): LabEvent {
  const stored: LabEvent = {
    ...event,
    id: crypto.randomUUID(),
    index: session.events.length,
    sessionId: session.id,
  };
  session.events.push(stored);
  session.logHash = calculateLogHash(session.events);
  void persistSessions();
  return stored;
}

function envelope(session: StoredSession, at = now()): SessionEnvelope {
  const specimen = findSpecimen(session.specimenId);
  if (!specimen) throw new Error('服务端标本数据缺失');
  return {
    session: publicSession(session),
    frame: getFrameAt(session, specimen, at),
  };
}

export async function createSession(): Promise<SessionEnvelope> {
  await loadSessions();
  const specimen = SPECIMENS[crypto.randomInt(SPECIMENS.length)];
  const timestamp = now();
  const code = `标本 #${crypto.randomInt(100000, 1000000)}`;
  const session: StoredSession = {
    id: crypto.randomUUID(),
    specimenId: specimen.id,
    specimenCode: code,
    specimenLabel: specimen.label,
    status: 'active',
    stage: 'ready',
    activeEventId: null,
    startedAt: timestamp,
    completedAt: null,
    events: [],
    claim: null,
    grade: null,
    logHash: calculateLogHash([]),
  };
  sessions.set(session.id, session);
  appendEvent(session, {
    type: 'system',
    startedAt: null,
    endedAt: null,
    at: timestamp,
    reason: `已领取${code}：${specimen.label}。真实细胞壁类型保存在服务端，不随页面下发。`,
  });
  return envelope(session, timestamp);
}

function getStoredSession(sessionId: unknown): StoredSession {
  if (typeof sessionId !== 'string' || !sessions.has(sessionId)) {
    throw Object.assign(new Error('找不到实验会话。刷新后的恢复 ID 无效，或服务端已重启。'), {
      status: 404,
    });
  }
  return sessions.get(sessionId)!;
}

export async function getSession(sessionId: string): Promise<SessionEnvelope> {
  await loadSessions();
  return envelope(getStoredSession(sessionId));
}

export async function startAction(sessionId: string, action: ActionId, clientAt?: number): Promise<SessionEnvelope> {
  await loadSessions();
  const session = getStoredSession(sessionId);
  const timestamp = now();

  if (action === 'water') {
    const reason = startRejectionReason(session.stage, 'water', session.activeEventId !== null);
    if (reason) {
      appendEvent(session, {
        type: 'rejected_action',
        attemptedAction: 'water',
        startedAt: typeof clientAt === 'number' ? clientAt : null,
        endedAt: timestamp,
        at: timestamp,
        reason,
      });
      throw Object.assign(new Error(reason), { status: 409, envelope: envelope(session, timestamp) });
    }

    appendEvent(session, {
      type: 'water',
      startedAt: timestamp,
      endedAt: timestamp,
      at: timestamp,
      reason: '清水冲洗',
    });
    if (session.stage === 'safranin') {
      session.stage = 'complete';
      session.status = 'complete';
      session.completedAt = timestamp;
    } else if (session.stage === 'crystal_violet') {
      session.stage = 'after_crystal_violet_wash';
    } else if (session.stage === 'iodine') {
      session.stage = 'after_iodine_wash';
    } else if (session.stage === 'alcohol') {
      session.stage = 'after_alcohol_wash';
    }
    return envelope(session, timestamp);
  }

  const hasActive = session.activeEventId !== null;
  const reason = startRejectionReason(session.stage, action, hasActive);

  if (reason) {
    appendEvent(session, {
      type: 'rejected_action',
      attemptedAction: action,
      startedAt: typeof clientAt === 'number' ? clientAt : null,
      endedAt: timestamp,
      at: timestamp,
      reason,
    });
    throw Object.assign(new Error(reason), { status: 409, envelope: envelope(session, timestamp) });
  }

  const started = appendEvent(session, {
    type: action,
    startedAt: timestamp,
    endedAt: null,
    at: timestamp,
  });
  session.activeEventId = started.id;
  session.stage = action;
  return envelope(session, timestamp);
}

export async function endAction(sessionId: string, action: ActionId, clientAt?: number): Promise<SessionEnvelope> {
  await loadSessions();
  const session = getStoredSession(sessionId);
  const timestamp = now();
  const activeEvent = session.events.find((event) => event.id === session.activeEventId);

  if (action === 'water') {
    const reason = '清水冲洗是一次性操作，直接点击“冲洗”即可，不需要结束计时。';
    appendEvent(session, {
      type: 'rejected_action',
      attemptedAction: 'water',
      startedAt: typeof clientAt === 'number' ? clientAt : null,
      endedAt: timestamp,
      at: timestamp,
      reason,
    });
    throw Object.assign(new Error(reason), { status: 409, envelope: envelope(session, timestamp) });
  }

  if (!activeEvent || activeEvent.type !== action || activeEvent.endedAt !== null) {
    const reason = session.stage === 'complete'
      ? '实验已经结束，没有正在作用的试剂。'
      : `当前没有正在作用的${ACTION_LABELS[action]}，不能结束这一步。`;
    appendEvent(session, {
      type: 'rejected_action',
      attemptedAction: action,
      startedAt: typeof clientAt === 'number' ? clientAt : null,
      endedAt: timestamp,
      at: timestamp,
      reason,
    });
    throw Object.assign(new Error(reason), { status: 409, envelope: envelope(session, timestamp) });
  }

  activeEvent.endedAt = timestamp;
  session.activeEventId = null;
  session.stage = action;
  session.logHash = calculateLogHash(session.events);
  void persistSessions();
  return envelope(session, timestamp);
}

export async function submitClaim(sessionId: string, claim: ClaimId): Promise<SessionEnvelope> {
  await loadSessions();
  const session = getStoredSession(sessionId);
  const timestamp = now();

  if (session.stage !== 'complete' || session.status !== 'complete') {
    const expected = expectedAction(session.stage);
    const reason = expected
      ? `还没完成完整序列：当前应先${expected === 'water' ? '清水冲洗' : `加${ACTION_LABELS[expected]}`}，不能提交判读。`
      : '还没完成完整染色序列，不能提交判读。';
    appendEvent(session, {
      type: 'rejected_action',
      attemptedAction: 'water',
      startedAt: null,
      endedAt: timestamp,
      at: timestamp,
      reason,
    });
    const error = new Error(reason) as Error & { status?: number; envelope?: SessionEnvelope };
    error.status = 409;
    error.envelope = envelope(session, timestamp);
    throw error;
  }

  if (session.claim) {
    const error = new Error('已经提交过结论；结论不可通过重复请求修改。') as Error & { status?: number; envelope?: SessionEnvelope };
    error.status = 409;
    error.envelope = envelope(session, timestamp);
    throw error;
  }

  const specimen = findSpecimen(session.specimenId);
  if (!specimen) throw new Error('服务端标本数据缺失');
  session.claim = claim;
  appendEvent(session, {
    type: 'claim',
    startedAt: null,
    endedAt: timestamp,
    at: timestamp,
    claim,
    reason: `提交判读：${CLAIM_LABELS[claim]}`,
  });
  session.grade = gradeSession(session, specimen);
  void persistSessions();
  return envelope(session, timestamp);
}

export async function replay(sessionId: string, requestedAt?: number) {
  await loadSessions();
  const session = getStoredSession(sessionId);
  const specimen = findSpecimen(session.specimenId);
  if (!specimen) throw new Error('服务端标本数据缺失');
  const bounded = Math.max(
    session.startedAt,
    Math.min(requestedAt ?? now(), session.completedAt ?? now()),
  );
  return {
    session: publicSession(session),
    frame: getFrameAt(session, specimen, bounded),
    requestedAt: bounded,
  };
}

export { REAGENTS };
