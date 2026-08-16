import React, { useMemo, useRef, useState } from 'react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, rectSortingStrategy, arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CardLayout, Device, DashboardLayout, DEFAULT_LAYOUT, metaFor, isCore,
} from './dashboard';
import {
  GripVertical, RotateCcw, Monitor, Smartphone, Lock, Minus, Plus, Check, LayoutDashboard,
} from 'lucide-react';

interface Props {
  layout: DashboardLayout;
  renderCard: (id: string) => React.ReactNode;
  onSave: (layout: DashboardLayout) => void;
  onCancel: () => void;
}

const HEIGHT_PRESETS: { label: string; h: number }[] = [
  { label: 'Auto', h: 0 },
  { label: 'S', h: 300 },
  { label: 'M', h: 460 },
  { label: 'L', h: 640 },
];

export const DashboardCustomizer: React.FC<Props> = ({ layout, renderCard, onSave, onCancel }) => {
  const [device, setDevice] = useState<Device>('web');
  const [draft, setDraft] = useState<DashboardLayout>(layout);
  const [dirty, setDirty] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const list = draft[device];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const update = (nextList: CardLayout[]) => {
    setDraft(prev => ({ ...prev, [device]: nextList }));
    setDirty(true);
  };

  const patch = (id: string, changes: Partial<CardLayout>) =>
    update(list.map(c => (c.id === id ? { ...c, ...changes } : c)));

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = list.findIndex(c => c.id === active.id);
    const newIndex = list.findIndex(c => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    update(arrayMove(list, oldIndex, newIndex));
  };

  const toggle = (id: string) => {
    if (isCore(id)) return;
    patch(id, { visible: !list.find(c => c.id === id)?.visible });
  };
  const setWidth = (id: string, w: number) => patch(id, { w: Math.min(12, Math.max(1, w)) });
  const setHeight = (id: string, h: number) => patch(id, { h });

  const resetDevice = () => {
    setDraft(prev => ({ ...prev, [device]: DEFAULT_LAYOUT[device].map(c => ({ ...c })) }));
    setDirty(true);
  };

  const save = () => { onSave(draft); setDirty(false); };

  // Drag the right edge to resize width (web only), snapping to grid columns.
  const startWidthResize = (id: string, startW: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const gridW = gridRef.current?.clientWidth || 1;
    const colW = gridW / 12;
    const startX = e.clientX;
    const move = (ev: PointerEvent) => setWidth(id, startW + Math.round((ev.clientX - startX) / colW));
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
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5 sticky top-0 z-20">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-brand-50 dark:bg-brand-500/10 text-brand-500 border border-brand-100 dark:border-brand-500/20 flex items-center justify-center">
              <LayoutDashboard size={20} />
            </div>
            <div>
              <h2 className="text-xl font-display font-black text-slate-900 dark:text-white tracking-tight">Dashboard Layout</h2>
              <p className="text-xs text-slate-400 font-medium">Tick to show/hide, drag the ⋮⋮ handle to reorder, resize width, and set height. Web &amp; mobile save separately.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={resetDevice} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Reset this view to default">
              <RotateCcw size={15} /> Reset
            </button>
            <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!dirty}
              className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save changes
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-1 w-fit">
          {devBtn('web', Monitor, 'Web')}
          {devBtn('mobile', Smartphone, 'Mobile')}
        </div>
      </div>

      {/* Live editable grid — real cards */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={list.map(c => c.id)} strategy={rectSortingStrategy}>
          <div
            ref={gridRef}
            className={device === 'web' ? 'grid grid-cols-12 gap-6' : 'flex flex-col gap-6 max-w-md mx-auto'}
            style={device === 'web' ? { gridAutoFlow: 'row dense', alignItems: 'start' } : undefined}
          >
            {list.map((c) => (
              <EditCard
                key={c.id}
                card={c}
                device={device}
                renderCard={renderCard}
                onToggle={() => toggle(c.id)}
                onWidthMinus={() => setWidth(c.id, c.w - 1)}
                onWidthPlus={() => setWidth(c.id, c.w + 1)}
                onHeight={(h) => setHeight(c.id, h)}
                onStartResize={startWidthResize(c.id, c.w)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};

interface CardProps {
  card: CardLayout;
  device: Device;
  renderCard: (id: string) => React.ReactNode;
  onToggle: () => void;
  onWidthMinus: () => void;
  onWidthPlus: () => void;
  onHeight: (h: number) => void;
  onStartResize: (e: React.PointerEvent) => void;
}

const EditCard: React.FC<CardProps> = ({ card, device, renderCard, onToggle, onWidthMinus, onWidthPlus, onHeight, onStartResize }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const m = metaFor(card.id);
  const core = isCore(card.id);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 30 : undefined,
    ...(device === 'web' ? { gridColumn: `span ${card.w} / span ${card.w}` } : {}),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative rounded-3xl border-2 transition-colors ${
        card.visible ? 'border-brand-300/60 dark:border-brand-500/30' : 'border-dashed border-slate-300 dark:border-slate-700'
      }`}
      {...attributes}
    >
      {/* Edit toolbar */}
      <div className="flex items-center gap-2 flex-wrap px-3 py-2 bg-slate-50 dark:bg-slate-800/60 rounded-t-3xl border-b border-slate-200/60 dark:border-slate-700/60">
        <button
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-grab active:cursor-grabbing touch-none"
          {...listeners}
          title="Drag to reorder"
        >
          <GripVertical size={18} />
        </button>

        {/* show/hide checkbox */}
        <button
          onClick={onToggle}
          disabled={core}
          className="flex items-center gap-1.5 disabled:cursor-not-allowed"
          title={core ? 'Always visible' : (card.visible ? 'Uncheck to hide' : 'Check to show')}
        >
          <span className={`w-4 h-4 rounded border flex items-center justify-center ${
            card.visible ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'
          }`}>
            {card.visible && <Check size={12} strokeWidth={3} />}
          </span>
          <span className="font-display font-black text-slate-800 dark:text-white text-sm truncate max-w-[9rem]">{m?.label || card.id}</span>
          {core && <Lock size={12} className="text-amber-500 shrink-0" />}
        </button>

        <div className="flex-1" />

        {device === 'web' && (
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mr-0.5">W</span>
            <button onClick={onWidthMinus} disabled={card.w <= 1} className="w-6 h-6 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 disabled:opacity-30 hover:border-brand-400"><Minus size={12} /></button>
            <span className="w-8 text-center text-[11px] font-bold tabular-nums text-slate-700 dark:text-slate-200">{card.w}/12</span>
            <button onClick={onWidthPlus} disabled={card.w >= 12} className="w-6 h-6 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 disabled:opacity-30 hover:border-brand-400"><Plus size={12} /></button>
          </div>
        )}

        <div className="flex items-center gap-1">
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mr-0.5">H</span>
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

      {/* Real card preview (non-interactive while editing) */}
      <div
        className={`relative overflow-hidden rounded-b-3xl ${card.visible ? '' : 'opacity-40 grayscale'}`}
        style={card.h > 0 ? { height: card.h } : undefined}
      >
        <div className="pointer-events-none">
          {renderCard(card.id)}
        </div>
        {!card.visible && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 bg-white/80 dark:bg-slate-900/80 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">Hidden</span>
          </div>
        )}
      </div>

      {/* Right-edge width resize handle (web only) */}
      {device === 'web' && (
        <div
          onPointerDown={onStartResize}
          className="hidden md:block absolute top-14 bottom-3 right-0 w-2 rounded-full cursor-col-resize bg-brand-400/0 hover:bg-brand-400/60 transition-colors"
          title="Drag to resize width"
        />
      )}
    </div>
  );
};
