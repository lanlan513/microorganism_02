import { absorbanceSpectrum, spectrumToRGB } from './color.js';
import type {
  AcceptedGramEvent,
  CellGeometry,
  GramChemistry,
  GramFrame,
  GramReagent,
  RGB,
} from './types.js';

export const FRAME_INTERVAL_MS = 100;

export const initialChemistry: GramChemistry = {
  crystalViolet: 0,
  cvIodineComplex: 0,
  safranin: 0,
  freeCrystalViolet: 0,
  freeIodine: 0,
  freeSafranin: 0,
  washedComplex: 0,
};

export function cloneChemistry(value: GramChemistry): GramChemistry {
  return { ...value };
}

function clearFreeReagent(state: GramChemistry) {
  state.freeCrystalViolet = 0;
  state.freeIodine = 0;
  state.freeSafranin = 0;
}

function setFreeReagent(state: GramChemistry, reagent: GramReagent) {
  clearFreeReagent(state);
  if (reagent === 'crystal_violet') state.freeCrystalViolet = 0.28;
  if (reagent === 'iodine') state.freeIodine = 0.2;
  if (reagent === 'safranin') state.freeSafranin = 0.18;
}

/**
 * 推进结合在细胞内的染料。所有速率常数只描述化学动力学；
 * 酒精差分速率由服务端按隐藏细胞壁类型注入。
 */
export function advanceChemistry(
  state: GramChemistry,
  durationMs: number,
  activeReagent: GramReagent | null,
  decolorRate: number
): GramChemistry {
  if (durationMs <= 0) return state;
  const dt = durationMs / 1000;

  if (activeReagent === 'crystal_violet') {
    const uptake = 1 - Math.exp(-0.082 * dt);
    state.crystalViolet += (1 - state.crystalViolet) * uptake;
    state.freeCrystalViolet = 0.28;
  } else if (activeReagent === 'iodine') {
    // 媒染把已结合的结晶紫转化为更大的 CV-I 复合物
    const conversion = 1 - Math.exp(-0.078 * dt);
    const converted = state.crystalViolet * conversion;
    state.crystalViolet -= converted;
    state.cvIodineComplex += converted;
    state.freeIodine = 0.2;
  } else if (activeReagent === 'alcohol') {
    const before = state.cvIodineComplex;
    state.cvIodineComplex *= Math.exp(-decolorRate * dt);
    state.crystalViolet *= Math.exp(-0.3 * dt);
    state.washedComplex += before - state.cvIodineComplex;
    clearFreeReagent(state);
  } else if (activeReagent === 'safranin') {
    const uptake = 1 - Math.exp(-0.095 * dt);
    state.safranin += (0.98 - state.safranin) * uptake;
    state.freeSafranin = 0.18;
  } else {
    clearFreeReagent(state);
  }

  return state;
}

function cellAbsorbance(chemistry: GramChemistry, density: number): number[] {
  return absorbanceSpectrum({
    glass: false,
    cellBase: density,
    crystalViolet: chemistry.crystalViolet * 0.82 * density,
    cvIodineComplex: chemistry.cvIodineComplex * 0.98 * density,
    iodine: chemistry.freeIodine * 0.28 * density,
    safranin: chemistry.safranin * 0.6 * density,
  });
}

function fieldAbsorbance(chemistry: GramChemistry): number[] {
  return absorbanceSpectrum({
    glass: true,
    cellBase: 0,
    crystalViolet: chemistry.freeCrystalViolet * 0.55,
    iodine: chemistry.freeIodine * 0.35,
    safranin: chemistry.freeSafranin * 0.5,
  });
}

function frameColors(
  chemistry: GramChemistry,
  cells: CellGeometry[]
): Pick<GramFrame, 'cellColors' | 'cellEdgeColors' | 'fieldColor'> {
  const cellColors: RGB[] = [];
  const cellEdgeColors: RGB[] = [];

  cells.forEach((cell) => {
    const density = 0.88 + cell.shade * 0.22;
    const center = spectrumToRGB(cellAbsorbance(chemistry, density));
    const edge = spectrumToRGB(cellAbsorbance(chemistry, density * 1.22));
    cellColors.push(center);
    cellEdgeColors.push(edge);
  });

  return {
    cellColors,
    cellEdgeColors,
    fieldColor: spectrumToRGB(fieldAbsorbance(chemistry)),
  };
}

type Mutation = {
  atMs: number;
  type: 'start' | 'stop';
  reagent: GramReagent;
};

export interface GramSimulationOptions {
  decolorRate: number;
  cells: CellGeometry[];
  atMs?: number;
  frameIntervalMs?: number;
}

export interface GramSimulation {
  frames: GramFrame[];
  finalChemistry: GramChemistry;
  durationMs: number;
}

/**
 * 用同一份事件日志和同一组物理参数，逐帧确定性重放。
 * 不使用 Date.now/random，因此服务端评分、客户端现场和事后回放完全一致。
 */
export function simulateGram(
  events: AcceptedGramEvent[],
  options: GramSimulationOptions
): GramSimulation {
  const interval = options.frameIntervalMs ?? FRAME_INTERVAL_MS;
  const closedEventEnd = events.reduce(
    (max, event) => (event.durationMs === null ? max : Math.max(max, event.startOffsetMs + event.durationMs)),
    0
  );
  const activeEvent = events.find((event) => event.durationMs === null);
  const endMs = activeEvent
    ? Math.max(options.atMs ?? activeEvent.startOffsetMs, activeEvent.startOffsetMs)
    : closedEventEnd;

  const mutations: Mutation[] = events.flatMap((event) => {
    const result: Mutation[] = [{ atMs: event.startOffsetMs, type: 'start', reagent: event.reagent }];
    if (event.durationMs !== null) {
      result.push({
        atMs: event.startOffsetMs + event.durationMs,
        type: 'stop',
        reagent: event.reagent,
      });
    }
    return result;
  });
  mutations.sort((a, b) => a.atMs - b.atMs);

  const timeline = new Set<number>([0]);
  for (let time = 0; time <= endMs; time += interval) timeline.add(time);
  timeline.add(endMs);
  mutations.forEach((mutation) => {
    if (mutation.atMs <= endMs) timeline.add(mutation.atMs);
  });

  const state = cloneChemistry(initialChemistry);
  let baseActive: GramReagent | null = null;
  let baseActiveStart = 0;
  let mutationIndex = 0;
  let lastClosed: GramReagent | null = null;
  const frames: GramFrame[] = [];

  const orderedTimes = [...timeline].sort((a, b) => a - b);
  orderedTimes.forEach((time) => {
    while (mutationIndex < mutations.length && mutations[mutationIndex].atMs <= time) {
      const mutation = mutations[mutationIndex];
      if (baseActive && mutation.atMs > baseActiveStart) {
        advanceChemistry(state, mutation.atMs - baseActiveStart, baseActive, options.decolorRate);
      }

      if (mutation.type === 'start') {
        baseActive = mutation.reagent;
        baseActiveStart = mutation.atMs;
        setFreeReagent(state, mutation.reagent);
      } else {
        baseActive = null;
        clearFreeReagent(state);
        lastClosed = mutation.reagent;
      }
      mutationIndex += 1;
    }

    const frameState = cloneChemistry(state);
    let activeReagent = baseActive;
    if (baseActive && time > baseActiveStart) {
      advanceChemistry(frameState, time - baseActiveStart, baseActive, options.decolorRate);
    } else if (!baseActive) {
      activeReagent = null;
    }

    const completedOrder: GramReagent[] = ['crystal_violet', 'iodine', 'alcohol', 'safranin'];
    const stage: GramFrame['stage'] = activeReagent
      ? activeReagent
      : lastClosed
        ? completedOrder.indexOf(lastClosed) === completedOrder.length - 1
          ? 'complete'
          : lastClosed
        : 'ready';

    frames.push({
      atMs: time,
      stage,
      activeReagent,
      chemistry: cloneChemistry(frameState),
      ...frameColors(frameState, options.cells),
    });
  });

  return {
    frames,
    finalChemistry: frames[frames.length - 1]?.chemistry ?? cloneChemistry(initialChemistry),
    durationMs: endMs,
  };
}
