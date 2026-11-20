import React, { useEffect, useId, useMemo, useState } from 'react';
import { desktopCards, DESKTOP_CARDS, serializeDesktopCards, clampPlacement as clamp, type DesktopLayout, type DesktopPlacement as Placement } from './desktopDashboardModel';
import type { CardLayout } from './dashboard';
import './desktop-dashboard-layout.css';

type Props = React.PropsWithChildren<{ enabled: boolean; editing: boolean; layout?: DesktopLayout; legacyLayout: CardLayout[]; onSave: (layout: DesktopLayout) => void; onDone: () => void; className?: string }>;

function Canvas({ editing, layout, legacyLayout, onSave, onDone, className, children }: Omit<Props, 'enabled'>) {
  const defaults = DESKTOP_CARDS;
  const restored = useMemo(() => desktopCards(layout, legacyLayout), [layout, legacyLayout]);
  const [cards, setCards] = useState(restored);
  const [selected, setSelected] = useState('value');
  const [dirty, setDirty] = useState(false);
  const canvasId = 'desktop-canvas-' + useId().replace(/:/g, '');
  const active = cards.find(item => item.id === selected) || cards[0];

  useEffect(() => {
    setCards(restored);
    setDirty(false);
  }, [restored, editing]);

  function change(patch: Partial<Placement>) {
    setCards(items => items.map(item => item.id === selected ? { ...item, ...patch } : item));
    setDirty(true);
  }

  function save() {
    onSave(serializeDesktopCards(cards));
    setDirty(false);
  }

  function cancel() {
    setCards(restored);
    setDirty(false);
    onDone();
  }

  const rules = cards.map(item => {
    const selector = '#' + canvasId + ' ' + item.selector;
    return selector + '{grid-column:' + item.column + '/span ' + item.width + '!important;grid-row:' + item.row + '/span ' + item.rows +
      '!important;min-height:' + item.height + 'px!important;' + (!item.visible ? 'display:none!important;' : '') + '}' +
      (editing && item.id === selected ? selector + '{outline:2px solid #168466;outline-offset:3px;}' : '');
  }).join('\n');

  return <>
    {editing && <section className="desktop-layout-controls" aria-label="Dashboard layout controls">
      <div className="desktop-layout-heading">
        <div><h2>Dashboard Layout</h2><p>Edit the cards shown on your current Dashboard.</p></div>
        <div className="desktop-layout-actions">
          <button type="button" onClick={() => { setCards(defaults.map(card => ({ ...card }))); setDirty(true); }}>Reset layout</button>
          <button type="button" onClick={cancel}>Cancel</button>
          <button type="button" className="desktop-layout-save" disabled={!dirty} onClick={save}>Save changes</button>
        </div>
      </div>
      <div className="desktop-layout-fields">
        <label>Card<select value={selected} onChange={event => setSelected(event.target.value)}>
          {cards.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        <label>Column<input type="number" min="1" max="12" value={active.column} onChange={event => {
          const column = clamp(event.target.valueAsNumber, 1, 12, active.column);
          change({column, width:Math.min(active.width, 13 - column)});
        }}/></label>
        <label>Width<input type="number" min="1" max={13-active.column} value={active.width} onChange={event => change({width:clamp(event.target.valueAsNumber, 1, 13-active.column, active.width)})}/></label>
        <label>Row<input type="number" min="1" max="100" value={active.row} onChange={event => change({row:clamp(event.target.valueAsNumber, 1, 100, active.row)})}/></label>
        <label>Rows<input type="number" min="1" max="10" value={active.rows} onChange={event => change({rows:clamp(event.target.valueAsNumber, 1, 10, active.rows)})}/></label>
        <label>Min height<input type="number" min="0" max="1500" step="20" value={active.height} onChange={event => change({height:clamp(event.target.valueAsNumber, 0, 1500, active.height)})}/></label>
        <label className="desktop-layout-visible"><input type="checkbox" checked={active.visible} onChange={event => change({visible:event.target.checked})}/>Show card</label>
      </div>
      <p className="desktop-layout-status" role="status">12 columns across · 0 minimum height fits the content</p>
    </section>}
    <style>{'@media(min-width:1024px){' + rules + '}'}</style>
    <div id={canvasId} data-desktop-canvas className={className} onClickCapture={editing ? event => {
      const target = event.target as HTMLElement;
      const item = cards.find(item => target.closest(item.selector));
      if (item) {
        setSelected(item.id);
        if (target.closest('button,a,input,select')) {
          event.preventDefault();
          event.stopPropagation();
        }
      }
    } : undefined}>{children}</div>
  </>;
}

export function DesktopDashboardLayout({ enabled, ...props }: Props) {
  if (!enabled) return <div data-dashboard-flow className={props.className}>{props.children}</div>;
  return <Canvas {...props}/>;
}
