import crypto from 'node:crypto';
import {
  FRAME_INTERVAL_MS,
  evaluateGramLog,
  generateCells,
  simulateGram,
  type InternalSpecimen,
} from '../../../shared/gram/index.js';
import {
  GRAM_PROTOCOL_VERSION,
  GRAM_REAGENTS,
  REAGENT_LABELS,
  type AcceptedGramEvent,
  type GramEventAction,
  type GramEventInput,
  type GramReagent,
  type GramReplay,
  type GramSessionSnapshot,
  type GramVerdict,
  type PublicSpecimen,
  type RejectedGramEvent,
} from '../../../shared/gram/index.js';
import { GRAM_SPECIMENS } from './gramSpecimens.js';

interface SessionEventInput extends GramEventInput {
  receivedAt: number;
}

interface SessionAcceptedEvent extends AcceptedGramEvent {
  clientEventId: string;
  startServerMs: number;
  stopServerMs: number | null;
}

interface SessionRejectedEvent extends RejectedGramEvent {
  clientEventId: string;
}

interface GramSession {
  id: string;
  specimen: InternalSpecimen;
  startedAt: number;
  events: SessionAcceptedEvent[];
  rejected: SessionRejectedEvent[];
  active: { reagent: GramReagent; startedAt: number } | null;
  status: 'active' | 'judged' | 'invalid';
  result: GramSessionSnapshot['result'];
  idempotency: Map<string, IdempotentResponse>;
  lastTouchedAt: number;
}

interface IdempotentResponse {
  status: number;
  body: { success: true; data: GramSessionSnapshot } | { success: false; error: string; code: string; snapshot?: GramSessionSnapshot };
}

const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const sessions = new Map<string, GramSession>();

function toPublicSpecimen(specimen: InternalSpecimen): PublicSpecimen {
  return {
    code: specimen.code,
    morphologyType: specimen.morphologyType,
    clue: specimen.clue,
    seed: specimen.seed,
  };
}

function toReplaySpecimen(specimen: InternalSpecimen) {
  return { ...toPublicSpecimen(specimen), kinetics: specimen.kinetics };
}

function currentFrame(session: GramSession, now: number) {
  const atMs = session.active
    ? offset(session, now)
    : session.events.reduce(
        (max, event) =>
          event.durationMs === null
            ? max
            : Math.max(max, event.startOffsetMs + event.durationMs),
        0
      );
  const simulation = simulateGram(session.events.map(toAcceptedEvent), {
    decolorRate: session.specimen.kinetics.decolorRate,
    cells: generateCells(session.specimen.morphologyType, session.specimen.seed),
    atMs,
    frameIntervalMs: Number.MAX_SAFE_INTEGER,
  });
  const frame = simulation.frames
    .filter((item) => item.atMs <= atMs + 0.001)
    .at(-1) ?? simulation.frames[0];
  return {
    atMs: frame.atMs,
    stage: frame.stage,
    activeReagent: frame.activeReagent,
    cellColors: frame.cellColors,
    cellEdgeColors: frame.cellEdgeColors,
    fieldColor: frame.fieldColor,
  };
}

function offset(session: GramSession, serverMs: number): number {
  return serverMs - session.startedAt;
}

function toAcceptedEvent(event: SessionAcceptedEvent): AcceptedGramEvent {
  return {
    id: event.id,
    reagent: event.reagent,
    startOffsetMs: event.startOffsetMs,
    durationMs: event.durationMs,
  };
}

function toRejectedEvent(event: SessionRejectedEvent): RejectedGramEvent {
  return {
    id: event.id,
    action: event.action,
    reagent: event.reagent,
    atOffsetMs: event.atOffsetMs,
    code: event.code,
    message: event.message,
    fatal: event.fatal,
  };
}

function completedReagents(session: GramSession): Set<GramReagent> {
  return new Set(
    session.events
      .filter((event) => event.durationMs !== null)
      .map((event) => event.reagent)
  );
}

function canonicalChecksum(session: GramSession, durationMs: number): string {
  const payload = {
    protocolVersion: GRAM_PROTOCOL_VERSION,
    specimen: toReplaySpecimen(session.specimen),
    events: session.events.map(toAcceptedEvent),
    rejected: session.rejected.map(toRejectedEvent),
    durationMs,
    frameIntervalMs: FRAME_INTERVAL_MS,
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function toSnapshot(session: GramSession, now: number = Date.now()): GramSessionSnapshot {
  return {
    sessionId: session.id,
    status: session.status,
    specimen: toPublicSpecimen(session.specimen),
    events: session.events.map(toAcceptedEvent),
    rejected: session.rejected.map(toRejectedEvent),
    activeReagent: session.active?.reagent ?? null,
    activeElapsedMs: session.active ? now - session.active.startedAt : 0,
    snapshotAtOffsetMs: offset(session, now),
    frame: currentFrame(session, now),
    result: session.result,
  };
}

function replay(session: GramSession): GramReplay {
  const durationMs = session.events.reduce(
    (max, event) => (event.durationMs === null ? max : Math.max(max, event.startOffsetMs + event.durationMs)),
    0
  );
  return {
    protocolVersion: GRAM_PROTOCOL_VERSION,
    specimen: toReplaySpecimen(session.specimen),
    status: session.status,
    events: session.events.map(toAcceptedEvent),
    rejected: session.rejected.map(toRejectedEvent),
    durationMs,
    frameIntervalMs: FRAME_INTERVAL_MS,
    checksum: canonicalChecksum(session, durationMs),
    result: session.result,
  };
}

function pruneSessions(now: number) {
  sessions.forEach((session, id) => {
    if (now - session.lastTouchedAt > SESSION_TTL_MS) sessions.delete(id);
  });
}

function reject(
  session: GramSession,
  input: SessionEventInput,
  code: string,
  message: string,
  fatal: boolean
): RejectedGramEvent {
  const event: SessionRejectedEvent = {
    id: crypto.randomUUID(),
    clientEventId: input.clientEventId,
    action: input.action,
    reagent: input.reagent,
    atOffsetMs: offset(session, input.receivedAt),
    code,
    message,
    fatal,
  };
  session.rejected.push(event);
  if (fatal) session.status = 'invalid';
  session.lastTouchedAt = input.receivedAt;
  return event;
}

function success(snapshot: GramSessionSnapshot): IdempotentResponse {
  return { status: 200, body: { success: true, data: snapshot } };
}

function failure(
  code: string,
  error: string,
  snapshot?: GramSessionSnapshot,
  status = 409
): IdempotentResponse {
  const body: IdempotentResponse['body'] = { success: false, code, error };
  if (snapshot) (body as Extract<IdempotentResponse['body'], { success: false }>).snapshot = snapshot;
  return { status, body };
}

export function createGramSession(specimenIndex?: number): GramSessionSnapshot {
  pruneSessions(Date.now());
  const index = specimenIndex !== undefined && specimenIndex >= 0 && specimenIndex < GRAM_SPECIMENS.length
    ? specimenIndex
    : crypto.randomInt(GRAM_SPECIMENS.length);
  const now = Date.now();
  const session: GramSession = {
    id: crypto.randomUUID(),
    specimen: GRAM_SPECIMENS[index],
    startedAt: now,
    events: [],
    rejected: [],
    active: null,
    status: 'active',
    result: null,
    idempotency: new Map(),
    lastTouchedAt: now,
  };
  sessions.set(session.id, session);
  return toSnapshot(session, now);
}

export function getGramSession(sessionId: string): GramSessionSnapshot | null {
  const session = sessions.get(sessionId);
  return session ? toSnapshot(session) : null;
}

export function applyGramEvent(sessionId: string, rawInput: GramEventInput): IdempotentResponse {
  const session = sessions.get(sessionId);
  const now = Date.now();
  if (!session) return failure('SESSION_NOT_FOUND', '实验会话不存在或已过期，刷新后需要新开涂片。', undefined, 404);

  const cached = session.idempotency.get(rawInput.clientEventId);
  if (cached) return cached;

  const input: SessionEventInput = { ...rawInput, receivedAt: now };
  const snapshot = () => toSnapshot(session, now);
  const label = REAGENT_LABELS[input.reagent];

  if (session.status === 'judged') {
    const response = failure('ALREADY_JUDGED', '本次实验已经提交判定；请新开涂片重做。', snapshot());
    session.idempotency.set(input.clientEventId, response);
    return response;
  }

  if (input.action === 'start') {
    if (session.status === 'invalid') {
      const response = failure('SESSION_INVALID', '操作序列已失效，请新开涂片重做。', snapshot());
      session.idempotency.set(input.clientEventId, response);
      return response;
    }

    if (session.active?.reagent === input.reagent) {
      reject(session, input, 'DUPLICATE_ACTIVE_REAGENT', `${label}正在作用中，不要重复滴加；等待计时结束后再停止。`, false);
      const response = failure('DUPLICATE_ACTIVE_REAGENT', `${label}正在作用中，重复滴加未被记录。`, snapshot());
      session.idempotency.set(input.clientEventId, response);
      return response;
    }

    if (session.active) {
      const activeLabel = REAGENT_LABELS[session.active.reagent];
      reject(
        session,
        input,
        'OVERLAPPING_REAGENT',
        `${activeLabel}尚未停止就改滴${label}，两个试剂的接触时间无法区分，标准差分染色已被破坏。`,
        true
      );
      session.active = null;
      session.events.pop();
      const response = failure('OVERLAPPING_REAGENT', `必须先结束${activeLabel}，不能在其作用中改滴${label}。`, snapshot());
      session.idempotency.set(input.clientEventId, response);
      return response;
    }

    const completed = completedReagents(session);
    const expectedIndex = GRAM_REAGENTS.findIndex((reagent) => !completed.has(reagent));
    const expected = GRAM_REAGENTS[expectedIndex];

    if (input.reagent !== expected) {
      const expectedLabel = REAGENT_LABELS[expected];
      const message =
        completed.has(input.reagent)
          ? `${label}这一步已经完成；再次滴加会重复染色并改变标准接触时间，实验作废。`
          : `现在应先完成${expectedLabel}。跳过该步骤直接使用${label}，无法得到可解释的差分结果，实验作废。`;
      reject(session, input, 'OUT_OF_ORDER', message, true);
      const response = failure('OUT_OF_ORDER', message, snapshot());
      session.idempotency.set(input.clientEventId, response);
      return response;
    }

    const event: SessionAcceptedEvent = {
      id: crypto.randomUUID(),
      clientEventId: input.clientEventId,
      reagent: input.reagent,
      startOffsetMs: offset(session, now),
      startServerMs: now,
      durationMs: null,
      stopServerMs: null,
    };
    session.events.push(event);
    session.active = { reagent: input.reagent, startedAt: now };
    session.lastTouchedAt = now;
    const response = success(snapshot());
    session.idempotency.set(input.clientEventId, response);
    return response;
  }

  // stop
  if (!session.active) {
    reject(session, input, 'NO_ACTIVE_REAGENT', '当前没有正在作用的试剂，停止操作不会改变玻片。', false);
    const response = failure('NO_ACTIVE_REAGENT', '当前没有正在作用的试剂；请按顺序开始下一步。', snapshot());
    session.idempotency.set(input.clientEventId, response);
    return response;
  }

  if (session.active.reagent !== input.reagent) {
    const activeLabel = REAGENT_LABELS[session.active.reagent];
    reject(
      session,
      input,
      'STOP_REAGENT_MISMATCH',
      `当前作用中的是${activeLabel}，不能用“停止${label}”来结束它。`,
      false
    );
    const response = failure('STOP_REAGENT_MISMATCH', `请停止当前正在作用的${activeLabel}。`, snapshot());
    session.idempotency.set(input.clientEventId, response);
    return response;
  }

  const activeEvent = [...session.events].reverse().find((event) => event.reagent === input.reagent && event.durationMs === null);
  if (!activeEvent) {
    reject(session, input, 'ACTIVE_EVENT_MISSING', '服务端找不到该试剂的开始记录。', true);
    const response = failure('ACTIVE_EVENT_MISSING', '开始记录缺失，无法计算真实接触时长。', snapshot());
    session.idempotency.set(input.clientEventId, response);
    return response;
  }

  const duration = Math.max(0, now - activeEvent.startServerMs);
  activeEvent.durationMs = duration;
  activeEvent.stopServerMs = now;
  session.active = null;
  session.lastTouchedAt = now;
  const response = success(snapshot());
  session.idempotency.set(input.clientEventId, response);
  return response;
}

export function submitGramVerdict(
  sessionId: string,
  choice: GramVerdict,
  clientAttemptId: string
): IdempotentResponse {
  const session = sessions.get(sessionId);
  const now = Date.now();
  if (!session) return failure('SESSION_NOT_FOUND', '实验会话不存在或已过期。', undefined, 404);

  const cached = session.idempotency.get(clientAttemptId);
  if (cached) return cached;

  if (session.status === 'judged' && session.result) {
    const response = failure('ALREADY_JUDGED', '本次实验已经提交判定；请新开涂片重做。', toSnapshot(session, now));
    session.idempotency.set(clientAttemptId, response);
    return response;
  }

  if (session.active) {
    const response = failure(
      'STEP_STILL_ACTIVE',
      `${REAGENT_LABELS[session.active.reagent]}尚未停止，服务端还不能计算这一步时长。`,
      toSnapshot(session, now)
    );
    session.idempotency.set(clientAttemptId, response);
    return response;
  }

  const completed = completedReagents(session);
  const missing = GRAM_REAGENTS.filter((reagent) => !completed.has(reagent));
  if (session.status === 'active' && missing.length > 0) {
    const response = failure(
      'PROTOCOL_INCOMPLETE',
      `还缺少：${missing.map((reagent) => REAGENT_LABELS[reagent]).join('、')}，不能提交判定。`,
      toSnapshot(session, now)
    );
    session.idempotency.set(clientAttemptId, response);
    return response;
  }

  session.result = evaluateGramLog({
    specimen: session.specimen,
    events: session.events.map(toAcceptedEvent),
    rejected: session.rejected.map(toRejectedEvent),
    choice,
  });
  session.status = 'judged';
  session.lastTouchedAt = now;
  const response = success(toSnapshot(session, now));
  session.idempotency.set(clientAttemptId, response);
  return response;
}

export function getGramReplay(sessionId: string): GramReplay | null {
  const session = sessions.get(sessionId);
  if (!session || session.status !== 'judged') return null;
  return replay(session);
}

export type { GramEventAction };
