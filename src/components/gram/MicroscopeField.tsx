import type { LabFrame, RenderCell } from '../../../shared/gram-types';

type FilterMode = 'none' | 'deuteranopia' | 'grayscale';

interface Props {
  frame: LabFrame;
  filterMode: FilterMode;
}

const filterClass: Record<FilterMode, string> = {
  none: '',
  deuteranopia: 'gram-filter-deuteranopia',
  grayscale: 'gram-filter-grayscale',
};

function PatternOverlay({ cell, width, height }: { cell: RenderCell; width: number; height: number }) {
  if (cell.pattern === 'none' || cell.opacity < 0.4) return null;
  return (
    <rect
      x={-width / 2}
      y={-height / 2}
      width={width}
      height={height}
      rx={height / 2}
      fill={`url(#gram-pattern-${cell.pattern})`}
      opacity={cell.pattern === 'bud_rings' ? 0.92 : 0.82}
    />
  );
}

function CellShape({ cell }: { cell: RenderCell }) {
  const common = {
    fill: cell.fill.hex,
    fillOpacity: cell.opacity,
    stroke: '#1d2a27',
    strokeWidth: 0.35,
    strokeOpacity: 0.55,
  };

  if (cell.shape === 'rods') {
    const width = cell.rx * 2;
    const height = cell.ry * 2;
    return (
      <g transform={`translate(${cell.x} ${cell.y}) rotate(${cell.rotation})`}>
        <rect x={-cell.rx} y={-cell.ry} width={width} height={height} rx={cell.ry} {...common} />
        <PatternOverlay cell={cell} width={width} height={height} />
      </g>
    );
  }

  if (cell.shape === 'yeast') {
    const width = cell.rx * 2;
    const height = cell.ry * 2.16;
    return (
      <g transform={`translate(${cell.x} ${cell.y}) rotate(${cell.rotation})`}>
        <ellipse cx={0} cy={0} rx={cell.rx} ry={cell.ry * 1.08} {...common} />
        <ellipse
          cx={cell.rx * 0.72}
          cy={-cell.ry * 0.55}
          rx={cell.rx * 0.42}
          ry={cell.ry * 0.42}
          fill={cell.fill.hex}
          fillOpacity={Math.max(0.3, cell.opacity - 0.12)}
          stroke="#1d2a27"
          strokeWidth={0.25}
        />
        <PatternOverlay cell={cell} width={width} height={height} />
      </g>
    );
  }

  return (
    <g transform={`translate(${cell.x} ${cell.y}) rotate(${cell.rotation})`}>
      <circle r={cell.rx} {...common} />
      <PatternOverlay cell={cell} width={cell.rx * 2} height={cell.rx * 2} />
    </g>
  );
}

export function MicroscopeField({ frame, filterMode }: Props) {
  return (
    <div className={`relative overflow-hidden rounded-full border-4 border-slate-900 shadow-2xl ${filterClass[filterMode]}`}>
      <svg viewBox="0 0 100 100" className="block aspect-square w-full" role="img" aria-label={`显微镜视野：${frame.marker}`}>
        <defs>
          <radialGradient id="gram-vignette">
            <stop offset="68%" stopColor={frame.background.hex} />
            <stop offset="100%" stopColor="#c9c4b8" />
          </radialGradient>
          <pattern id="gram-pattern-dense_dots" width="1.8" height="1.8" patternUnits="userSpaceOnUse">
            <circle cx="0.55" cy="0.55" r="0.38" fill="#07110f" />
          </pattern>
          <pattern id="gram-pattern-open_lines" width="3.2" height="3.2" patternUnits="userSpaceOnUse">
            <path d="M0 .5 H3.2" stroke="#fff7e8" strokeWidth="0.55" />
            <path d="M1.6 0 V3.2" stroke="#fff7e8" strokeWidth="0.25" opacity="0.7" />
          </pattern>
          <pattern id="gram-pattern-bud_rings" width="5" height="5" patternUnits="userSpaceOnUse">
            <circle cx="2.5" cy="2.5" r="1.45" fill="none" stroke="#07110f" strokeWidth="0.32" />
            <circle cx="2.5" cy="2.5" r="0.55" fill="#fff7e8" opacity="0.72" />
          </pattern>
          <pattern id="gram-pattern-damaged_cross" width="3.5" height="3.5" patternUnits="userSpaceOnUse">
            <path d="M0 0 L3.5 3.5 M3.5 0 L0 3.5" stroke="#111" strokeWidth="0.45" />
            <path d="M0 0 L3.5 3.5 M3.5 0 L0 3.5" stroke="#fff7e8" strokeWidth="0.16" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#gram-vignette)" />
        <rect width="100" height="100" fill={frame.liquid.hex} opacity={frame.activeAction ? 0.32 : 0.06} />
        {frame.cells.map((cell) => <CellShape key={cell.id} cell={cell} />)}
        <circle cx="50" cy="50" r="48.5" fill="none" stroke="#5b5145" strokeWidth="0.8" opacity="0.45" />
      </svg>
      <div className="pointer-events-none absolute bottom-4 left-1/2 w-[78%] -translate-x-1/2 rounded-full bg-slate-950/80 px-4 py-1.5 text-center text-xs font-bold tracking-wide text-white">
        {frame.marker}
      </div>
    </div>
  );
}
