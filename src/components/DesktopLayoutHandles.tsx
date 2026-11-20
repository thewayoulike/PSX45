import React, { useLayoutEffect, useRef, useState } from 'react';
import { GripVertical, ArrowDownRight } from 'lucide-react';
import { clampPlacement as clamp, placeDesktopCard, type DesktopCard, type DesktopPlacement } from './desktopDashboardModel';

type Box = { id: string; left: number; top: number; width: number; height: number };
type Props = { canvas: React.RefObject<HTMLDivElement>; cards: DesktopCard[]; onChange: (cards: DesktopCard[]) => void; onSelect: (id: string) => void };
type Gesture = { id: string; mode: 'move' | 'resize'; x: number; y: number; box: Box; cards: DesktopCard[]; step: number; rows: number[] };

export function DesktopLayoutHandles({ canvas, cards, onChange, onSelect }: Props) {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const gesture = useRef<Gesture | null>(null);
  useLayoutEffect(() => {
    const root = canvas.current;
    if (!root) return;
    let frame = 0;
    const resize = new ResizeObserver(() => schedule());
    const measure = () => {
      const bounds = root.getBoundingClientRect();
      const next = cards.filter(card => card.visible).flatMap(card => {
        const element = root.querySelector<HTMLElement>(card.selector);
        if (!element || !element.getClientRects().length) return [];
        resize.observe(element);
        const box = element.getBoundingClientRect();
        return [{ id: card.id, left: box.left-bounds.left, top: box.top-bounds.top, width: box.width, height: box.height }];
      });
      setBoxes(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const mutations = new MutationObserver(schedule);
    mutations.observe(root, { childList: true, subtree: true });
    resize.observe(root); measure();
    return () => { resize.disconnect(); mutations.disconnect(); cancelAnimationFrame(frame); };
  }, [canvas, cards]);

  function start(event: React.PointerEvent<HTMLButtonElement>, box: Box, mode: Gesture['mode']) {
    if (event.button !== 0 || !canvas.current) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const style = getComputedStyle(canvas.current);
    const gap = parseFloat(style.rowGap) || 14;
    const rows = [0];
    for (const height of style.gridTemplateRows.split(' ').map(parseFloat).filter(Number.isFinite)) rows.push(rows.at(-1)! + height + gap);
    gesture.current = { id: box.id, mode, x: event.clientX, y: event.clientY, box, cards, rows,
      step: (canvas.current.clientWidth + gap) / 12 };
    onSelect(box.id);
  }
  function move(event: React.PointerEvent<HTMLButtonElement>) {
    const g = gesture.current;
    if (!g) return;
    const original = g.cards.find(card => card.id === g.id)!;
    const dx = event.clientX-g.x, dy = event.clientY-g.y;
    let patch: Partial<DesktopPlacement>;
    if (g.mode === 'resize') {
      patch = { width: clamp(original.width + Math.round(dx/g.step), 1, 13-original.column, original.width),
        height: clamp(g.box.height+dy, 0, 1500, original.height) };
    } else {
      const top = g.box.top+dy;
      let closest = g.rows.reduce((best, position, index) => Math.abs(position-top)<Math.abs(g.rows[best]-top) ? index : best, 0);
      if (top > g.rows.at(-1)!) closest = g.rows.length-1 + Math.round((top-g.rows.at(-1)!)/120);
      patch = { column: clamp(original.column+Math.round(dx/g.step), 1, 13-original.width, original.column), row: clamp(closest+1, 1, 100, original.row) };
    }
    onChange(placeDesktopCard(g.cards, g.id, patch));
  }
  function keyboard(event: React.KeyboardEvent<HTMLButtonElement>, card: DesktopCard, mode: Gesture['mode']) {
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); onSelect(card.id);
    const horizontal = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    const vertical = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    const box = boxes.find(box => box.id === card.id);
    const patch = mode === 'move'
      ? {column:clamp(card.column+horizontal,1,13-card.width,card.column),row:clamp(card.row+vertical,1,100,card.row)}
      : {width:clamp(card.width+horizontal,1,13-card.column,card.width),height:clamp((card.height||box?.height||0)+vertical*20,0,1500,card.height)};
    onChange(placeDesktopCard(cards,card.id,patch));
  }
  return <div className="desktop-layout-overlays" aria-label="Drag and resize Dashboard cards">
    {boxes.map(box => {
      const card = cards.find(card => card.id === box.id)!;
      return <div key={box.id} className="desktop-layout-card-outline" style={{left:box.left,top:box.top,width:box.width,height:box.height}}>
        {(['move','resize'] as const).map(mode => <button key={mode} type="button"
          className={'desktop-layout-handle desktop-layout-'+mode}
          aria-label={(mode === 'move' ? 'Move ' : 'Resize ')+card.label}
          title={mode === 'move' ? 'Drag to move · arrow keys also work' : 'Drag to resize · arrow keys also work'}
          onPointerDown={event => start(event,box,mode)} onPointerMove={move}
          onPointerUp={() => {gesture.current=null;}} onPointerCancel={() => {gesture.current=null;}}
          onKeyDown={event => keyboard(event,card,mode)}>
          {mode === 'move' ? <><GripVertical size={13}/><span>{card.label}</span></> : <ArrowDownRight size={15}/>}
        </button>)}
      </div>;
    })}
  </div>;
}
