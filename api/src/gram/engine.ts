import type {
  ActionId,
  ApparentResult,
  CellShape,
  CellWallType,
  ClaimId,
  GradeResult,
  LabEvent,
  LabFrame,
  LabSession,
  LabStage,
  PatternKind,
  ReagentId,
  RgbColor,
  SpecimenSpec,
} from '../../../shared/gram-types.js';

export const SPECIMENS: SpecimenSpec[] = [
  { id: 's-aureus', code: '标本 A', label: '未知微生物涂片', wall: 'gram_positive', shape: 'cocci' },
  { id: 'e-coli', code: '标本 B', label: '未知微生物涂片', wall: 'gram_negative', shape: 'rods' },
  { id: 'c-albicans', code: '标本 C', label: '未知微生物涂片', wall: 'fungal_chitin_glucan', shape: 'yeast' },
];

export const ACTION_LABELS: Record<ActionId, string> = {
  crystal_violet: '结晶紫',
  iodine: '碘液',
  alcohol: '酒精脱色',
  safranin: '番红复染',
  water: '清水冲洗',
};

export const REAGENT_IDS: ReagentId[] = ['crystal_violet', 'iodine', 'alcohol', 'safranin'];

export const TIMING_RULES = {
  crystal_violet: { ideal: [30, 90], usable: [15, 120], unit: '秒' },
  iodine: { ideal: [20, 90], usable: [10, 120], unit: '秒' },
  alcohol: { ideal: [5, 12], usable: [2, 20], unit: '秒' },
  safranin: { ideal: [30, 90], usable: [15, 120], unit: '秒' },
} as const;

const NEXT_REAGENT: Record<LabStage, ReagentId | null> = {
  ready: 'crystal_violet',
  crystal_violet: null,
  after_crystal_violet_wash: 'iodine',
  iodine: null,
  after_iodine_wash: 'alcohol',
  alcohol: null,
  after_alcohol_wash: 'safranin',
  safranin: null,
  complete: null,
};

const STAGE_AFTER_WASH: Partial<Record<LabStage, LabStage>> = {
  crystal_violet: 'after_crystal_violet_wash',
  iodine: 'after_iodine_wash',
  alcohol: 'after_alcohol_wash',
  safranin: 'complete',
};

interface DyeState {
  crystalViolet: number;
  iodine: number;
  alcoholSec: number;
  safranin: number;
}

interface DerivedState extends DyeState {
  stage: LabStage;
  activeAction: ActionId | null;
  activeStartedAt: number | null;
  chemistry: GradeResult['chemistry'];
}

const zeroDye = (): DyeState => ({
  crystalViolet: 0,
  iodine: 0,
  alcoholSec: 0,
  safranin: 0,
});

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const saturateDose = (durationSec: number, fullAtSec: number) =>
  clamp01(durationSec / fullAtSec);

function hashSeed(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(wavelength: number, center: number, width: number, peak: number) {
  const x = (wavelength - center) / width;
  return peak * Math.exp(-(x * x));
}

function colorMatchingFunctions(wavelength: number) {
  // Compact CIE 1931 Gaussian approximations. They are deterministic and adequate
  // for teaching-grade subtractive mixing.
  return {
    x:
      gaussian(wavelength, 445, 22, 0.35) +
      gaussian(wavelength, 555, 38, 0.72) +
      gaussian(wavelength, 600, 35, 0.18),
    y: gaussian(wavelength, 540, 42, 1.02),
    z:
      gaussian(wavelength, 450, 38, 1.12) +
      gaussian(wavelength, 490, 25, 0.18),
  };
}

const WAVELENGTHS = Array.from({ length: 31 }, (_, index) => 400 + index * 10);
const WHITE: Record<'x' | 'y' | 'z', number> = { x: 0, y: 0, z: 0 };
WAVELENGTHS.forEach((wavelength) => {
  const cmf = colorMatchingFunctions(wavelength);
  WHITE.x += cmf.x;
  WHITE.y += cmf.y;
  WHITE.z += cmf.z;
});

function linearToSrgb(value: number) {
  const v = clamp01(value);
  const converted = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 0.4166667) - 0.055;
  return Math.round(clamp01(converted) * 255);
}

function spectrumToColor(absorbanceAt: (wavelength: number) => number): RgbColor {
  let x = 0;
  let y = 0;
  let z = 0;

  WAVELENGTHS.forEach((wavelength) => {
    // Beer-Lambert-ish subtractive mixing: dyes absorb bands of reflected light.
    const reflectance = Math.exp(-Math.max(0, absorbanceAt(wavelength)));
    const cmf = colorMatchingFunctions(wavelength);
    x += cmf.x * reflectance;
    y += cmf.y * reflectance;
    z += cmf.z * reflectance;
  });

  const xyzX = x / WHITE.x;
  const xyzY = y / WHITE.y;
  const xyzZ = z / WHITE.z;

  // sRGB D65 matrix.
  const linearR = 3.2406 * xyzX - 1.5372 * xyzY - 0.4986 * xyzZ;
  const linearG = -0.9689 * xyzX + 1.8758 * xyzY + 0.0415 * xyzZ;
  const linearB = 0.0557 * xyzX - 0.204 * xyzY + 1.057 * xyzZ;

  const r = linearToSrgb(linearR);
  const g = linearToSrgb(linearG);
  const b = linearToSrgb(linearB);
  return {
    r,
    g,
    b,
    hex: `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`,
  };
}

const WHITE_COLOR: RgbColor = { r: 248, g: 246, b: 239, hex: '#f8f6ef' };
const WASH_COLOR: RgbColor = { r: 229, g: 244, b: 248, hex: '#e5f4f8' };

function retentionFor(wall: CellWallType, alcoholSec: number) {
  if (alcoholSec <= 0) return wall === 'fungal_chitin_glucan' ? 0.72 : 1;
  if (wall === 'gram_positive') {
    return alcoholSec <= 12
      ? 0.96
      : 0.96 * Math.exp(-0.18 * (alcoholSec - 12));
  }
  if (wall === 'gram_negative') {
    return 0.72 * Math.exp(-0.45 * alcoholSec) + 0.012;
  }
  return 0.5 * Math.exp(-0.045 * alcoholSec) + 0.22;
}

function safraninUptake(wall: CellWallType, retainedComplex: number) {
  if (wall === 'fungal_chitin_glucan') return 0.52;
  if (wall === 'gram_negative') return 0.94 - retainedComplex * 0.55;
  return 0.025 + (1 - retainedComplex) * 0.45;
}

function computeChemistry(specimen: SpecimenSpec, state: DyeState): GradeResult['chemistry'] {
  const complex = Math.min(state.crystalViolet, state.iodine);
  const retainedComplex = complex * retentionFor(specimen.wall, state.alcoholSec);
  const retainedCv = Math.max(0, state.crystalViolet - state.iodine)
    * retentionFor(specimen.wall, state.alcoholSec);
  const safranin = state.safranin
    * safraninUptake(specimen.wall, retainedComplex + retainedCv);

  return {
    crystalViolet: state.crystalViolet,
    iodineComplex: complex,
    retainedComplex: retainedComplex + retainedCv,
    safranin,
    appliedSafranin: state.safranin,
    alcoholDurationSec: state.alcoholSec,
  };
}

function applyAction(state: DyeState, action: ActionId, durationMs: number) {
  const seconds = durationMs / 1000;
  if (action === 'crystal_violet') {
    state.crystalViolet = clamp01(state.crystalViolet + saturateDose(seconds, 30));
  } else if (action === 'iodine') {
    state.iodine = clamp01(state.iodine + saturateDose(seconds, 25));
  } else if (action === 'alcohol') {
    state.alcoholSec = Math.max(state.alcoholSec, seconds);
  } else if (action === 'safranin') {
    state.safranin = clamp01(state.safranin + saturateDose(seconds, 30));
  }
}

function canonicalEvents(events: LabEvent[]) {
  return events
    .filter((event) => event.type !== 'rejected_action' && event.type !== 'claim' && event.type !== 'system')
    .filter((event) => event.startedAt !== null)
    .sort((a, b) => a.index - b.index);
}

function deriveState(events: LabEvent[], at: number): DerivedState {
  const state = zeroDye();
  let stage: LabStage = 'ready';
  let activeAction: ActionId | null = null;
  let activeStartedAt: number | null = null;

  canonicalEvents(events).forEach((event) => {
    if (event.startedAt !== null && event.startedAt > at) return;
    const action = event.type as ActionId;
    if (action === 'water') {
      if (stage !== 'complete') stage = STAGE_AFTER_WASH[stage] ?? stage;
      return;
    }

    const start = event.startedAt ?? 0;
    const end = event.endedAt;
    if (end === null) {
      if (start <= at) {
        activeAction = action;
        activeStartedAt = start;
      }
    } else {
      applyAction(state, action, Math.max(0, end - start));
      stage = action as LabStage;
    }
  });

  if (activeAction && activeStartedAt !== null) {
    applyAction(state, activeAction, Math.max(0, at - activeStartedAt));
  }

  return {
    ...state,
    stage,
    activeAction,
    activeStartedAt,
    chemistry: {
      crystalViolet: 0,
      iodineComplex: 0,
      retainedComplex: 0,
      safranin: 0,
      appliedSafranin: 0,
      alcoholDurationSec: 0,
    },
  };
}

function protocolUsable(chemistry: GradeResult['chemistry']) {
  return chemistry.crystalViolet >= 0.7
    && chemistry.iodineComplex >= 0.7
    && chemistry.alcoholDurationSec >= 2
    && chemistry.alcoholDurationSec <= 20
    && chemistry.appliedSafranin >= 0.7;
}

function apparentFromChemistry(
  specimen: SpecimenSpec,
  chemistry: GradeResult['chemistry'],
  stage: LabStage,
): ApparentResult {
  if (stage !== 'complete') return 'not_final';
  if (specimen.wall === 'fungal_chitin_glucan') return 'fungi';
  if (!protocolUsable(chemistry)) return 'unreliable';
  if (chemistry.retainedComplex >= 0.7 && chemistry.safranin < 0.08) return 'gram_positive';
  if (chemistry.retainedComplex <= 0.08 && chemistry.safranin >= 0.6) return 'gram_negative';
  return 'unreliable';
}

function patternFor(specimen: SpecimenSpec, chemistry: GradeResult['chemistry'], stage: LabStage): PatternKind {
  if (stage === 'ready') return 'none';
  if (specimen.shape === 'yeast') return 'bud_rings';
  if (stage !== 'complete') return 'none';
  if (!protocolUsable(chemistry)) return 'damaged_cross';
  if (chemistry.retainedComplex >= 0.7 && chemistry.safranin < 0.08) return 'dense_dots';
  if (chemistry.retainedComplex <= 0.08 && chemistry.safranin >= 0.08) return 'open_lines';
  return 'damaged_cross';
}

function markerFor(result: ApparentResult, stage: LabStage) {
  if (stage !== 'complete') return '未完成：当前纹理不作判定';
  switch (result) {
    case 'gram_positive':
      return 'G+｜密集圆点纹理｜紫黑色';
    case 'gram_negative':
      return 'G−｜开口平行线纹理｜红色';
    case 'fungi':
      return '真菌｜芽生环/芽体纹理｜不作革兰阴阳判定';
    default:
      return '不可靠｜交叉裂纹纹理｜需重制涂片';
  }
}

function cellColor(specimen: SpecimenSpec, state: DyeState, stage: LabStage): RgbColor {
  if (stage === 'ready') return { r: 205, g: 198, b: 181, hex: '#cdc6b5' };
  return spectrumToColor((wavelength) => {
    const complex = Math.min(state.crystalViolet, state.iodine);
    const retention = retentionFor(specimen.wall, state.alcoholSec);
    const retainedComplex = complex * retention;
    const retainedCv = Math.max(0, state.crystalViolet - state.iodine) * retention;
    const uptake = safraninUptake(specimen.wall, retainedComplex);
    return (
      gaussian(wavelength, 570, 55, 4 * (retainedComplex + retainedCv)) +
      gaussian(wavelength, 440, 90, 1.4 * (retainedComplex + retainedCv)) +
      gaussian(wavelength, 650, 55, 0.7 * (retainedComplex + retainedCv)) +
      gaussian(wavelength, 525, 45, 2.2 * state.safranin * uptake) +
      gaussian(wavelength, 450, 65, 2 * state.safranin * uptake) +
      0.04
    );
  });
}

function liquidColor(action: ActionId | null): RgbColor {
  if (!action) return WHITE_COLOR;
  if (action === 'water') return WASH_COLOR;
  if (action === 'crystal_violet') {
    return spectrumToColor((w) => gaussian(w, 585, 43, 0.22) + 0.005);
  }
  if (action === 'iodine') {
    return spectrumToColor((w) => gaussian(w, 555, 100, 0.24) + gaussian(w, 650, 45, 0.12) + 0.006);
  }
  if (action === 'alcohol') {
    return spectrumToColor((w) => gaussian(w, 470, 60, 0.06) + 0.004);
  }
  return spectrumToColor((w) => gaussian(w, 525, 58, 0.2) + 0.005);
}

function buildCells(specimen: SpecimenSpec, state: DyeState, stage: LabStage, chemistry: GradeResult['chemistry']): LabFrame['cells'] {
  const random = mulberry32(hashSeed(`gram-cell-${specimen.id}`));
  const fill = cellColor(specimen, state, stage);
  const pattern = patternFor(specimen, chemistry, stage);
  const cells: LabFrame['cells'] = [];
  const count = specimen.shape === 'yeast' ? 11 : 15;

  for (let i = 0; i < count; i += 1) {
    const shape: CellShape = specimen.shape;
    const x = 9 + random() * 82;
    const y = 10 + random() * 78;
    const base = shape === 'cocci' ? 3.1 + random() * 1.4 : 2.4 + random() * 1.1;
    cells.push({
      id: `cell-${i}`,
      x,
      y,
      rx: shape === 'rods' ? base * 2.2 : base,
      ry: shape === 'rods' ? base * 0.72 : base,
      rotation: Math.round(random() * 180),
      shape,
      fill,
      pattern,
      opacity: stage === 'ready' ? 0.22 : 0.94,
    });
  }
  return cells;
}

export function getFrameAt(session: Pick<LabSession, 'events' | 'stage' | 'status'>, specimen: SpecimenSpec, at: number): LabFrame {
  const state = deriveState(session.events, at);
  const stage = state.stage;
  const chemistry = computeChemistry(specimen, state);
  const apparent = apparentFromChemistry(specimen, chemistry, stage);
  const warnings = getChemistryWarnings(chemistry, stage);
  const activeElapsedMs = state.activeAction && state.activeStartedAt !== null
    ? Math.max(0, at - state.activeStartedAt)
    : null;

  return {
    at,
    stage,
    activeAction: state.activeAction,
    activeElapsedMs,
    background: WHITE_COLOR,
    liquid: liquidColor(stage === state.stage ? state.activeAction : null),
    cells: buildCells(specimen, state, stage, chemistry),
    apparentResult: apparent,
    marker: markerFor(apparent, stage),
    warnings,
  };
}

export function expectedAction(stage: LabStage): ActionId | null {
  if (stage === 'crystal_violet' || stage === 'iodine' || stage === 'alcohol' || stage === 'safranin') {
    return 'water';
  }
  return NEXT_REAGENT[stage];
}

export function startRejectionReason(stage: LabStage, action: ActionId, hasActive: boolean): string | null {
  if (stage === 'complete') return '实验已经结束；请用“重放日志”查看，不能再向涂片加试剂。';
  if (hasActive) return action === 'water'
    ? '当前试剂仍在作用中，需要先结束本次滴加/脱色，再冲洗。'
    : '上一步仍在计时，不能同时滴入另一种试剂。';
  const expected = expectedAction(stage);
  if (action !== expected) {
    if (action === 'water') return '现在还没有需要冲掉的试剂，清水只能在试剂作用后使用。';
    if (expected === 'water') return `这一步之后必须先清水冲洗，才能加${ACTION_LABELS[action]}；否则染料顺序不成立。`;
    if (expected) return `现在应使用${ACTION_LABELS[expected]}，不能跳到${ACTION_LABELS[action]}。`;
  }
  return null;
}

export function durationWarning(action: ReagentId, durationSec: number): string | null {
  const rule = TIMING_RULES[action];
  if (durationSec < rule.usable[0]) {
    return `${ACTION_LABELS[action]}只作用了 ${durationSec.toFixed(1)} 秒，低于 ${rule.usable[0]} 秒，结合不充分。`;
  }
  if (durationSec > rule.usable[1]) {
    return `${ACTION_LABELS[action]}作用了 ${durationSec.toFixed(1)} 秒，超过 ${rule.usable[1]} 秒，涂片结果不可作为判读依据。`;
  }
  if (durationSec < rule.ideal[0] || durationSec > rule.ideal[1]) {
    return `${ACTION_LABELS[action]}用时 ${durationSec.toFixed(1)} 秒，不在推荐 ${rule.ideal[0]}–${rule.ideal[1]} 秒内。`;
  }
  return null;
}

function getChemistryWarnings(chemistry: GradeResult['chemistry'], stage: LabStage) {
  const warnings: string[] = [];
  if (stage === 'ready') return warnings;
  if (chemistry.crystalViolet > 0 && chemistry.crystalViolet < 0.7) {
    warnings.push('结晶紫结合量偏低，初染偏淡。');
  }
  if (chemistry.iodineComplex > 0 && chemistry.iodineComplex < 0.7) {
    warnings.push('碘液媒染不足，CV-I 复合物不稳定。');
  }
  if (chemistry.alcoholDurationSec > 0) {
    if (chemistry.alcoholDurationSec < 2) warnings.push('脱色不足：阴性菌外层脂质尚未充分溶解。');
    if (chemistry.alcoholDurationSec > 20) warnings.push('脱色超时：厚壁也被洗脱并损伤，不能据此判阴阳。');
    else if (chemistry.alcoholDurationSec > 12) warnings.push('脱色偏久：革兰阳性菌的 CV-I 正在流失。');
  }
  if (chemistry.safranin > 0 && chemistry.safranin < 0.25) {
    warnings.push('番红复染偏淡，阴性细胞缺少足够的对比色。');
  }
  return warnings;
}

function actionDuration(events: LabEvent[], action: ReagentId): number {
  const event = canonicalEvents(events).find((item) => item.type === action);
  if (!event || event.endedAt === null || event.startedAt === null) return 0;
  return (event.endedAt - event.startedAt) / 1000;
}

function timingPoints(events: LabEvent[]): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const weights: Record<ReagentId, number> = {
    crystal_violet: 7,
    iodine: 7,
    alcohol: 9,
    safranin: 7,
  };

  REAGENT_IDS.forEach((action) => {
    const seconds = actionDuration(events, action);
    const rule = TIMING_RULES[action];
    const warning = durationWarning(action, seconds);
    if (!warning) {
      score += weights[action];
      return;
    }
    const usable = seconds >= rule.usable[0] && seconds <= rule.usable[1];
    if (usable) {
      score += Math.round(weights[action] / 2);
      reasons.push(warning);
    } else {
      reasons.push(warning);
    }
  });

  return { score, reasons };
}

export function expectedClaim(specimen: SpecimenSpec, chemistry: GradeResult['chemistry']): ClaimId {
  if (specimen.wall === 'fungal_chitin_glucan') return 'fungi';
  if (!protocolUsable(chemistry)) return 'unreliable';
  return specimen.wall === 'gram_positive'
    && chemistry.retainedComplex >= 0.7
    && chemistry.safranin < 0.08
    ? 'gram_positive'
    : specimen.wall === 'gram_negative'
      && chemistry.retainedComplex <= 0.08
      && chemistry.safranin >= 0.6
      ? 'gram_negative'
      : 'unreliable';
}

export function gradeSession(session: LabSession, specimen: SpecimenSpec): GradeResult {
  const events = session.events;
  const state = deriveState(events, session.completedAt ?? Date.now());
  const chemistry = computeChemistry(specimen, state);
  const rejectedCount = events.filter((event) => event.type === 'rejected_action').length;
  const sequenceScore = Math.max(25, 40 - Math.min(15, rejectedCount * 3));
  const timing = timingPoints(events);
  const expected = expectedClaim(specimen, chemistry);
  const claim = session.claim ?? 'unreliable';
  const claimCorrect = claim === expected;
  const claimScore = claimCorrect ? 30 : 0;
  const score = sequenceScore + timing.score + claimScore;

  const reasons: string[] = [];
  const wallReasons: Record<CellWallType, string> = {
    gram_positive:
      '厚而交联紧密的肽聚糖层在适度酒精下脱水缩孔，碘-结晶紫复合物被留在壁内，所以最终呈紫黑色并有密集圆点纹理。',
    gram_negative:
      '较薄肽聚糖外有富含脂质的外膜；酒精溶解外膜并洗去 CV-I，番红进入后呈红色，纹理用开口平行线表示。',
    fungal_chitin_glucan:
      '真菌壁主要是几丁质和葡聚糖，不是细菌革兰阴/阳性壁结构；即使吸附紫色染料，也应依据芽体/环状结构判为真菌。',
  };
  reasons.push(wallReasons[specimen.wall]);
  reasons.push(`酒精停留 ${chemistry.alcoholDurationSec.toFixed(1)} 秒；模型保留的 CV-I 相对量为 ${(chemistry.retainedComplex * 100).toFixed(0)}%，番红相对量为 ${(chemistry.safranin * 100).toFixed(0)}%。`);
  reasons.push(...timing.reasons);
  if (rejectedCount > 0) reasons.push(`有 ${rejectedCount} 次非法操作被服务端拒绝并扣分，但未写入有效染色序列。`);
  if (claimCorrect) {
    reasons.push(expected === 'fungi'
      ? '结论正确：该标本不参与革兰阳性/阴性二分。'
      : expected === 'unreliable'
        ? '结论正确：当前操作已破坏判读条件，应重制涂片而不是硬判阴阳。'
        : '结论与服务端根据壁结构、操作序列和时长重放出的颜色一致。');
  } else {
    reasons.push(`结论错误：服务端期望“${CLAIM_LABELS[expected]}”，玩家提交“${CLAIM_LABELS[claim]}”。`);
  }

  return {
    score,
    passed: claimCorrect && score >= 80,
    claim,
    expectedClaim: expected,
    claimCorrect,
    sequenceScore,
    timingScore: timing.score,
    claimScore,
    reasons,
    protocolErrors: events
      .filter((event) => event.type === 'rejected_action')
      .map((event) => `${ACTION_LABELS[event.attemptedAction as ActionId] ?? event.attemptedAction}：${event.reason ?? '非法操作'}`),
    chemistry,
  };
}

export const CLAIM_LABELS: Record<ClaimId, string> = {
  gram_positive: '革兰阳性（G+，紫黑 + 密点）',
  gram_negative: '革兰阴性（G−，红色 + 开口线）',
  fungi: '真菌（芽生环，不做革兰阴阳判定）',
  unreliable: '结果不可靠，应重制涂片（叉纹）',
};

export function findSpecimen(id: string) {
  return SPECIMENS.find((specimen) => specimen.id === id);
}
