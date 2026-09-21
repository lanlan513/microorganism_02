import type { CellGeometry, GramMorphology } from './types.js';

/** 确定性 PRNG：同一种子必须在任何机器上生成同一片细胞布局 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const FIELD_RADIUS = 230;

function insideField(x: number, y: number, margin = 0): boolean {
  return x * x + y * y <= (FIELD_RADIUS - margin) ** 2;
}

export function generateCells(morphology: GramMorphology, seed: number): CellGeometry[] {
  const random = createSeededRandom(seed);
  const cells: CellGeometry[] = [];
  let id = 1;
  const add = (cell: Omit<CellGeometry, 'id'>) => cells.push({ id: id++, ...cell });

  if (morphology === 'cocci') {
    for (let cluster = 0; cluster < 6; cluster += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 35 + random() * 145;
      const centerX = Math.cos(angle) * radius;
      const centerY = Math.sin(angle) * radius;
      const count = 5 + Math.floor(random() * 4);
      for (let i = 0; i < count; i += 1) {
        const offsetAngle = random() * Math.PI * 2;
        const offsetRadius = random() * 24;
        const x = centerX + Math.cos(offsetAngle) * offsetRadius;
        const y = centerY + Math.sin(offsetAngle) * offsetRadius;
        if (!insideField(x, y, 18)) continue;
        add({
          shape: 'coccus',
          x,
          y,
          radius: 7.2 + random() * 2.8,
          rotation: random() * 360,
          shade: random(),
        });
      }
    }
  }

  if (morphology === 'rods') {
    while (cells.length < 44) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * (FIELD_RADIUS - 22);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (!insideField(x, y, 22)) continue;
      add({
        shape: 'rod',
        x,
        y,
        width: 20 + random() * 8,
        height: 7.5 + random() * 2.5,
        rotation: random() * 360,
        shade: random(),
      });
    }
  }

  if (morphology === 'budding-oval') {
    while (cells.length < 16) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * (FIELD_RADIUS - 42);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const rx = 18 + random() * 10;
      const ry = 13 + random() * 7;
      if (!insideField(x, y, Math.max(rx, ry) + 8)) continue;
      const hasBud = random() > 0.35;
      const bud = hasBud
        ? {
            x: rx * (0.72 + random() * 0.15),
            y: -ry * (0.08 + random() * 0.22),
            radius: 6.5 + random() * 3.5,
          }
        : undefined;
      add({
        shape: 'oval',
        x,
        y,
        rx,
        ry,
        rotation: random() * 360,
        shade: random(),
        bud,
      });
    }
  }

  return cells;
}

export const FIELD_SIZE = 520;
