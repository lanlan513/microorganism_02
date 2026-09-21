export type ColorVisionMode = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia';

/**
 * Machado 2009 色觉缺陷 RGB 线性矩阵（sRGB 域近似）。
 * 滤镜只用于自检；真正的信息冗余由纹理 + 文字完成。
 */
export const CVD_MATRICES: Record<Exclude<ColorVisionMode, 'normal'>, number[]> = {
  protanopia: [0.152, 1.053, -0.205, 0.115, 0.786, 0.099, -0.004, -0.048, 1.052],
  deuteranopia: [0.367, 0.861, -0.228, 0.28, 0.673, 0.047, -0.012, 0.043, 0.969],
  tritanopia: [1.255, -0.077, -0.178, -0.078, 0.931, 0.148, 0.005, 0.691, 0.304],
};
