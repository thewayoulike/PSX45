import React, { useMemo, useRef, useState } from 'react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, rectSortingStrategy, arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CardLayout, Device, DashboardLayout, DEFAULT_LAYOUT,
  metaFor, isCore, visibleOrdered, hiddenCards,
} from './dashboard';
import {
  GripVertical, EyeOff, Plus, RotateCcw, Monitor, Smartphone, Lock,
  Minus, Maximize2, LayoutDashboard,
} from 'lucide-react';

interface Props {
  layout: DashboardLayout;
  onChange: (l: DashboardLayout) => void;
  onDone?: () => void;
}

const HEIGHT_PRESETS: { label: string; h: number }[] = [
  { label: 'Auto', h: 0 },
  { label: 'S', h: 300 },
  { label: 'M', h: 460 },
  { label: 'L', h: 640 },
];

export const DashboardCustomizer: React.FC<Props> = ({ layout, onChange, onDone }) => {
  const [device, setDevice] = useState<Device>('web');
  const gridRef = useRef<HTMLDivElement>(null);

  const list = layout[device];
  const visible = useMemo(() => visibleOrdered(list), [list]);
  const hidden = useMemo(() => hiddenCards(list), [list]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Invariant: device array = [...visibleInOrder, ...hiddenInOrder]
  const commit = (nextVisible: CardLayout[], nextHidden: CardLayout[]) => {
    onChange({ ...layout, [device]: [...nextVisible, ...nextHidden] });
  };

  const patch = (id: string, changes: Partial<CardLayout>) => {
    onChange({
      ...layout,
      [device]: list.map(c => (c.id === id ? { ...c, ...changes } : c)),
    });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = visible.findIndex(c => c.id === active.id);
    const newIndex = visible.findIndex(c => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    commit(arrayMove(visible, oldIndex, newIndex), hidden);
  };

  const hide = (id: string) => {
    if (isCore(id)) return;
    const card = visible.find(c => c.id === id);
    if (!card) return;
    commit(visible.filter(c => c.id !== id), [...hidden, card]);
  };

  const show = (id: string) => {
    const card = hidden.find(c => c.id === id);
    if (!card) return;
    commit([...visible, { ...card, visible: true }], hidden.filter(c => c.id !== id));
  };

  const setWidth = (id: string, w: number) =>
    patch(id, { w: Math.min(12, Math.max(1, w)) });

  const setHeight = (id: string, h: number) => patch(id, { h });

  const resetDevice = () => {
    onChange({ ...layout, [device]: DEFAULT_LAYOUT[device].map(c => ({ ...c })) });
  };

  // Drag the right edge to resize width (web only), snapping to grid columns.
  const startWidthResize = (id: string, startW: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const gridW = gridRef.current?.clientWidth || 1;
    const colW = gridW / 12;
    const startX = e.clientX;
    const move = (ev: PointerEvent) => {
      const dCols = Math.round((ev.clientX - startX) / colW);
      setWidth(id, startW + dCols);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const devBtn = (d: Device, Icon: any, label: string) => {
    const on = device === d;
    return (
      <button
        onClick={() => setDevice(d)}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
          on ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <Icon size={16} /> {label}
      </button>
    );
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-brand-50 dark:bg-brand-500/10 text-brand-500 border border-brand-100 dark:border-brand-500/20 flex items-center justify-center">
              <LayoutDashboard size={20} />
            </div>
            <div>
              <h2 className="text-xl font-display font-black text-slate-900 dark:text-white tracking-tight">Dashboard Layout</h2>
              <p className="text-xs text-slate-400 font-medium">Drag to reorder, resize width, set height, and show/hide cards. Web &amp; mobile save separately.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={resetDevice} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Reset this view to default">
              <RotateCcw size={15} /> Reset
            </button>
            {onDone && (
              <button onClick={onDone} className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold transition-colors">
                Done
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-1 w-fit">
          {devBtn('web', Monitor, 'Web')}
          {devBtn('mobile', Smartphone, 'Mobile')}
        </div>
      </div>

      {/* Editable grid */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visible.map(c => c.id)} strategy={rectSortingStrategy}>
          <div
            ref={gridRef}
            className={device === 'web' ? 'grid grid-cols-12 gap-3' : 'flex flex-col gap-3 max-w-sm mx-auto'}
            style={device === 'web' ? { gridAutoFlow: 'row dense', alignItems: 'start' } : undefined}
          >
            {visible.map((c) => (
              <SortableCard
                key={c.id}
                card={c}
                device={device}
                onHide={() => hide(c.id)}
                onWidthMinus={() => setWidth(c.id, c.w - 1)}
                onWidthPlus={() => setWidth(c.id, c.w + 1)}
                onHeight={(h) => setHeight(c.id, h)}
                onStartResize={startWidthResize(c.id, c.w)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Hidden / add palette */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5">
        <h3 className="text-sm font-display font-black text-slate-900 dark:text-white uppercase tracking-widest mb-3">Hidden cards</h3>
        {hidden.length === 0 ? (
          <p className="text-sm text-slate-400">All cards are on your dashboard.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {hidden.map((c) => {
              const m = metaFor(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => show(c.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-300 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                >
                  <Plus size={15} /> {m?.label || c.id}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

interface CardProps {
  card: CardLayout;
  device: Device;
  onHide: () => void;
  onWidthMinus: () => void;
  onWidthPlus: () => void;
  onHeight: (h: number) => void;
  onStartResize: (e: React.PointerEvent) => void;
}

const SortableCard: React.FC<CardProps> = ({ card, device, onHide, onWidthMinus, onWidthPlus, onHeight, onStartResize }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const m = metaFor(card.id);
  const core = isCore(card.id);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    ...(device === 'web' ? { gridColumn: `span ${card.w} / span ${card.w}` } : {}),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 select-none"
      {...attributes}
    >
      <div className="flex items-start gap-2">
        <button
          className="mt-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-grab active:cursor-grabbing touch-none"
          {...listeners}
          title="Drag to reorder"
        >
          <GripVertical size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-display font-black text-slate-800 dark:text-white text-sm truncate">{m?.label || card.id}</span>
            {core && <Lock size={12} className="text-amber-500 shrink-0" title="Always visible" />}
          </div>
          {m?.hint && <p className="text-[11px] text-slate-400 truncate">{m.hint}</p>}
        </div>
        {core ? (
          <span className="text-[9px] font-bold uppercase tracking-widest text-amber-500 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 rounded">Locked</span>
        ) : (
          <button onClick={onHide} className="text-slate-400 hover:text-rose-500 transition-colors" title="Hide card">
            <EyeOff size={16} />
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        {device === 'web' && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mr-1">Width</span>
            <button onClick={onWidthMinus} disabled={card.w <= 1} className="w-6 h-6 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 disabled:opacity-30 hover:border-brand-400"><Minus size={12} /></button>
            <span className="w-8 text-center text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">{card.w}/12</span>
            <button onClick={onWidthPlus} disabled={card.w >= 12} className="w-6 h-6 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 disabled:opacity-30 hover:border-brand-400"><Plus size={12} /></button>
          </div>
        )}

        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mr-1">Height</span>
          {HEIGHT_PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => onHeight(p.h)}
              className={`px-2 h-6 rounded-lg text-[11px] font-bold border transition-colors ${
                card.h === p.h
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-brand-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Right-edge width resize handle (web only) */}
      {device === 'web' && (
        <div
          onPointerDown={onStartResize}
          className="hidden md:flex absolute top-1/2 -translate-y-1/2 right-0 h-10 w-3 items-center justify-center cursor-col-resize text-slate-300 hover:text-brand-500"
          title="Drag to resize width"
        >
          <Maximize2 size={12} className="rotate-45" />
        </div>
      )}
    </div>
  );
};
