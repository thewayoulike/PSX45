import React, { useLayoutEffect, useRef, useState } from 'react';
import { GripVertical, ArrowDownRight } from 'lucide-react';
import { clampPlacement as clamp, placeDesktopCard, resizeDesktopCard, type DesktopCard, type ResizeDirection } from './desktopDashboardModel';

type Box = { id: string; left: number; top: number; width: number; height: number };
type Props = { canvas: React.RefObject<HTMLDivElement>; cards: DesktopCard[]; onChange: (cards: DesktopCard[]) => void; onSelect: (id: string) => void };
type Mode = 'move' | ResizeDirection;
type Limits = { minimumHeight: number; minimumOffset: number };
type Gesture = Limits & { id: string; mode: Mode; x: number; y: number; box: Box; cards: DesktopCard[]; step: number; rows: number[] };
const directions: { direction: ResizeDirection; label: string }[] = [
  {direction:'n',label:'top'}, {direction:'e',label:'right'}, {direction:'s',label:'bottom'}, {direction:'w',label:'left'},
  {direction:'nw',label:'top left'}, {direction:'ne',label:'top right'}, {direction:'sw',label:'bottom left'}, {direction:'se',label:'bottom right'},
];

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
        return [{id:card.id,left:box.left-bounds.left,top:box.top-bounds.top,width:box.width,height:box.height}];
      });
      setBoxes(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const mutations = new MutationObserver(schedule);
    mutations.observe(root,{childList:true,subtree:true});
    resize.observe(root); measure();
    return () => {resize.disconnect();mutations.disconnect();cancelAnimationFrame(frame);};
  },[canvas,cards]);

  function limits(card: DesktopCard, box: Box): Limits {
    const root = canvas.current;
    const element = root?.querySelector<HTMLElement>(card.selector);
    if (!root || !element) return {minimumHeight:box.height,minimumOffset:card.offsetY||0};
    // Measure natural content independently of the saved height, without changing the visible card.
    const clone = element.cloneNode(true) as HTMLElement;
    for (const [property,value] of Object.entries({position:'absolute',left:'-10000px',top:'0',width:box.width+'px',height:'auto',
      'min-height':'0','max-height':'none',margin:'0','grid-area':'auto',visibility:'hidden','pointer-events':'none'})) clone.style.setProperty(property,value,'important');
    clone.setAttribute('aria-hidden','true'); clone.inert=true;
    root.appendChild(clone);
    const minimumHeight = Math.min(box.height,Math.ceil(clone.getBoundingClientRect().height));
    clone.remove();
    const gap = parseFloat(getComputedStyle(root).rowGap)||14;
    const above = boxes.filter(other => other.id!==card.id && other.left < box.left+box.width-1 &&
      box.left < other.left+other.width-1 && other.top+other.height <= box.top+1);
    const topLimit = Math.max(0,...above.map(other=>other.top+other.height+gap));
    return {minimumHeight,minimumOffset:Math.round(topLimit-(box.top-(card.offsetY||0)))};
  }
  function start(event: React.PointerEvent<HTMLButtonElement>,box:Box,mode:Mode) {
    if(event.button!==0||!canvas.current)return;
    event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);
    const style=getComputedStyle(canvas.current), gap=parseFloat(style.rowGap)||14, rows=[0];
    for(const height of style.gridTemplateRows.split(' ').map(parseFloat).filter(Number.isFinite))rows.push(rows.at(-1)!+height+gap);
    const card=cards.find(card=>card.id===box.id)!;
    gesture.current={id:box.id,mode,x:event.clientX,y:event.clientY,box,cards,rows,step:(canvas.current.clientWidth+gap)/12,
      ...(mode==='move'?{minimumHeight:0,minimumOffset:0}:limits(card,box))};
    onSelect(box.id);
  }
  function move(event:React.PointerEvent<HTMLButtonElement>){
    const g=gesture.current;if(!g)return;
    const original=g.cards.find(card=>card.id===g.id)!,dx=event.clientX-g.x,dy=event.clientY-g.y;
    if(g.mode!=='move'){
      onChange(placeDesktopCard(g.cards,g.id,resizeDesktopCard(original,g.mode,Math.round(dx/g.step),dy,g.box.height,g.minimumHeight,g.minimumOffset)));
      return;
    }
    const top=g.box.top+dy;
    let closest=g.rows.reduce((best,position,index)=>Math.abs(position-top)<Math.abs(g.rows[best]-top)?index:best,0);
    if(top>g.rows.at(-1)!)closest=g.rows.length-1+Math.round((top-g.rows.at(-1)!)/120);
    const row=clamp(closest+1,1,100,original.row);
    onChange(placeDesktopCard(g.cards,g.id,{column:clamp(original.column+Math.round(dx/g.step),1,13-original.width,original.column),
      row,offsetY:row===original.row?original.offsetY:0}));
  }
  function keyboard(event:React.KeyboardEvent<HTMLButtonElement>,card:DesktopCard,mode:Mode){
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();onSelect(card.id);
    const horizontal=event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:0,vertical=event.key==='ArrowUp'?-1:event.key==='ArrowDown'?1:0;
    const box=boxes.find(box=>box.id===card.id);if(!box)return;
    if(mode==='move'){
      const row=clamp(card.row+vertical,1,100,card.row);
      onChange(placeDesktopCard(cards,card.id,{column:clamp(card.column+horizontal,1,13-card.width,card.column),row,offsetY:row===card.row?card.offsetY:0}));
    }else{
      const size=limits(card,box);
      onChange(placeDesktopCard(cards,card.id,resizeDesktopCard(card,mode,horizontal,vertical*20,box.height,size.minimumHeight,size.minimumOffset)));
    }
  }
  const events=(box:Box,card:DesktopCard,mode:Mode)=>({onPointerDown:(event:React.PointerEvent<HTMLButtonElement>)=>start(event,box,mode),
    onPointerMove:move,onPointerUp:()=>{gesture.current=null;},onPointerCancel:()=>{gesture.current=null;},
    onKeyDown:(event:React.KeyboardEvent<HTMLButtonElement>)=>keyboard(event,card,mode)});
  return <div className="desktop-layout-overlays" aria-label="Drag and resize Dashboard cards">
    {boxes.map(box=>{
      const card=cards.find(card=>card.id===box.id)!;
      return <div key={box.id} className="desktop-layout-card-outline" style={{left:box.left,top:box.top,width:box.width,height:box.height}}>
        <button type="button" className="desktop-layout-handle desktop-layout-move" aria-label={'Move '+card.label}
          title={'Drag '+card.label+' to move · arrow keys also work'} {...events(box,card,'move')}><GripVertical size={13}/><span>{card.label}</span></button>
        {directions.map(({direction,label})=><button key={direction} type="button"
          className={'desktop-layout-handle desktop-layout-resize desktop-layout-resize-'+direction}
          aria-label={'Resize '+card.label+' from '+label} title={'Drag '+label+' to resize · arrow keys also work'}
          {...events(box,card,direction)}>{direction.length===2&&<ArrowDownRight size={14}/>}</button>)}
      </div>;
    })}
  </div>;
}
