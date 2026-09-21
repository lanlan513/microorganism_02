import type { RGB } from './types.js';

/**
 * 这里不做 RGB 插值。染色剂以“光谱吸光度”表示，多层染料相乘透射：
 * T(lambda) = 10^-A(lambda)，再经标准观察者三刺激值转成 sRGB。
 */
export const VISIBLE_WAVELENGTHS = Object.freeze(
  Array.from({ length: 31 }, (_, i) => 400 + i * 10)
);

const round6 = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

export interface AbsorptionBand {
  peak: number;
  width: number;
  amplitude: number;
}

const bandAt = (wavelength: number, bands: Array<AbsorptionBand | number>): number =>
  bands.reduce<number>((sum, band) => {
    if (typeof band === 'number') return sum + band;
    const delta = wavelength - band.peak;
    return sum + band.amplitude * Math.exp(-(delta * delta) / (2 * band.width * band.width));
  }, 0);

/** CIE 1931 标准观察者的高斯近似（400–700 nm，10 nm 采样） */
export const colorMatchingFunctions = VISIBLE_WAVELENGTHS.map((wavelength) => {
  const x =
    1.056 * Math.exp(-((wavelength - 599.8) ** 2) / (2 * 37.9 ** 2)) +
    0.362 * Math.exp(-((wavelength - 442) ** 2) / (2 * 18 ** 2));
  const y = 1.014 * Math.exp(-((wavelength - 555.8) ** 2) / (2 * 24.7 ** 2));
  const z = 1.839 * Math.exp(-((wavelength - 450.3) ** 2) / (2 * 22 ** 2));
  return { x, y, z };
});

/** 近等能白光；显微镜照明在可见光波段近似均匀 */
const illuminance = VISIBLE_WAVELENGTHS.map(() => 1);

/** 吸去黄绿、透过蓝与红，所以呈紫色 */
export const CRYSTAL_VIOLET_BANDS: AbsorptionBand[] = [
  { peak: 588, width: 48, amplitude: 1.65 },
  { peak: 535, width: 24, amplitude: 0.42 },
];

/** CV-I 复合物：吸收带更宽、留在厚肽聚糖层内时呈深紫 */
export const CV_IODINE_BANDS: AbsorptionBand[] = [
  { peak: 570, width: 82, amplitude: 1.28 },
  { peak: 620, width: 34, amplitude: 0.34 },
];

/** 碘液本身偏棕黄：吸收部分蓝光 */
export const IODINE_BANDS: AbsorptionBand[] = [{ peak: 450, width: 68, amplitude: 0.42 }];

/** 番红吸收蓝紫光与绿光，主要透过红光，因此呈粉红/红色 */
export const SAFRANIN_BANDS: AbsorptionBand[] = [
  { peak: 520, width: 46, amplitude: 1.48 },
  { peak: 455, width: 28, amplitude: 0.58 },
];

const GLASS_ABSORBANCE = 0.028;
const CELL_BASE_ABSORBANCE = 0.17;
const CELL_PROTEIN_BANDS: AbsorptionBand[] = [{ peak: 420, width: 42, amplitude: 0.055 }];

export interface SpectralStain {
  crystalViolet?: number;
  cvIodineComplex?: number;
  iodine?: number;
  safranin?: number;
  cellBase?: number;
  glass?: boolean;
}

export function absorbanceSpectrum(stain: SpectralStain): number[] {
  return VISIBLE_WAVELENGTHS.map((wavelength) => {
    let absorbance = 0;
    if (stain.glass) absorbance += GLASS_ABSORBANCE;
    if (stain.cellBase) {
      absorbance += CELL_BASE_ABSORBANCE * stain.cellBase;
      absorbance += bandAt(wavelength, CELL_PROTEIN_BANDS) * stain.cellBase;
    }
    if (stain.crystalViolet) absorbance += bandAt(wavelength, CRYSTAL_VIOLET_BANDS) * stain.crystalViolet;
    if (stain.cvIodineComplex) absorbance += bandAt(wavelength, CV_IODINE_BANDS) * stain.cvIodineComplex;
    if (stain.iodine) absorbance += bandAt(wavelength, IODINE_BANDS) * stain.iodine;
    if (stain.safranin) absorbance += bandAt(wavelength, SAFRANIN_BANDS) * stain.safranin;
    return absorbance;
  });
}

export function spectrumToRGB(absorbance: number[]): RGB {
  let X = 0;
  let Y = 0;
  let Z = 0;

  colorMatchingFunctions.forEach((cmf, index) => {
    const light = illuminance[index];
    const transmission = 10 ** -Math.min(absorbance[index], 4);
    X += light * transmission * cmf.x;
    Y += light * transmission * cmf.y;
    Z += light * transmission * cmf.z;
  });

  // 先归一到等能白光，再映射到 XYZ/D65 参考白点后使用 sRGB 矩阵
  X = (X / 11.631824679084792) * 0.95047;
  Y /= 6.2780510401332705;
  Z = (Z / 10.08436759733667) * 1.08883;

  // XYZ -> linear sRGB, D65
  let linearR = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  let linearG = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  let linearB = 0.0557 * X - 0.204 * Y + 1.057 * Z;

  linearR = Math.min(1, Math.max(0, linearR));
  linearG = Math.min(1, Math.max(0, linearG));
  linearB = Math.min(1, Math.max(0, linearB));

  const gamma = (value: number) =>
    value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;

  return {
    r: Math.round(round6(gamma(linearR)) * 255),
    g: Math.round(round6(gamma(linearG)) * 255),
    b: Math.round(round6(gamma(linearB)) * 255),
  };
}

export function rgbToCss({ r, g, b }: RGB): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/** 用于日志/检查项，不参与动画插值 */
export function rgbKey({ r, g, b }: RGB): string {
  return `${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b
    .toString(16)
    .padStart(2, '0')}`;
}
