import React, { useMemo, useState, useEffect } from 'react';
// @ts-ignore - react-grid-layout ships without bundled types
import GridLayout, { WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './dashboard-grid.css';
import {
  CardLayout, Device, DashboardLayout, defaultLayoutFor,
  COLS, ROW_HEIGHT, GRID_MARGIN, metaFor, isCore, minFor, PSX_ONLY_CARD_IDS,
} from './dashboard';
import { PortfolioType } from '../types';
import { FitScale } from './FitScale';
import { GripVertical, RotateCcw, Monitor, Smartphone, Lock, Minus, Plus, Check, LayoutDashboard } from 'lucide-react';

const RGL: any = WidthProvider(GridLayout as any);

interface Props {
  layout: DashboardLayout;
  portfolioType?: PortfolioType;
  renderCard: (id: string) => React.ReactNode;
  onSave: (layout: DashboardLayout) => void;
  onCancel: () => void;
}

export const DashboardCustomizer: React.FC<Props> = ({ layout, portfolioType = 'PSX', renderCard, onSave, onCancel }) => {
  const isFund = portfolioType === 'MUTUAL_FUND';
  const [device, setDevice] = useState<Device>('web');
  const [draft, setDraft] = useState<DashboardLayout>(layout);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(layout);
    setDirty(false);
  }, [layout, portfolioType]);

  const list = draft[device].filter(c => !(isFund && PSX_ONLY_CARD_IDS.has(c.id)));

  const rglLayout = useMemo(
    () => list.map(c => {
      const { minW, minH } = minFor(c.id, device);
      return { i: c.id, x: c.x, y: c.y, w: c.w, h: Math.max(minH, c.h), minW, minH };
    }),
    [list, device]
  );

  const applyCoords = (l: any[]) => {
    setDraft(prev => {
      const dev = prev[device];
      const byId: Record<string, any> = {};
      l.forEach(it => { byId[it.i] = it; });
      let changed = false;
      const next = dev.map(c => {
        const it = byId[c.id];
        if (!it) return c;
        if (it.x === c.x && it.y === c.y && it.w === c.w && it.h === c.h) return c;
        changed = true;
        return { ...c, x: it.x, y: it.y, w: it.w, h: it.h };
      });
      if (!changed) return prev;
      return { ...prev, [device]: next };
    });
  };

  const patch = (id: string, changes: Partial<CardLayout>) =>
    setDraft(prev => ({ ...prev, [device]: prev[device].map(c => (c.id === id ? { ...c, ...changes } : c)) }));

  const toggle = (id: string) => { if (isCore(id)) return; patch(id, { visible: !list.find(c => c.id === id)?.visible }); setDirty(true); };
  const setWidth = (id: string, w: number) => { patch(id, { w: Math.min(COLS[device], Math.max(minFor(id, device).minW, w)) }); setDirty(true); };
  const setHeight = (id: string, h: number) => { patch(id, { h: Math.max(minFor(id, device).minH, h) }); setDirty(true); };
  const resetDevice = () => {
    const def = defaultLayoutFor(portfolioType);
    setDraft(prev => ({ ...prev, [device]: def[device].map(c => ({ ...c })) }));
    setDirty(true);
  };
  const save = () => { onSave(draft); setDirty(false); };

  const devBtn = (d: Device, Icon: any, label: string) => {
    const on = device === d;
    return (
      <button onClick={() => setDevice(d)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${on ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
        <Icon size={16} /> {label}
      </button>
    );
  };

  const stepBtn = 'w-6 h-6 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 disabled:opacity-30 hover:border-brand-400';

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5 sticky top-0 z-30">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-brand-50 dark:bg-brand-500/10 text-brand-500 border border-brand-100 dark:border-brand-500/20 flex items-center justify-center">
              <LayoutDashboard size={20} />
            </div>
            <div>
              <h2 className="text-xl font-display font-black text-slate-900 dark:text-white tracking-tight">
                Dashboard Layout
                <span className="ml-2 text-sm font-bold text-slate-400 dark:text-slate-500">
                  · {isFund ? 'Mutual Funds' : 'PSX'}
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                {isFund
                  ? 'This layout applies only to mutual fund portfolios. PSX dashboards stay unchanged.'
                  : 'This layout applies only to PSX stock portfolios. Mutual fund dashboards stay unchanged.'}
                {' '}Drag ⋮⋮ to move · edges to resize · tick to show/hide. Web &amp; mobile save separately.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={resetDevice} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Reset this view to default"><RotateCcw size={15} /> Reset</button>
            <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button onClick={save} disabled={!dirty} className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Save changes</button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-1 w-fit">
          {devBtn('web', Monitor, 'Web')}
          {devBtn('mobile', Smartphone, 'Mobile')}
        </div>
      </div>

      <div className={`dash-editor ${device === 'mobile' ? 'max-w-md mx-auto' : ''}`}>
        <RGL
          className="layout"
          layout={rglLayout}
          cols={COLS[device]}
          rowHeight={ROW_HEIGHT}
          margin={GRID_MARGIN}
          containerPadding={[0, 0]}
          isDraggable
          isResizable
          draggableHandle=".rgl-drag"
          resizeHandles={device === 'mobile' ? ['n', 's'] : ['n', 's', 'e']}
          compactType="vertical"
          onLayoutChange={applyCoords}
          onDragStop={() => setDirty(true)}
          onResizeStop={() => setDirty(true)}
        >
          {list.map(c => {
            const m = metaFor(c.id);
            const core = isCore(c.id);
            return (
              <div key={c.id} className="h-full overflow-hidden">
                <div className={`h-full flex flex-col rounded-3xl border-2 ${c.visible ? 'border-brand-300/60 dark:border-brand-500/30' : 'border-dashed border-slate-300 dark:border-slate-700'}`}>
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 rounded-t-3xl border-b border-slate-200/60 dark:border-slate-700/60 shrink-0">
                    <span className="rgl-drag text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-grab active:cursor-grabbing touch-none" title="Drag to move"><GripVertical size={18} /></span>
                    <button onClick={() => toggle(c.id)} disabled={core} className="flex items-center gap-1.5 disabled:cursor-not-allowed min-w-0" title={core ? 'Always visible' : (c.visible ? 'Uncheck to hide' : 'Check to show')}>
                      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${c.visible ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'}`}>{c.visible && <Check size={12} strokeWidth={3} />}</span>
                      <span className="font-display font-black text-slate-800 dark:text-white text-sm truncate">{m?.label || c.id}</span>
                      {core && <Lock size={12} className="text-amber-500 shrink-0" />}
                    </button>
                    <div className="flex-1" />
                    <div className="flex items-center gap-3">
                        {device === 'web' && (
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mr-0.5">W</span>
                          <button onClick={() => setWidth(c.id, c.w - 1)} disabled={c.w <= minFor(c.id, device).minW} className={stepBtn}><Minus size={12} /></button>
                          <span className="w-9 text-center text-[11px] font-bold tabular-nums text-slate-700 dark:text-slate-200">{c.w}/12</span>
                          <button onClick={() => setWidth(c.id, c.w + 1)} disabled={c.w >= 12} className={stepBtn}><Plus size={12} /></button>
                        </div>
                        )}
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mr-0.5">H</span>
                          <button onClick={() => setHeight(c.id, c.h - 1)} disabled={c.h <= minFor(c.id, device).minH} className={stepBtn}><Minus size={12} /></button>
                          <span className="w-8 text-center text-[11px] font-bold tabular-nums text-slate-700 dark:text-slate-200">{c.h}</span>
                          <button onClick={() => setHeight(c.id, c.h + 1)} className={stepBtn}><Plus size={12} /></button>
                        </div>
                      </div>
                  </div>

                  <div className={`relative flex-1 min-h-0 rounded-b-3xl overflow-hidden ${c.visible ? '' : 'opacity-40 grayscale'}`}>
                    <div className="absolute inset-0 pointer-events-none">
                      <FitScale>{renderCard(c.id)}</FitScale>
                    </div>
                    {!c.visible && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 bg-white/80 dark:bg-slate-900/80 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">Hidden</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </RGL>
      </div>
    </div>
  );
};
