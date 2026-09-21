import { useMemo } from 'react';
import { generateCells } from '../../../shared/gram';
import type { CellGeometry, GramVerdict, RenderFrame, RGB } from '../../../shared/gram';
import { rgbToCss } from '../../../shared/gram';
import type { ColorVisionMode } from './colorVision';
import { CVD_MATRICES } from './colorVision';

interface MicroscopeFieldProps {
  frame: RenderFrame;
  morphology: Parameters<typeof generateCells>[0];
  seed: number;
  verdict?: GramVerdict | null;
  colorVision: ColorVisionMode;
}

function cellTransform(cell: CellGeometry): string {
  return `translate(${cell.x} ${cell.y}) rotate(${cell.rotation})`;
}

function CellShape({
  cell,
  fill,
  stroke,
  verdict,
}: {
  cell: CellGeometry;
  fill: string;
  stroke: string;
  verdict: GramVerdict | null;
}) {
  const texture =
    verdict === 'positive'
      ? 'url(#g-plus-dots)'
      : verdict === 'negative'
        ? 'url(#g-minus-dashes)'
        : verdict === 'not_bacteria'
          ? 'url(#g-fungus-lines)'
          : undefined;

  if (cell.shape === 'coccus') {
    const radius = cell.radius ?? 8;
    return (
      <g transform={cellTransform(cell)}>
        <circle r={radius} fill={fill} stroke={stroke} strokeWidth={1.2} />
        {texture && <circle r={radius} fill={texture} opacity={0.32} />}
        {verdict === 'positive' && (
          <text
            y={2.8}
            textAnchor="middle"
            fontSize={radius * 1.15}
            fontWeight={800}
            fill="#07110f"
            opacity={0.78}
          >
            +
          </text>
        )}
        {verdict === 'negative' && (
          <line
            x1={-radius * 0.45}
            y1={0}
            x2={radius * 0.45}
            y2={0}
            stroke="#07110f"
            strokeWidth={1.4}
            opacity={0.75}
          />
        )}
      </g>
    );
  }

  if (cell.shape === 'rod') {
    const width = cell.width ?? 22;
    const height = cell.height ?? 8;
    return (
      <g transform={cellTransform(cell)}>
        <rect
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          rx={height / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={1.2}
          strokeDasharray={verdict === 'negative' ? `${3} ${2}` : undefined}
        />
        {texture && (
          <rect
            x={-width / 2}
            y={-height / 2}
            width={width}
            height={height}
            rx={height / 2}
            fill={texture}
            opacity={0.3}
          />
        )}
        {verdict === 'positive' && (
          <text
            x={0}
            y={2.6}
            textAnchor="middle"
            fontSize={height * 1.05}
            fontWeight={800}
            fill="#07110f"
            opacity={0.78}
          >
            +
          </text>
        )}
        {verdict === 'negative' && (
          <line x1={-width * 0.25} y1={0} x2={width * 0.25} y2={0} stroke="#07110f" strokeWidth={1.3} />
        )}
      </g>
    );
  }

  const rx = cell.rx ?? 22;
  const ry = cell.ry ?? 16;
  return (
    <g transform={cellTransform(cell)}>
      <ellipse
        rx={rx}
        ry={ry}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.5}
        strokeDasharray={verdict === 'not_bacteria' ? `${7} ${4}` : undefined}
      />
      {texture && <ellipse rx={rx} ry={ry} fill={texture} opacity={0.32} />}
      {cell.bud && (
        <circle
          cx={cell.bud.x}
          cy={cell.bud.y}
          r={cell.bud.radius}
          fill={fill}
          stroke={stroke}
          strokeWidth={1.2}
        />
      )}
      {verdict === 'not_bacteria' && (
        <text y={5} textAnchor="middle" fontSize={15} fontWeight={800} fill="#07110f" opacity={0.8}>
          F
        </text>
      )}
    </g>
  );
}

export function MicroscopeField({ frame, morphology, seed, verdict, colorVision }: MicroscopeFieldProps) {
  const cells = useMemo(() => generateCells(morphology, seed), [morphology, seed]);
  const filter = colorVision === 'normal' ? undefined : `url(#cvd-${colorVision})`;
  const verdictLabel =
    verdict === 'positive' ? 'G+ 阳性' : verdict === 'negative' ? 'G− 阴性' : verdict === 'not_bacteria' ? 'F 非细菌' : '';

  const labelFill: RGB = verdict === 'positive'
    ? { r: 22, g: 25, b: 35 }
    : verdict === 'negative'
      ? { r: 255, g: 239, b: 230 }
      : { r: 255, g: 248, b: 203 };

  return (
    <svg viewBox="-260 -260 520 520" className="w-full h-full" role="img" aria-label="显微镜染色视野">
      <defs>
        <clipPath id="microscope-clip">
          <circle r={230} />
        </clipPath>
        <radialGradient id="scope-vignette">
          <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
          <stop offset="72%" stopColor="rgba(255,255,255,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.58)" />
        </radialGradient>
        <pattern id="g-plus-dots" width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="1.2" cy="1.2" r="0.8" fill="#07110f" />
        </pattern>
        <pattern id="g-minus-dashes" width="7" height="5" patternUnits="userSpaceOnUse">
          <path d="M0 2.5 H4" stroke="#07110f" strokeWidth="1" />
        </pattern>
        <pattern id="g-fungus-lines" width="7" height="7" patternUnits="userSpaceOnUse">
          <path d="M-2 7 L7 -2 M2 9 L9 2" stroke="#07110f" strokeWidth="0.8" />
        </pattern>

        {(Object.keys(CVD_MATRICES) as Array<keyof typeof CVD_MATRICES>).map((mode) => (
          <filter key={mode} id={`cvd-${mode}`} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={CVD_MATRICES[mode].join(' ')} />
          </filter>
        ))}
      </defs>

      <g filter={filter}>
        <circle r={250} fill="#050b0a" />
        <g clipPath="url(#microscope-clip)">
          <circle r={230} fill={rgbToCss(frame.fieldColor)} />
          {cells.map((cell, index) => (
            <CellShape
              key={cell.id}
              cell={cell}
              fill={rgbToCss(frame.cellColors[index])}
              stroke={rgbToCss(frame.cellEdgeColors[index])}
              verdict={verdict ?? null}
            />
          ))}
          <circle r={230} fill="url(#scope-vignette)" pointerEvents="none" />
        </g>
        <circle r={230} fill="none" stroke="#d7fff2" strokeOpacity={0.25} strokeWidth={2} />
        <circle r={242} fill="none" stroke="#000" strokeOpacity={0.8} strokeWidth={18} />

        {verdict && (
          <g transform="translate(-218 -238)">
            <rect width={112} height={30} rx={15} fill={rgbToCss(labelFill)} stroke="#fff" strokeOpacity={0.45} />
            <text x={56} y={20} textAnchor="middle" fontSize={15} fontWeight={800} fill={verdict === 'positive' ? '#e9fff8' : '#101010'}>
              {verdictLabel}
            </text>
          </g>
        )}
      </g>
    </svg>
  );
}
