export const GRAM_PROTOCOL_VERSION = 'gram-stain-1';

export const GRAM_REAGENTS = [
  'crystal_violet',
  'iodine',
  'alcohol',
  'safranin',
] as const;

export type GramReagent = (typeof GRAM_REAGENTS)[number];

export const REAGENT_LABELS: Record<GramReagent, string> = {
  crystal_violet: '结晶紫',
  iodine: '碘液',
  alcohol: '酒精脱色',
  safranin: '番红复染',
};

/** 教学参考时长，单位秒；真实判定以服务端记录的 start/stop 间隔为准 */
export const REAGENT_GUIDANCE: Record<
  GramReagent,
  { target: number; good: [number, number]; hint: string }
> = {
  crystal_violet: {
    target: 60,
    good: [45, 90],
    hint: '初染，让细胞结合结晶紫',
  },
  iodine: {
    target: 60,
    good: [45, 90],
    hint: '媒染，形成结晶紫-碘复合物',
  },
  alcohol: {
    target: 10,
    good: [5, 15],
    hint: '关键差分步骤；短了假阳性，长了假阴性',
  },
  safranin: {
    target: 45,
    good: [30, 60],
    hint: '复染脱色后的细胞',
  },
};

export type GramMorphology = 'cocci' | 'rods' | 'budding-oval';

export const MORPHOLOGY_LABELS: Record<GramMorphology, string> = {
  cocci: '球形细胞，成堆排列',
  rods: '杆状细胞，散在排列',
  'budding-oval': '较大的卵圆形细胞，部分带有出芽小体',
};

export interface GramKinetics {
  /** 酒精抽取 CV-I 的一级速率，1/s；由服务端按隐藏细胞壁类型给出 */
  decolorRate: number;
}

export interface PublicSpecimen {
  code: string;
  morphologyType: GramMorphology;
  clue: string;
  seed: number;
}

/** 活动期间服务端只给渲染所需画面，不返回可反推细胞壁类型的化学浓度/速率 */
export type RenderFrame = Omit<GramFrame, 'chemistry'>;

export type GramSessionStatus = 'active' | 'judged' | 'invalid';

export type GramEventAction = 'start' | 'stop';

export interface GramEventInput {
  clientEventId: string;
  action: GramEventAction;
  reagent: GramReagent;
}

export interface AcceptedGramEvent {
  id: string;
  reagent: GramReagent;
  startOffsetMs: number;
  durationMs: number | null;
}

export interface RejectedGramEvent {
  id: string;
  action: GramEventAction;
  reagent: GramReagent | null;
  atOffsetMs: number;
  code: string;
  message: string;
  fatal: boolean;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface CellGeometry {
  id: number;
  shape: 'coccus' | 'rod' | 'oval';
  x: number;
  y: number;
  radius?: number;
  width?: number;
  height?: number;
  rx?: number;
  ry?: number;
  rotation: number;
  shade: number;
  bud?: { x: number; y: number; radius: number };
}

export interface GramChemistry {
  crystalViolet: number;
  cvIodineComplex: number;
  safranin: number;
  freeCrystalViolet: number;
  freeIodine: number;
  freeSafranin: number;
  washedComplex: number;
}

export interface GramFrame {
  atMs: number;
  stage: GramReagent | 'ready' | 'complete';
  activeReagent: GramReagent | null;
  chemistry: GramChemistry;
  cellColors: RGB[];
  cellEdgeColors: RGB[];
  fieldColor: RGB;
}

export type GramVerdict = 'positive' | 'negative' | 'not_bacteria';

export const VERDICT_LABELS: Record<GramVerdict, string> = {
  positive: '革兰阳性（G+）',
  negative: '革兰阴性（G−）',
  not_bacteria: '不是细菌革兰染色结论（疑似真菌）',
};

export type TimingQuality = 'optimal' | 'short_mild' | 'short_severe' | 'long_mild' | 'long_severe';

export interface GramTimingResult {
  reagent: GramReagent;
  durationSec: number;
  quality: TimingQuality;
  message: string;
}

export interface RevealedSpecimen {
  name: string;
  scientificName: string;
  kind: 'bacteria' | 'fungi';
  wall?: 'gram_positive' | 'gram_negative';
}

export interface GramEvaluation {
  choice: GramVerdict | null;
  correct: boolean;
  score: number;
  techniqueScore: number;
  identificationScore: number;
  passed: boolean;
  validProtocol: boolean;
  fatalReason?: string;
  observed: {
    purpleRetention: number;
    safranin: number;
    appearance: 'purple' | 'pink' | 'murky' | 'pale';
  };
  timings: GramTimingResult[];
  findings: Array<{ severity: 'info' | 'warning' | 'error'; message: string }>;
  actual: RevealedSpecimen | null;
  explanation: string;
}

export interface GramSessionSnapshot {
  sessionId: string;
  status: GramSessionStatus;
  specimen: PublicSpecimen;
  events: AcceptedGramEvent[];
  rejected: RejectedGramEvent[];
  activeReagent: GramReagent | null;
  activeElapsedMs: number;
  snapshotAtOffsetMs: number;
  frame: RenderFrame;
  result: GramEvaluation | null;
}

export interface ReplaySpecimen extends PublicSpecimen {
  kinetics: GramKinetics;
}

export interface GramReplay {
  protocolVersion: typeof GRAM_PROTOCOL_VERSION;
  specimen: ReplaySpecimen;
  status: GramSessionStatus;
  events: AcceptedGramEvent[];
  rejected: RejectedGramEvent[];
  durationMs: number;
  frameIntervalMs: number;
  checksum: string;
  result: GramEvaluation | null;
}

export interface GramApiErrorBody {
  success: false;
  error: string;
  code?: string;
  snapshot?: GramSessionSnapshot;
}
