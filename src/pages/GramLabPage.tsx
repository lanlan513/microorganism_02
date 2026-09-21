import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FlaskConical,
  History,
  Play,
  RefreshCw,
  Square,
} from 'lucide-react';
import type {
  ActionId,
  ClaimId,
  LabEvent,
  ReplayResponse,
  SessionEnvelope,
} from '../../shared/gram-types';
import { gramApi } from '../utils/gramApi';
import { MicroscopeField } from '../components/gram/MicroscopeField';

const STORAGE_KEY = 'gram-lab-session-id';

const ACTION_META: Array<{
  id: ActionId;
  name: string;
  instruction: string;
  recommended: string;
}> = [
  { id: 'crystal_violet', name: '滴结晶紫', instruction: '初染所有细胞', recommended: '推荐 30–90 秒' },
  { id: 'iodine', name: '加碘液', instruction: '形成 CV-I 复合物', recommended: '推荐 20–90 秒' },
  { id: 'alcohol', name: '酒精脱色', instruction: '真正决定结果的计时步骤', recommended: '推荐 5–12 秒，超过 20 秒失效' },
  { id: 'safranin', name: '番红复染', instruction: '给脱色细胞复染', recommended: '推荐 30–90 秒' },
  { id: 'water', name: '清水冲洗', instruction: '每一步试剂结束后冲洗', recommended: '一次性操作' },
];

const STAGE_LABELS: Record<string, string> = {
  ready: '空白视野',
  crystal_violet: '结晶紫作用中',
  after_crystal_violet_wash: '结晶紫后已冲洗',
  iodine: '碘液作用中',
  after_iodine_wash: '碘液后已冲洗',
  alcohol: '酒精脱色中',
  after_alcohol_wash: '脱色后已冲洗',
  safranin: '番红作用中',
  complete: '复染后已冲洗，等待判读',
};

const CLAIMS: Array<{ id: ClaimId; label: string; symbol: string }> = [
  { id: 'gram_positive', label: '革兰阳性', symbol: 'G+ 紫黑 / 密点' },
  { id: 'gram_negative', label: '革兰阴性', symbol: 'G− 红 / 开口线' },
  { id: 'fungi', label: '真菌，不做阴阳判定', symbol: '芽生环 / 芽体' },
  { id: 'unreliable', label: '结果不可靠，重制涂片', symbol: '叉纹 / 颜色混杂' },
];

function formatTime(timestamp: number | null) {
  if (timestamp === null) return '—';
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })
    + `.${String(timestamp % 1000).padStart(3, '0')}`;
}

function eventLabel(event: LabEvent) {
  const meta = ACTION_META.find((item) => item.id === event.type);
  if (meta) return meta.name;
  if (event.type === 'rejected_action') return `拒绝：${ACTION_META.find((item) => item.id === event.attemptedAction)?.name ?? '非法操作'}`;
  if (event.type === 'claim') return '提交结论';
  return '系统';
}

function syncFromEnvelope(setEnvelope: (value: SessionEnvelope) => void, data?: SessionEnvelope) {
  if (data) setEnvelope(data);
}

export function GramLabPage() {
  const [envelope, setEnvelope] = useState<SessionEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<ActionId | null>(null);
  const [filterMode, setFilterMode] = useState<'none' | 'deuteranopia' | 'grayscale'>('none');
  const [replay, setReplay] = useState<ReplayResponse | null>(null);
  const [replayAt, setReplayAt] = useState<number | null>(null);
  const initializedRef = useRef(false);

  const loadNewSession = useCallback(async () => {
    setError(null);
    setReplay(null);
    setReplayAt(null);
    const data = await gramApi.create();
    localStorage.setItem(STORAGE_KEY, data.session.id);
    setEnvelope(data);
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const savedId = localStorage.getItem(STORAGE_KEY);
    const initial = savedId
      ? gramApi.get(savedId).catch(async (requestError) => {
          localStorage.removeItem(STORAGE_KEY);
          setError(`${requestError.message} 已创建新实验。`);
          return gramApi.create();
        })
      : gramApi.create();

    initial.then((data) => {
      localStorage.setItem(STORAGE_KEY, data.session.id);
      setEnvelope(data);
    }).catch((requestError) => {
      setError(requestError.message);
    });
  }, []);

  const session = envelope?.session ?? null;
  const liveFrame = envelope?.frame ?? null;
  const activeAction = liveFrame?.activeAction ?? null;

  const sessionId = session?.id;
  useEffect(() => {
    if (!sessionId || !activeAction) return undefined;
    const timer = window.setInterval(() => {
      gramApi.get(sessionId)
        .then((data) => setEnvelope(data))
        .catch(() => undefined);
    }, 500);
    return () => window.clearInterval(timer);
  }, [sessionId, activeAction]);

  const callAction = useCallback(async (action: ActionId, kind: 'start' | 'end') => {
    if (!session) return;
    setBusyAction(action);
    setError(null);
    try {
      const data = kind === 'start'
        ? await gramApi.start(session.id, action)
        : await gramApi.end(session.id, action);
      setEnvelope(data);
      setReplay(null);
      setReplayAt(null);
    } catch (requestError) {
      const err = requestError as Error & { data?: SessionEnvelope };
      setError(err.message);
      syncFromEnvelope(setEnvelope, err.data);
    } finally {
      setBusyAction(null);
    }
  }, [session]);

  const submitClaim = useCallback(async (claim: ClaimId) => {
    if (!session) return;
    setBusyAction('water');
    setError(null);
    try {
      const data = await gramApi.claim(session.id, claim);
      setEnvelope(data);
      setReplay(null);
      setReplayAt(null);
    } catch (requestError) {
      const err = requestError as Error & { data?: SessionEnvelope };
      setError(err.message);
      syncFromEnvelope(setEnvelope, err.data);
    } finally {
      setBusyAction(null);
    }
  }, [session]);

  const viewReplayFrame = useCallback(async (at: number) => {
    if (!session) return;
    setReplayAt(at);
    const data = await gramApi.replay(session.id, at);
    setReplay(data);
  }, [session]);

  const downloadLog = useCallback(() => {
    if (!session) return;
    const blob = new Blob([JSON.stringify({
      sessionId: session.id,
      specimenCode: session.specimenCode,
      logHash: session.logHash,
      events: session.events,
      grade: session.grade,
    }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gram-stain-${session.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [session]);

  const frame = replay?.frame ?? liveFrame;
  const eventCount = session?.events.filter((event) => event.type !== 'system').length ?? 0;
  const replayRange = useMemo(() => {
    if (!session?.completedAt) return null;
    return { min: session.startedAt, max: session.completedAt };
  }, [session?.completedAt, session?.startedAt]);

  if (!envelope || !frame) {
    return (
      <div className="container mx-auto flex min-h-[70vh] items-center justify-center px-6 pt-28">
        <div className="glass-card p-8 text-center">
          <RefreshCw className="mx-auto mb-4 h-8 w-8 animate-spin text-glow-primary" />
          <p className="text-text-muted">正在从服务端恢复显微镜视野……</p>
          {error && <p className="mt-4 text-sm text-glow-red">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 pb-20 pt-28">
      <svg width="0" height="0" className="absolute">
        <filter id="gram-deuteranopia-filter">
          <feColorMatrix type="matrix" values="
            0.367 0.861 -0.228 0 0
            0.280 0.673 0.047 0 0
            -0.012 0.043 0.969 0 0
            0 0 0 1 0" />
        </filter>
      </svg>

      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-glow-primary">Server-authoritative Gram stain</p>
          <h1 className="font-display text-4xl font-bold text-text-light md:text-5xl">革兰染色判读实验</h1>
          <p className="mt-3 max-w-3xl text-text-muted">
            前端只记录“开始/结束”操作；时长、细胞壁类型、减色光谱、分数和重放画面全部由服务端根据日志重算。
          </p>
        </div>
        <button onClick={() => void loadNewSession()} className="btn-primary-ghost whitespace-nowrap">
          <RefreshCw className="h-4 w-4" /> 随机领取新涂片
        </button>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-glow-orange/40 bg-glow-orange/10 p-4 text-sm text-orange-100">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-glow-orange" />
          <div>
            <strong>这次操作没有生效：</strong>{error}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="glass-card p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-text-light">{session.specimenCode} · {session.specimenLabel}</h2>
              <p className="mt-1 text-sm text-text-muted">{STAGE_LABELS[frame.stage]} · 服务端事件 {eventCount}</p>
            </div>
            <div className="flex rounded-full border border-white/10 p-1 text-xs">
              {([
                ['none', '正常色'],
                ['deuteranopia', '绿色盲'],
                ['grayscale', '灰度'],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={`rounded-full px-3 py-1.5 ${filterMode === mode ? 'bg-glow-primary text-slate-950' : 'text-text-muted hover:text-white'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <MicroscopeField frame={frame} filterMode={filterMode} />

          <div className="mt-5 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
            <div className="rounded-xl bg-white/5 p-3">
              <div className="font-bold text-violet-200">G+ 标记</div>
              <div className="mt-1 text-text-muted">密集圆点 + 文字 G+</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className="font-bold text-red-200">G− 标记</div>
              <div className="mt-1 text-text-muted">开口平行线 + 文字 G−</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className="font-bold text-amber-100">真菌</div>
              <div className="mt-1 text-text-muted">芽体/环状纹理 + 文字</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className="font-bold text-slate-200">失败</div>
              <div className="mt-1 text-text-muted">交叉裂纹 + “不可靠”</div>
            </div>
          </div>

          {frame.warnings.length > 0 && (
            <div className="mt-4 rounded-xl border border-glow-gold/30 bg-glow-gold/10 p-3 text-sm text-yellow-100">
              {frame.warnings.map((warning) => <p key={warning}>• {warning}</p>)}
            </div>
          )}
        </section>

        <section className="space-y-6">
          <div className="glass-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-glow-primary" />
              <h2 className="text-xl font-semibold">操作台</h2>
            </div>
            <div className="space-y-3">
              {ACTION_META.map((action) => {
                const isActive = activeAction === action.id;
                const disabled = busyAction !== null;
                return (
                  <div key={action.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-slate-950/30 p-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-semibold text-text-light">{action.name}</div>
                      <div className="text-sm text-text-muted">{action.instruction}</div>
                      <div className="mt-1 font-mono text-[11px] text-glow-primary/80">{action.recommended}</div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {action.id === 'water' ? (
                        <button
                          disabled={disabled}
                          onClick={() => void callAction('water', 'start')}
                          className="rounded-full bg-sky-400/90 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"
                        >
                          冲洗
                        </button>
                      ) : isActive ? (
                        <>
                          <div className="rounded-full bg-glow-red/15 px-4 py-2 font-mono text-sm text-red-100">
                            {((frame.activeElapsedMs ?? 0) / 1000).toFixed(1)}s
                          </div>
                          <button
                            disabled={disabled}
                            onClick={() => void callAction(action.id, 'end')}
                            className="inline-flex items-center gap-1 rounded-full bg-glow-red px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                          >
                            <Square className="h-3.5 w-3.5" /> 结束
                          </button>
                        </>
                      ) : (
                        <button
                          disabled={disabled || activeAction !== null || session.status === 'complete'}
                          onClick={() => void callAction(action.id, 'start')}
                          className="inline-flex items-center gap-1 rounded-full border border-glow-primary/50 px-4 py-2 text-sm font-bold text-glow-primary disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          <Play className="h-3.5 w-3.5" /> 开始
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <Eye className="h-5 w-5 text-glow-primary" /> 最终判读
              </h2>
              <button onClick={downloadLog} className="btn-primary-ghost px-3 py-1.5 text-xs">
                <Download className="h-3.5 w-3.5" /> 日志
              </button>
            </div>
            {session.status !== 'complete' ? (
              <p className="rounded-xl bg-white/5 p-4 text-sm text-text-muted">
                按顺序完成：结晶紫 → 冲洗 → 碘液 → 冲洗 → 酒精 → 冲洗 → 番红 → 冲洗。未完成前服务端不会接受结论。
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {CLAIMS.map((claim) => (
                  <button
                    key={claim.id}
                    disabled={Boolean(session.claim) || busyAction !== null}
                    onClick={() => void submitClaim(claim.id)}
                    className="rounded-xl border border-white/10 bg-white/5 p-3 text-left disabled:cursor-not-allowed hover:border-glow-primary/60 hover:bg-glow-primary/10 disabled:hover:border-white/10 disabled:hover:bg-white/5"
                  >
                    <div className="font-bold text-text-light">{claim.label}</div>
                    <div className="mt-1 text-xs text-text-muted">{claim.symbol}</div>
                  </button>
                ))}
              </div>
            )}
            {session.grade && (
              <div className={`mt-4 rounded-xl border p-4 ${session.grade.claimCorrect ? 'border-glow-primary/40 bg-glow-primary/10' : 'border-glow-red/40 bg-glow-red/10'}`}>
                <div className="flex items-center gap-2 text-lg font-bold">
                  {session.grade.claimCorrect ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                  {session.grade.score} 分：{session.grade.claimCorrect ? '判读正确' : '判读错误'}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-black/20 p-2">序列 {session.grade.sequenceScore}/40</div>
                  <div className="rounded-lg bg-black/20 p-2">时长 {session.grade.timingScore}/30</div>
                  <div className="rounded-lg bg-black/20 p-2">结论 {session.grade.claimScore}/30</div>
                </div>
                <ul className="mt-3 space-y-2 text-sm text-text-light">
                  {session.grade.reasons.map((reason) => <li key={reason}>• {reason}</li>)}
                </ul>
              </div>
            )}
          </div>

          {session.status === 'complete' && replayRange && (
            <div className="glass-card p-6">
              <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold">
                <History className="h-5 w-5 text-glow-primary" /> 日志重放
              </h2>
              <input
                type="range"
                min={replayRange.min}
                max={replayRange.max}
                step={100}
                value={replayAt ?? replayRange.max}
                onChange={(event) => void viewReplayFrame(Number(event.target.value))}
                className="w-full accent-cyan-300"
              />
              <p className="mt-2 font-mono text-xs text-text-muted">
                重放点：{formatTime(replayAt ?? replayRange.max)} · SHA-256：
                <span className="ml-1 break-all text-glow-primary/80">{session.logHash.slice(0, 24)}…</span>
              </p>
              <p className="mt-2 text-xs text-text-muted">拖动时前端不计算颜色，只把时间戳交回服务端；服务端按同一日志重新生成该帧。</p>
            </div>
          )}
        </section>
      </div>

      <section className="glass-card mt-6 p-6">
        <h2 className="mb-4 text-xl font-semibold">服务端操作日志</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-text-muted">
              <tr>
                <th className="pb-3">#</th>
                <th className="pb-3">事件</th>
                <th className="pb-3">开始</th>
                <th className="pb-3">结束</th>
                <th className="pb-3">说明</th>
              </tr>
            </thead>
            <tbody>
              {session.events.map((event) => (
                <tr key={event.id} className="border-t border-white/10 align-top">
                  <td className="py-2 pr-3 font-mono text-text-muted">{event.index}</td>
                  <td className={`py-2 pr-3 font-semibold ${event.type === 'rejected_action' ? 'text-glow-orange' : 'text-text-light'}`}>
                    {eventLabel(event)}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-text-muted">{formatTime(event.startedAt)}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-text-muted">{formatTime(event.endedAt)}</td>
                  <td className="py-2 text-text-muted">{event.reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
