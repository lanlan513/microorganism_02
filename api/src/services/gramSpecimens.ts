import type { InternalSpecimen } from '../../../shared/gram/scoring.js';

/**
 * 真实标本库只放在服务端模块中；接口只暴露形态线索、种子和动力学标量。
 * 0.030 s^-1：厚肽聚糖 10 秒后仍保留约 74%；
 * 0.230 s^-1：薄壁/外膜 10 秒后基本褪去；
 * 0.040 s^-1：真菌厚壁可残留部分染料，但形态会明确暴露它不是细菌。
 */
export const GRAM_SPECIMENS: InternalSpecimen[] = [
  {
    code: '涂片 A',
    name: '金黄色葡萄球菌',
    scientificName: 'Staphylococcus aureus',
    kind: 'bacteria',
    wall: 'gram_positive',
    morphologyType: 'cocci',
    clue: '球形细胞成堆出现；仅凭形态不能告诉玩家细胞壁答案。',
    seed: 10271,
    kinetics: { decolorRate: 0.03 },
  },
  {
    code: '涂片 B',
    name: '大肠埃希菌',
    scientificName: 'Escherichia coli',
    kind: 'bacteria',
    wall: 'gram_negative',
    morphologyType: 'rods',
    clue: '散在杆状细胞；请用差分染色结果判断。',
    seed: 40983,
    kinetics: { decolorRate: 0.23 },
  },
  {
    code: '涂片 C',
    name: '白色念珠菌',
    scientificName: 'Candida albicans',
    kind: 'fungi',
    morphologyType: 'budding-oval',
    clue: '大卵圆形结构，部分有小芽；注意它是否适用细菌分类。',
    seed: 77317,
    kinetics: { decolorRate: 0.04 },
  },
];
