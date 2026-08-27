import React from 'react';
import {
  MousePointer2,
  Crosshair,
  TrendingUp,
  Minus,
  MoveVertical,
  Square,
  Trash2,
  Eraser,
  MousePointerClick,
  Percent,
} from 'lucide-react';
import {
  ChartDrawing,
  DrawRenderCoords,
  DrawTool,
  DEFAULT_DRAW_COLOR,
  SELECTED_DRAW_COLOR,
  FIB_RETRACEMENT_LEVELS,
  fibRetracePrice,
  xAtTime,
  yAtPrice,
} from '../utils/chartDrawings';

const TOOLS: { id: DrawTool; label: string; icon: React.ReactNode; title: string }[] = [
  { id: 'pan', label: 'Pan', icon: <MousePointer2 size={14} />, title: 'Pan chart (drag)' },
  { id: 'crosshair', label: 'Cross', icon: <Crosshair size={14} />, title: 'Crosshair' },
  { id: 'trendline', label: 'Trend', icon: <TrendingUp size={14} />, title: 'Trend line (2 clicks)' },
  { id: 'fib', label: 'Fib', icon: <Percent size={14} />, title: 'Fib retracement (2 clicks)' },
  { id: 'hline', label: 'H-Line', icon: <Minus size={14} />, title: 'Horizontal line' },
  { id: 'vline', label: 'V-Line', icon: <MoveVertical size={14} />, title: 'Vertical line' },
  { id: 'rect', label: 'Box', icon: <Square size={14} />, title: 'Rectangle (drag)' },
  { id: 'select', label: 'Select', icon: <MousePointerClick size={14} />, title: 'Select & delete (Del)' },
];

export const DrawToolsToolbar: React.FC<{
  tool: DrawTool;
  onToolChange: (t: DrawTool) => void;
  drawingCount: number;
  hasSelection: boolean;
  onDeleteSelected: () => void;
  onClearAll: () => void;
  disabled?: boolean;
}> = ({ tool, onToolChange, drawingCount, hasSelection, onDeleteSelected, onClearAll, disabled }) => (
  <div
    className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 flex-wrap"
    onPointerDown={(e) => e.stopPropagation()}
  >
    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 px-1.5 hidden sm:inline">Draw</span>
    {TOOLS.map((t) => (
      <button
        key={t.id}
        type="button"
        disabled={disabled}
        title={t.title}
        onClick={() => onToolChange(t.id)}
        className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all disabled:opacity-40 ${
          tool === t.id
            ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
        }`}
      >
        {t.icon}
        <span className="hidden md:inline">{t.label}</span>
      </button>
    ))}
    {hasSelection && (
      <button
        type="button"
        onClick={onDeleteSelected}
        title="Delete selected (Del)"
        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold text-rose-500 hover:bg-white dark:hover:bg-slate-900 transition-all"
      >
        <Trash2 size={14} />
      </button>
    )}
    {drawingCount > 0 && (
      <button
        type="button"
        onClick={onClearAll}
        title="Clear all drawings"
        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold text-slate-400 hover:text-rose-500 hover:bg-white dark:hover:bg-slate-900 transition-all"
      >
        <Eraser size={14} />
      </button>
    )}
  </div>
);

function renderDrawing(
  d: ChartDrawing,
  coords: DrawRenderCoords,
  selected: boolean,
  draft = false
): React.ReactNode {
  const color = selected ? SELECTED_DRAW_COLOR : d.color || DEFAULT_DRAW_COLOR;
  const strokeW = selected ? 2.5 : 1.75;
  const dash = draft ? '6 4' : undefined;
  const { barTimes, plotOffset, slot, plotLeft, plotRight, yMin, yMax, padTop, innerH } = coords;

  switch (d.type) {
    case 'hline': {
      const y = yAtPrice(d.price, yMin, yMax, padTop, innerH);
      return (
        <g key={d.id}>
          <line x1={plotLeft} x2={plotRight} y1={y} y2={y} stroke={color} strokeWidth={strokeW} strokeDasharray={dash} />
          {selected && (
            <text x={plotRight - 4} y={y - 6} textAnchor="end" fontSize={9} fill={color} fontWeight={700}>
              {d.price.toFixed(2)}
            </text>
          )}
        </g>
      );
    }
    case 'vline': {
      const x = xAtTime(d.time, barTimes, plotOffset, slot);
      return (
        <g key={d.id}>
          <line x1={x} x2={x} y1={coords.plotTop} y2={coords.plotBottom} stroke={color} strokeWidth={strokeW} strokeDasharray={dash} />
        </g>
      );
    }
    case 'trendline': {
      const x1 = xAtTime(d.p1.time, barTimes, plotOffset, slot);
      const y1 = yAtPrice(d.p1.price, yMin, yMax, padTop, innerH);
      const x2 = xAtTime(d.p2.time, barTimes, plotOffset, slot);
      const y2 = yAtPrice(d.p2.price, yMin, yMax, padTop, innerH);
      return (
        <g key={d.id}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={strokeW} strokeDasharray={dash} />
          {selected && (
            <>
              <circle cx={x1} cy={y1} r={4} fill={color} />
              <circle cx={x2} cy={y2} r={4} fill={color} />
            </>
          )}
        </g>
      );
    }
    case 'fib': {
      const x1 = xAtTime(d.p1.time, barTimes, plotOffset, slot);
      const y1 = yAtPrice(d.p1.price, yMin, yMax, padTop, innerH);
      const x2 = xAtTime(d.p2.time, barTimes, plotOffset, slot);
      const y2 = yAtPrice(d.p2.price, yMin, yMax, padTop, innerH);
      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      return (
        <g key={d.id}>
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={color}
            strokeWidth={strokeW}
            strokeDasharray={draft ? '6 4' : '3 3'}
            opacity={0.55}
          />
          {FIB_RETRACEMENT_LEVELS.map(({ level, label }) => {
            const price = fibRetracePrice(d.p1, d.p2, level);
            const y = yAtPrice(price, yMin, yMax, padTop, innerH);
            return (
              <g key={`${d.id}-fib-${label}`}>
                <line
                  x1={plotLeft}
                  x2={plotRight}
                  y1={y}
                  y2={y}
                  stroke={color}
                  strokeWidth={strokeW}
                  strokeDasharray={dash}
                  opacity={level === 0 || level === 1 ? 1 : 0.85}
                />
                <text
                  x={plotRight - 4}
                  y={y - 4}
                  textAnchor="end"
                  fontSize={9}
                  fill={color}
                  fontWeight={700}
                  opacity={0.95}
                >
                  {label} ({price.toFixed(2)})
                </text>
              </g>
            );
          })}
          <rect
            x={left}
            y={Math.min(y1, y2)}
            width={Math.max(1, right - left)}
            height={Math.max(1, Math.abs(y2 - y1))}
            fill={color}
            fillOpacity={0.04}
            stroke="none"
          />
          {selected && (
            <>
              <circle cx={x1} cy={y1} r={4} fill={color} />
              <circle cx={x2} cy={y2} r={4} fill={color} />
            </>
          )}
        </g>
      );
    }
    case 'rect': {
      const x1 = xAtTime(d.p1.time, barTimes, plotOffset, slot);
      const y1 = yAtPrice(d.p1.price, yMin, yMax, padTop, innerH);
      const x2 = xAtTime(d.p2.time, barTimes, plotOffset, slot);
      const y2 = yAtPrice(d.p2.price, yMin, yMax, padTop, innerH);
      const x = Math.min(x1, x2);
      const y = Math.min(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      return (
        <g key={d.id}>
          <rect
            x={x}
            y={y}
            width={Math.max(1, w)}
            height={Math.max(1, h)}
            fill={color}
            fillOpacity={0.08}
            stroke={color}
            strokeWidth={strokeW}
            strokeDasharray={dash}
          />
          {selected && (
            <>
              <circle cx={x1} cy={y1} r={4} fill={color} />
              <circle cx={x2} cy={y2} r={4} fill={color} />
            </>
          )}
        </g>
      );
    }
    default:
      return null;
  }
}

export const ChartDrawingsLayer: React.FC<{
  drawings: ChartDrawing[];
  draft: ChartDrawing | null;
  selectedId: string | null;
  coords: DrawRenderCoords;
}> = ({ drawings, draft, selectedId, coords }) => (
  <>
    {drawings.map((d) => renderDrawing(d, coords, d.id === selectedId))}
    {draft && renderDrawing(draft, coords, true, true)}
  </>
);
