import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  History,
  Lock,
  Play,
  RefreshCw,
  ShieldCheck,
  SkipForward,
  XCircle,
} from 'lucide-react';
import {
  FRAME_INTERVAL_MS,
  MORPHOLOGY_LABELS,
  REAGENT_GUIDANCE,
  REAGENT_LABELS,
  VERDICT_LABELS,
  generateCells,
  simulateGram,
  type AcceptedGramEvent,
  type GramReagent,
  type GramReplay,
  type GramSessionSnapshot,
  type GramVerdict,
} from '../../shared/gram';
import { ApiOperationError, gramApi } from '../utils/gramApi';
import { MicroscopeField } from '../components/gram/MicroscopeField';
import type { ColorVisionMode } from '../components/gram/colorVision';

const reagentOrder: GramReagent[] = ['crystal_violet', 'iodine', 'alcohol', 'safranin'];
const verdictChoices: GramVerdict[] = ['positive', 'negative', 'not_bacteria'];

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatClock(totalSeconds: number): string {
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function eventDurations(events: AcceptedGramEvent[]): Map<GramReagent, number> {
  const result = new Map<GramReagent, number>();
  events.forEach((event) => {
    if (event.durationMs !== null) result.set(event.reagent, event.durationMs);
  });
  return result;
}

function nextReagent(events: AcceptedGramEvent[]): GramReagent {
  const completed = new Set(events.filter((event) => event.durationMs !== null).map((event) => event.reagent));
  return reagentOrder.find((reagent) => !completed.has(reagent)) ?? 'safranin';
}

function PatternLegend({ verdict }: { verdict: GramVerdict }) {
  const common = 'w-7 h-7 rounded-lg border border-white/30';
  if (verdict === 'positive') {
    return (
      <svg className={common} viewBox="0 0 28 28" aria-hidden="true">
        <rect width="28" height="28" rx="7" fill="#e8f5f2" />
        {[4, 10, 16, 22].flatMap((x) =>
          [4, 10, 16, 22].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.7} fill="#101828" />)
        )}
        <text x="14" y="18" textAnchor="middle" fontSize="13" fontWeight="900" fill="#101828">+</text>
      </svg>
    );
  }
  if (verdict === 'negative') {
    return (
      <svg className={common} viewBox="0 0 28 28" aria-hidden="true">
        <rect width="28" height="28" rx="7" fill="#ffe7dc" />
        {[5, 11, 17, 23].map((y) => (
          <path key={y} d={`M3 ${y} H11 M15 ${y} H25`} stroke="#101828" strokeWidth={2} strokeLinecap="round" />
        ))}
        <line x1="9" y1="14" x2="19" y2="14" stroke="#101828" strokeWidth={2.4} />
      </svg>
    );
  }
  return (
    <svg className={common} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="#fff8cb" strokeDasharray="5 3" stroke="#101828" />
      <path d="M-2 28 L28 -2 M5 30 L30 5" stroke="#101828" strokeWidth={1.7} />
      <text x="14" y="18" textAnchor="middle" fontSize="13" fontWeight="900" fill="#101828">F</text>
    </svg>
  );
}

export function GramLabPage() {
  const [session, setSession] = useState<GramSessionSnapshot | null>(null);
  const [activeStartedAtLocal, setActiveStartedAtLocal] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pendingEvent, setPendingEvent] = useState<GramReagent | null>(null);
  const [pendingVerdict, setPendingVerdict] = useState(false);
  const [starting, setStarting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'info'; message: string } | null>(null);
  const [colorVision, setColorVision] = useState<ColorVisionMode>('normal');
  const [replay, setReplay] = useState<GramReplay | null>(null);
  const [mode, setMode] = useState<'live' | 'replay'>('live');
  const [replayAt, setReplayAt] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const replayStartedAtRef = useRef<{ local: number; logical: number } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);

  const applySnapshot = useCallback((snapshot: GramSessionSnapshot) => {
    setSession(snapshot);
    setActiveStartedAtLocal(snapshot.activeReagent ? Date.now() - snapshot.activeElapsedMs : null);
  }, []);

  const startSession = useCallback(async () => {
    setStarting(true);
    setFeedback(null);
    try {
      const snapshot = await gramApi.createSession();
      window.localStorage.setItem('gram-session-id', snapshot.sessionId);
      setReplay(null);
      setMode('live');
      applySnapshot(snapshot);
    } catch (error) {
      setFeedback({ type: 'error', message: (error as Error).message });
    } finally {
      setStarting(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    const sessionId = window.localStorage.getItem('gram-session-id');
    if (!sessionId) return;
    gramApi.getSession(sessionId).then(applySnapshot).catch(() => {
      window.localStorage.removeItem('gram-session-id');
    });
  }, [applySnapshot]);

  // 颜色帧由服务端按真实经过时间计算；活动期间轮询，防止前端本地推导动力学常数。
  useEffect(() => {
    if (!session?.activeReagent || session.status !== 'active') return;
    const timer = window.setInterval(() => {
      gramApi
        .getSession(session.sessionId)
        .then((snapshot) => setSession(snapshot))
        .catch(() => undefined);
    }, 250);
    return () => window.clearInterval(timer);
  }, [applySnapshot, session?.activeReagent, session?.sessionId, session?.status]);

  const cells = useMemo(
    () => (session ? generateCells(session.specimen.morphologyType, session.specimen.seed) : []),
    [session]
  );

  const liveAtMs = useMemo(() => {
    if (!session) return 0;
    const activeEvent = session.events.find((event) => event.durationMs === null);
    if (activeEvent && activeStartedAtLocal !== null) {
      return activeEvent.startOffsetMs + Math.max(0, now - activeStartedAtLocal);
    }
    return session.events.reduce(
      (max, event) => (event.durationMs === null ? max : Math.max(max, event.startOffsetMs + event.durationMs)),
      0
    );
  }, [activeStartedAtLocal, now, session]);

  const liveFrame = session?.frame ?? null;

  const replayFrame = useMemo(() => {
    if (!session || !replay || cells.length === 0) return null;
    const simulation = simulateGram(replay.events, {
      decolorRate: replay.specimen.kinetics.decolorRate,
      cells,
      atMs: replayAt,
      frameIntervalMs: Number.MAX_SAFE_INTEGER,
    });
    return simulation.frames.filter((frame) => frame.atMs <= replayAt + 0.001).at(-1) ?? simulation.frames[0];
  }, [cells, replay, replayAt, session]);

  const currentFrame = mode === 'replay' ? replayFrame : liveFrame;
  const durations = useMemo(() => eventDurations(session?.events ?? []), [session]);
  const expected = useMemo(() => nextReagent(session?.events ?? []), [session]);

  const sendEvent = useCallback(
    async (action: 'start' | 'stop', reagent: GramReagent) => {
      if (!session) return;
      setPendingEvent(reagent);
      setFeedback(null);
      try {
        const snapshot = await gramApi.sendEvent(session.sessionId, {
          clientEventId: crypto.randomUUID(),
          action,
          reagent,
        });
        applySnapshot(snapshot);
      } catch (error) {
        if (error instanceof ApiOperationError && error.snapshot) applySnapshot(error.snapshot);
        setFeedback({
          type: 'error',
          message: error instanceof Error ? error.message : '操作未被服务端接受',
        });
      } finally {
        setPendingEvent(null);
      }
    },
    [applySnapshot, session]
  );

  const submitVerdict = useCallback(
    async (choice: GramVerdict) => {
      if (!session) return;
      setPendingVerdict(true);
      setFeedback(null);
      try {
        const snapshot = await gramApi.submitVerdict(session.sessionId, choice, crypto.randomUUID());
        applySnapshot(snapshot);
      } catch (error) {
        if (error instanceof ApiOperationError && error.snapshot) applySnapshot(error.snapshot);
        setFeedback({ type: 'error', message: (error as Error).message });
      } finally {
        setPendingVerdict(false);
      }
    },
    [applySnapshot, session]
  );

  const loadReplay = useCallback(async () => {
    if (!session) return;
    const data = await gramApi.getReplay(session.sessionId);
    setReplay(data);
    setMode('replay');
    setReplayAt(0);
    setReplayPlaying(true);
    replayStartedAtRef.current = { local: performance.now(), logical: 0 };
  }, [session]);

  useEffect(() => {
    if (!replayPlaying || !replay) return;
    let raf = 0;
    const tick = (time: number) => {
      const started = replayStartedAtRef.current;
      if (!started) return;
      const elapsed = time - started.local;
      const next = Math.min(replay.durationMs, started.logical + elapsed);
      setReplayAt(next);
      if (next >= replay.durationMs) {
        setReplayPlaying(false);
      } else {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [replay, replayPlaying]);

  const toggleReplayPlayback = () => {
    if (!replay) return;
    if (!replayPlaying && replayAt >= replay.durationMs) {
      setReplayAt(0);
      replayStartedAtRef.current = { local: performance.now(), logical: 0 };
    } else if (!replayPlaying) {
      replayStartedAtRef.current = { local: performance.now(), logical: replayAt };
    }
    setReplayPlaying((value) => !value);
  };

  const allLogs = useMemo(() => {
    const source = replay ?? session;
    if (!source) return [];
    return [
      ...source.events.map((event) => ({ at: event.startOffsetMs, kind: 'event' as const, event })),
      ...source.rejected.map((event) => ({ at: event.atOffsetMs, kind: 'rejected' as const, event })),
    ].sort((a, b) => a.at - b.at);
  }, [replay, session]);

  const status = session?.status ?? 'active';
  const result = session?.result ?? null;

  return (
    <div className="container mx-auto px-4 md:px-6 pt-28 pb-20">
      <div className="mb-8 max-w-4xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-glow-primary/30 bg-glow-primary/5 text-glow-primary text-xs font-mono mb-4">
          <ShieldCheck className="w-4 h-4" />
          Server-authoritative Gram stain
        </div>
        <h1 className="font-display text-4xl md:text-6xl font-bold text-text-light mb-4">
          革兰染色：可重放的差分实验
        </h1>
        <p className="text-text-muted leading-relaxed">
          浏览器只发送“开始/停止”操作。菌种细胞壁、真实接触秒数、序列合法性、光谱颜色和分数均由服务端根据日志计算；
          页面刷新后凭会话继续，结束后可按同一日志逐帧重放。
        </p>
      </div>

      {!session ? (
        <div className="glass-card p-10 md:p-14 text-center">
          <FlaskConical className="w-14 h-14 text-glow-primary mx-auto mb-5" />
          <h2 className="font-display text-3xl text-text-light mb-3">准备一张未知涂片</h2>
          <p className="text-text-muted max-w-2xl mx-auto mb-8">
            服务端会随机给出细菌或真菌，并只暴露形态线索。真正的细胞壁类型不会进入初始前端状态。
          </p>
          <button className="btn-primary" onClick={startSession} disabled={starting}>
            {starting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            开始空白视野
          </button>
        </div>
      ) : (
        <div className="grid xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] gap-6">
          <section className="space-y-5">
            <div className="glass-card p-4 md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <p className="font-mono text-xs text-text-muted tracking-widest uppercase">Unknown smear</p>
                  <h2 className="text-2xl font-semibold text-text-light">{session.specimen.code}</h2>
                  <p className="text-sm text-text-muted">{MORPHOLOGY_LABELS[session.specimen.morphologyType]}</p>
                  <p className="text-xs text-text-muted mt-1">{session.specimen.clue}</p>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono">
                  <Lock className="w-4 h-4 text-glow-gold" />
                  <span className="text-text-muted">细胞壁答案服务端保留</span>
                </div>
              </div>

              <div className="relative aspect-square max-h-[650px] rounded-full overflow-hidden border border-white/10 bg-black shadow-2xl">
                {currentFrame && (
                  <MicroscopeField
                    frame={currentFrame}
                    morphology={session.specimen.morphologyType}
                    seed={session.specimen.seed}
                    verdict={mode === 'replay' || status === 'judged' ? result?.choice ?? null : null}
                    colorVision={colorVision}
                  />
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {(['normal', 'protanopia', 'deuteranopia', 'tritanopia'] as ColorVisionMode[]).map((modeOption) => (
                    <button
                      key={modeOption}
                      onClick={() => setColorVision(modeOption)}
                      className={`px-3 py-1.5 rounded-full text-xs font-mono border transition ${
                        colorVision === modeOption
                          ? 'bg-glow-primary/20 border-glow-primary text-glow-primary'
                          : 'border-white/15 text-text-muted hover:text-text-light'
                      }`}
                    >
                      {modeOption === 'normal' ? '正常色觉' : modeOption === 'protanopia' ? '红色盲' : modeOption === 'deuteranopia' ? '绿色盲' : '蓝色盲'}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-text-muted font-mono">
                  {mode === 'replay' ? `回放 ${formatClock(replayAt / 1000)}` : `实验计时 ${formatClock(liveAtMs / 1000)}`}
                </div>
              </div>
            </div>

            {status === 'judged' && replay && (
              <div className="glass-card p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-glow-primary" />
                    <h3 className="text-lg font-semibold text-text-light">操作日志重放</h3>
                  </div>
                  <span className="font-mono text-[10px] text-text-muted break-all">SHA-256: {replay.checksum}</span>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={toggleReplayPlayback} className="btn-primary-ghost px-4 py-2">
                    <Play className="w-4 h-4" />
                    {replayPlaying ? '暂停' : replayAt >= replay.durationMs ? '重播' : '播放'}
                  </button>
                  <input
                    className="flex-1 accent-[#00ffc8]"
                    type="range"
                    min={0}
                    max={replay.durationMs}
                    step={FRAME_INTERVAL_MS}
                    value={replayAt}
                    onChange={(event) => {
                      setReplayPlaying(false);
                      setReplayAt(Number(event.target.value));
                    }}
                  />
                  <span className="font-mono text-xs text-text-muted w-16 text-right">{formatMs(replayAt)}</span>
                </div>
                <p className="text-xs text-text-muted mt-3">
                  被拒绝的错误操作也在日志中，但不会进入化学反应；它们只作为审计标记出现。
                </p>
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-text-light">试剂序列</h3>
                <span className={`text-xs font-mono px-2 py-1 rounded-full ${
                  status === 'invalid'
                    ? 'bg-glow-red/15 text-glow-red border border-glow-red/40'
                    : status === 'judged'
                      ? 'bg-glow-primary/15 text-glow-primary border border-glow-primary/40'
                      : 'bg-white/5 text-text-muted border border-white/10'
                }`}>
                  {status === 'invalid' ? '序列失效' : status === 'judged' ? '已判定' : '进行中'}
                </span>
              </div>

              <div className="space-y-3">
                {reagentOrder.map((reagent, index) => {
                  const active = session.activeReagent === reagent && mode === 'live';
                  const completed = durations.has(reagent);
                  const isExpected = expected === reagent && !session.activeReagent && status === 'active';
                  const duration = active && activeStartedAtLocal !== null
                    ? now - activeStartedAtLocal
                    : durations.get(reagent) ?? 0;
                  const guidance = REAGENT_GUIDANCE[reagent];
                  return (
                    <div
                      key={reagent}
                      className={`rounded-2xl border p-4 ${
                        active
                          ? 'border-glow-gold/70 bg-glow-gold/10'
                          : completed
                            ? 'border-glow-primary/35 bg-glow-primary/5'
                            : isExpected
                              ? 'border-glow-primary/20 bg-white/[0.03]'
                              : 'border-white/10 bg-white/[0.02] opacity-70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-text-light">
                            {index + 1}. {REAGENT_LABELS[reagent]}
                          </p>
                          <p className="text-xs text-text-muted mt-1">{guidance.hint}</p>
                          <p className="font-mono text-[11px] text-text-muted mt-2">
                            推荐 {guidance.good[0]}–{guidance.good[1]} 秒
                          </p>
                        </div>
                        <div className="text-right font-mono">
                          <div className={`text-xl ${active ? 'text-glow-gold' : completed ? 'text-glow-primary' : 'text-text-muted'}`}>
                            {formatClock(duration / 1000)}
                          </div>
                          <div className="text-[10px] text-text-muted">{active ? '作用中' : completed ? formatMs(duration) : '未开始'}</div>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          className="flex-1 rounded-full border border-glow-primary/40 text-glow-primary bg-glow-primary/10 hover:bg-glow-primary/20 disabled:opacity-40 px-3 py-2 text-sm"
                          disabled={pendingEvent !== null || status === 'judged' || (active ?? false)}
                          onClick={() => void sendEvent('start', reagent)}
                        >
                          {active ? '作用中' : completed ? '重复滴加' : reagent === 'alcohol' ? '滴酒精' : '开始滴加'}
                        </button>
                        <button
                          className="flex-1 rounded-full border border-white/20 text-text-light hover:bg-white/10 disabled:opacity-40 px-3 py-2 text-sm"
                          disabled={pendingEvent !== null || status === 'judged' || !active}
                          onClick={() => void sendEvent('stop', reagent)}
                        >
                          停止并水洗
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {feedback && (
                <div className="mt-4 rounded-xl border border-glow-red/40 bg-glow-red/10 p-3 text-sm text-glow-red flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{feedback.message}</span>
                </div>
              )}
              {status === 'invalid' && !feedback && (
                <div className="mt-4 rounded-xl border border-glow-red/40 bg-glow-red/10 p-3 text-sm text-glow-red flex gap-2">
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>错误序列没有静默通过；玻片已标记失效。</span>
                </div>
              )}
            </div>

            <div className="glass-card p-5">
              <h3 className="text-lg font-semibold text-text-light mb-3">提交判读</h3>
              {status === 'judged' ? (
                <div className="space-y-4">
                  <div className={`rounded-2xl border p-4 ${result?.correct ? 'border-glow-primary/40 bg-glow-primary/10' : 'border-glow-red/40 bg-glow-red/10'}`}>
                    <div className="flex items-center gap-3">
                      {result?.correct ? <CheckCircle2 className="w-6 h-6 text-glow-primary" /> : <XCircle className="w-6 h-6 text-glow-red" />}
                      <div>
                        <p className="font-semibold text-text-light">{result?.choice ? VERDICT_LABELS[result.choice] : '未选择'}</p>
                        <p className="font-mono text-sm text-text-muted">总分 {result?.score} / 100（技术 {result?.techniqueScore}，判读 {result?.identificationScore}）</p>
                      </div>
                    </div>
                  </div>

                  {result && (
                    <div className="flex items-start gap-3">
                      <PatternLegend verdict={result.choice ?? 'positive'} />
                      <p className="text-sm text-text-muted">
                        结论同时用文字、点状/短线/斜纹纹理和 + / − / F 标记表达；即使红紫不可区分，也能识别。
                      </p>
                    </div>
                  )}

                  {result && <p className="text-sm leading-relaxed text-text-light">{result.explanation}</p>}
                  {result && result.actual && (
                    <div className="rounded-xl bg-white/5 p-3 text-sm text-text-muted">
                      服务端揭晓：{result.actual.name}（<em>{result.actual.scientificName}</em>）
                    </div>
                  )}
                  {!replay && (
                    <button className="btn-primary w-full" onClick={() => void loadReplay()}>
                      <History className="w-4 h-4" />
                      加载带校验和的日志重放
                    </button>
                  )}
                  <button className="btn-primary-ghost w-full" onClick={() => void startSession()}>
                    <RefreshCw className="w-4 h-4" />
                    换新涂片
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {verdictChoices.map((choice) => (
                    <button
                      key={choice}
                      className="w-full text-left rounded-xl border border-white/15 hover:border-glow-primary/60 hover:bg-glow-primary/10 px-4 py-3 text-sm text-text-light disabled:opacity-50"
                      disabled={pendingVerdict || !!session.activeReagent}
                      onClick={() => void submitVerdict(choice)}
                    >
                      {VERDICT_LABELS[choice]}
                    </button>
                  ))}
                  <p className="text-xs text-text-muted pt-2 flex gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    试剂仍在作用时不能提交；服务端会先核对四步时长和错误日志。
                  </p>
                </div>
              )}
            </div>

            {result && (
              <div className="glass-card p-5">
                <h3 className="text-lg font-semibold text-text-light mb-3">服务端审计</h3>
                <div className="space-y-2 text-sm">
                  {result.findings.map((finding, index) => (
                    <div
                      key={`${finding.message}-${index}`}
                      className={`rounded-lg px-3 py-2 border ${
                        finding.severity === 'error'
                          ? 'border-glow-red/30 bg-glow-red/10 text-glow-red'
                          : finding.severity === 'warning'
                            ? 'border-glow-gold/30 bg-glow-gold/10 text-glow-gold'
                            : 'border-glow-primary/30 bg-glow-primary/10 text-glow-primary'
                      }`}
                    >
                      {finding.message}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="glass-card p-5">
              <h3 className="text-lg font-semibold text-text-light mb-3">操作日志</h3>
              <div className="space-y-2 max-h-72 overflow-auto pr-1">
                {allLogs.length === 0 && <p className="text-sm text-text-muted">空白视野，尚无操作。</p>}
                {allLogs.map((item) =>
                  item.kind === 'event' ? (
                    <div key={item.event.id} className="rounded-lg bg-white/5 px-3 py-2 font-mono text-xs text-text-muted">
                      <span className="text-glow-primary">{formatMs(item.at)}</span>{' '}
                      {REAGENT_LABELS[item.event.reagent]} 开始
                      {item.event.durationMs !== null ? ` → ${formatMs(item.event.durationMs)} 后停止` : '（进行中）'}
                    </div>
                  ) : (
                    <div key={item.event.id} className="rounded-lg bg-glow-red/10 border border-glow-red/30 px-3 py-2 text-xs text-glow-red">
                      <SkipForward className="inline w-3.5 h-3.5 mr-1" />
                      <span className="font-mono">{formatMs(item.at)}</span>：{item.event.message}
                    </div>
                  )
                )}
              </div>
            </div>

            <Link to="/" className="btn-primary-ghost w-full justify-center">
              返回首页
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
