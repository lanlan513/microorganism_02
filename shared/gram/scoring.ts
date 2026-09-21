import { simulateGram } from './chemistry.js';
import {
  GRAM_REAGENTS,
  REAGENT_GUIDANCE,
  type GramEvaluation,
  GramKinetics,
  GramReagent,
  GramTimingResult,
  GramVerdict,
  PublicSpecimen,
  AcceptedGramEvent,
  RejectedGramEvent,
  TimingQuality,
} from './types.js';

export interface InternalSpecimen extends PublicSpecimen {
  name: string;
  scientificName: string;
  kind: 'bacteria' | 'fungi';
  wall?: 'gram_positive' | 'gram_negative';
  kinetics: GramKinetics;
}

interface EvaluateOptions {
  specimen: InternalSpecimen;
  events: AcceptedGramEvent[];
  rejected: RejectedGramEvent[];
  choice: GramVerdict | null;
}

interface TimingClassification {
  quality: TimingQuality;
  deduction: number;
  message: string;
}

const qualityMessages: Record<TimingQuality, (label: string, seconds: number, good: [number, number]) => string> = {
  optimal: (label, seconds) => `${label} ${seconds.toFixed(1)} 秒，处于推荐区间`,
  short_mild: (label, seconds, good) => `${label}只有 ${seconds.toFixed(1)} 秒，略短于推荐下限 ${good[0]} 秒`,
  short_severe: (label, seconds, good) => `${label}只有 ${seconds.toFixed(1)} 秒，明显短于推荐下限 ${good[0]} 秒`,
  long_mild: (label, seconds, good) => `${label}持续 ${seconds.toFixed(1)} 秒，略超过推荐上限 ${good[1]} 秒`,
  long_severe: (label, seconds, good) => `${label}持续 ${seconds.toFixed(1)} 秒，明显超过推荐上限 ${good[1]} 秒`,
};

function classifyTiming(reagent: GramReagent, durationSec: number): TimingClassification {
  const guidance = REAGENT_GUIDANCE[reagent];
  const label = reagent === 'alcohol' ? '酒精脱色' : `${reagent === 'crystal_violet' ? '结晶紫' : reagent === 'iodine' ? '碘液' : '番红'}`;
  let quality: TimingQuality;

  if (reagent === 'alcohol') {
    if (durationSec >= 5 && durationSec <= 15) quality = 'optimal';
    else if (durationSec >= 3 && durationSec < 5) quality = 'short_mild';
    else if (durationSec < 3) quality = 'short_severe';
    else if (durationSec > 15 && durationSec <= 30) quality = 'long_mild';
    else quality = 'long_severe';
  } else {
    const [low, high] = guidance.good;
    const severeLow = reagent === 'safranin' ? 20 : 30;
    const severeHigh = reagent === 'safranin' ? 90 : 120;
    if (durationSec >= low && durationSec <= high) quality = 'optimal';
    else if (durationSec >= severeLow && durationSec < low) quality = 'short_mild';
    else if (durationSec < severeLow) quality = 'short_severe';
    else if (durationSec > high && durationSec <= severeHigh) quality = 'long_mild';
    else quality = 'long_severe';
  }

  const deductionByReagent = reagent === 'alcohol'
    ? { optimal: 0, short_mild: 10, short_severe: 22, long_mild: 12, long_severe: 28 }
    : { optimal: 0, short_mild: 7, short_severe: 16, long_mild: 5, long_severe: 10 };

  return {
    quality,
    deduction: deductionByReagent[quality],
    message: qualityMessages[quality](label, durationSec, guidance.good),
  };
}

function formatSeconds(ms: number): number {
  return Math.round((ms / 1000) * 10) / 10;
}

function expectedVerdict(specimen: InternalSpecimen): GramVerdict {
  return specimen.kind === 'fungi'
    ? 'not_bacteria'
    : specimen.wall === 'gram_positive'
      ? 'positive'
      : 'negative';
}

/**
 * 纯函数评分：输入只有日志、隐藏标本和玩家选择。
 * 不读取前端状态、不信任客户端时长，因此可在服务端重复审计。
 */
export function evaluateGramLog(options: EvaluateOptions): GramEvaluation {
  const { specimen, events, rejected, choice } = options;
  const findings: GramEvaluation['findings'] = [];
  const fatal = rejected.find((item) => item.fatal);

  const durations = new Map<GramReagent, number>();
  events.forEach((event) => {
    if (event.durationMs !== null) durations.set(event.reagent, event.durationMs);
  });

  const timings: GramTimingResult[] = GRAM_REAGENTS.map((reagent) => {
    const durationSec = formatSeconds(durations.get(reagent) ?? 0);
    const classified = classifyTiming(reagent, durationSec);
    if (classified.quality !== 'optimal') {
      findings.push({
        severity: classified.quality.includes('severe') ? 'error' : 'warning',
        message: classified.message,
      });
    }
    return { reagent, durationSec, quality: classified.quality, message: classified.message };
  });

  const simulation = simulateGram(events, {
    decolorRate: specimen.kinetics.decolorRate,
    cells: [],
  });
  const chemistry = simulation.finalChemistry;
  const purpleWeight = chemistry.cvIodineComplex * 0.98 + chemistry.crystalViolet * 0.82;
  const redWeight = chemistry.safranin * 0.6;

  let appearance: GramEvaluation['observed']['appearance'] = 'pink';
  const stained = chemistry.crystalViolet + chemistry.cvIodineComplex + chemistry.safranin;
  if (stained < 0.35) appearance = 'pale';
  else if (purpleWeight >= 0.5 && purpleWeight >= redWeight * 0.8) appearance = 'purple';
  else if (purpleWeight <= 0.25) appearance = 'pink';
  else appearance = 'murky';

  if (fatal) {
    findings.push({ severity: 'error', message: fatal.message });
  }

  const techniqueDeduction = timings.reduce((sum, timing) => {
    const classification = classifyTiming(timing.reagent, timing.durationSec);
    return sum + (fatal ? 0 : classification.deduction);
  }, 0);

  const techniqueScore = fatal ? 0 : Math.max(0, 100 - techniqueDeduction);
  const expected = expectedVerdict(specimen);
  const correct = !fatal && choice === expected;
  const identificationScore = correct ? 100 : 0;
  const score = fatal ? 0 : Math.round(techniqueScore * 0.6 + identificationScore * 0.4);
  const passed = correct && score >= 80;

  if (specimen.kind === 'fungi') {
    findings.push({
      severity: choice === 'not_bacteria' ? 'info' : 'warning',
      message: '卵圆形、明显较大且有出芽小体，形态不像细菌；真菌细胞壁不能用革兰阴阳二分判定。',
    });
  } else if (specimen.wall === 'gram_positive' && appearance !== 'purple') {
    findings.push({
      severity: 'error',
      message: '厚肽聚糖壁本应保留 CV-I，但最终画面不是稳定紫色，通常是脱色过度或前序染色不足。',
    });
  } else if (specimen.wall === 'gram_negative' && appearance === 'purple') {
    findings.push({
      severity: 'error',
      message: '薄肽聚糖壁和外膜应被酒精破坏；仍呈紫色通常说明脱色时间不足。',
    });
  }

  if (choice && !correct && !fatal) {
    findings.push({
      severity: 'error',
      message:
        expected === 'not_bacteria'
          ? '你把非细菌标本套入了革兰阴阳结论。'
          : '最终判读与细胞壁差分结果不符。',
    });
  }

  let explanation = '';
  if (fatal) {
    explanation = `${fatal.message}。操作序列已经破坏了标准革兰流程，本次不能作为有效判读，得分为 0；请换新涂片重做。`;
  } else if (specimen.kind === 'fungi') {
    explanation =
      choice === 'not_bacteria'
        ? '正确。视野中的大卵圆形细胞和出芽小体提示真菌（酵母样细胞）。即使其保留部分紫色，也不能据此称为革兰阳性；革兰染色的阴阳分类只用于细菌细胞壁差分。'
        : '真菌不是细菌，不能给出革兰阳性或阴性结论。应以出芽、卵圆形和细胞大小识别为酵母样真菌，并另选适合真菌的鉴定方法。';
  } else if (specimen.wall === 'gram_positive') {
    explanation =
      choice === 'positive'
        ? '正确。革兰阳性菌有厚而交联紧密的肽聚糖层、脂质少；酒精使其脱水、孔隙收缩，结晶紫-碘复合物被留住，番红不能覆盖深紫色。'
        : '这是革兰阳性菌。厚肽聚糖层在酒精中收缩并截留 CV-I；若看成红色，主要原因在操作时长而不是细胞壁。';
  } else {
    explanation =
      choice === 'negative'
        ? '正确。革兰阴性菌肽聚糖薄且外膜含脂质；酒精溶解外膜并抽出 CV-I，初染褪去后番红进入细胞，最终呈粉红/红色。'
        : '这是革兰阴性菌。酒精破坏富含脂质的外膜，薄肽聚糖层留不住 CV-I；番红复染后应判为革兰阴性。';
  }

  return {
    choice,
    correct,
    score,
    techniqueScore,
    identificationScore,
    passed,
    validProtocol: !fatal,
    fatalReason: fatal?.message,
    observed: {
      purpleRetention: Math.round(chemistry.cvIodineComplex * 100) / 100,
      safranin: Math.round(chemistry.safranin * 100) / 100,
      appearance,
    },
    timings,
    findings,
    actual:
      specimen.kind === 'fungi'
        ? {
            name: specimen.name,
            scientificName: specimen.scientificName,
            kind: 'fungi',
          }
        : {
            name: specimen.name,
            scientificName: specimen.scientificName,
            kind: 'bacteria',
            wall: specimen.wall,
          },
    explanation,
  };
}
