import { DesktopLayoutHandles } from './DesktopLayoutHandles';
import React,{useId,useMemo,useState,useRef,useLayoutEffect} from 'react';
import {desktopCards,DESKTOP_CARDS,serializeFreeCards,restoreFreeCards,scaleFreeCards,type DesktopLayout,type FreeCard,type FreePlacement} from './desktopDashboardModel';
import type {CardLayout} from './dashboard';
import './desktop-dashboard-layout.css';

type Props=React.PropsWithChildren<{enabled:boolean;editing:boolean;layout?:DesktopLayout;legacyLayout:CardLayout[];onSave:(layout:DesktopLayout)=>void;onDone:()=>void;className?:string}>;
function Canvas({editing,layout,legacyLayout,onSave,onDone,className,children}:Omit<Props,'enabled'>){
  const canvas=useRef<HTMLDivElement>(null),width=useRef(0);
  const [cards,setCards]=useState<FreeCard[]|null>(null),[selected,setSelected]=useState('value'),[dirty,setDirty]=useState(false),[reset,setReset]=useState(false);
  const legacy=useMemo(()=>desktopCards(reset?undefined:layout,reset?[]:legacyLayout),[layout,legacyLayout,reset]);
  const canvasId='desktop-canvas-'+useId().replace(/:/g,'');
  const active=cards?.find(card=>card.id===selected)||cards?.[0];
  useLayoutEffect(()=>{
    const current=canvas.current?.clientWidth||0;width.current=current;
    setCards(layout?.version===2&&current?restoreFreeCards(layout,current):null);setReset(false);setDirty(false);
  },[layout,legacyLayout,editing]);
  useLayoutEffect(()=>{
    const root=canvas.current;if(!root||cards||!editing||(!reset&&layout?.version===2))return;
    let frame=0,finished=false;
    const measure=()=>{
      if(finished||!root.querySelector('[data-summary-card="return"]'))return;
      const bounds=root.getBoundingClientRect();if(!bounds.width)return;
      const ratio=root.clientWidth/bounds.width;
      const next=legacy.map(meta=>{
        const element=root.querySelector<HTMLElement>(meta.selector),box=element?.getBoundingClientRect();
        const fallbackWidth=root.clientWidth*meta.width/12-14;
        return {id:meta.id,label:meta.label,selector:meta.selector,visible:meta.visible,
          left:Math.max(0,box&&box.width?(box.left-bounds.left)*ratio:(meta.column-1)*(root.clientWidth+14)/12),
          top:Math.max(0,box&&box.height?(box.top-bounds.top)*ratio:(meta.row-1)*150),
          width:Math.min(root.clientWidth,Math.max(80,box&&box.width?box.width*ratio:fallbackWidth)),
          height:Math.max(40,box&&box.height?box.height*ratio:meta.height||200)};
      });
      finished=true;width.current=root.clientWidth;setCards(next);
    };
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);};
    const mutations=new MutationObserver(schedule),resize=new ResizeObserver(schedule);
    mutations.observe(root,{childList:true,subtree:true});resize.observe(root);schedule();
    return()=>{finished=true;mutations.disconnect();resize.disconnect();cancelAnimationFrame(frame);};
  },[cards,legacy,layout,reset,editing]);
  const ready=!!cards;
  useLayoutEffect(()=>{
    const root=canvas.current;if(!root||!ready)return;
    const observer=new ResizeObserver(()=>{
      const next=root.clientWidth,previous=width.current;
      if(next>0&&previous>0&&Math.abs(next-previous)>.5){width.current=next;setCards(items=>items?scaleFreeCards(items,previous,next):items);}
    });observer.observe(root);return()=>observer.disconnect();
  },[ready]);
  function change(patch:Partial<FreePlacement>){
    if(!cards||!active)return;
    const next={...active,...patch};
    next.width=Math.max(80,Math.min(next.width,width.current));
    if(patch.width!==undefined)next.width=Math.min(next.width,width.current-next.left);
    next.height=Math.max(40,Math.min(5000,next.height));
    next.left=Math.max(0,Math.min(next.left,width.current-next.width));next.top=Math.max(0,Math.min(100000,next.top));
    setCards(cards.map(card=>card.id===active.id?next:card));setDirty(true);
  }
  const rules=cards?cards.map(card=>'#'+canvasId+' '+card.selector+'{position:absolute!important;left:'+card.left+'px!important;top:'+card.top+'px!important;width:'+card.width+'px!important;height:'+card.height+'px!important;min-height:0!important;max-height:none!important;margin:0!important;box-sizing:border-box;overflow:auto!important;z-index:'+(editing&&selected===card.id?2:0)+';'+(!card.visible?'display:none!important;':'')+'}').join('\n'):
    legacy.map(card=>'#'+canvasId+' '+card.selector+'{grid-column:'+card.column+'/span '+card.width+'!important;grid-row:'+card.row+'/span '+card.rows+'!important;min-height:'+card.height+'px!important;margin-top:'+(card.offsetY||0)+'px!important;'+(!card.visible?'display:none!important;':'')+'}').join('\n');
  const height=cards?Math.max(100,...cards.filter(card=>card.visible).map(card=>card.top+card.height))+(editing?120:14):undefined;
  return <>
    {editing&&<section className="desktop-layout-controls" aria-label="Dashboard layout controls">
      <div className="desktop-layout-heading"><div><h2>Dashboard Layout</h2><p>Drag cards anywhere. Drag any edge or corner to resize.</p></div>
        <div className="desktop-layout-actions"><button type="button" onClick={()=>{setReset(true);setCards(null);setDirty(true);}}>Reset layout</button><button type="button" onClick={onDone}>Cancel</button>
        <button type="button" className="desktop-layout-save" disabled={!dirty||!cards} onClick={()=>{if(cards)onSave(serializeFreeCards(cards,width.current));}}>Save changes</button></div>
      </div>
      {active?<div className="desktop-layout-fields">
        <label>Card<select value={selected} onChange={event=>setSelected(event.target.value)}>{cards!.map(card=><option key={card.id} value={card.id}>{card.label}</option>)}</select></label>
        {(['left','top','width','height'] as const).map(field=><label key={field}>{field[0].toUpperCase()+field.slice(1)}<input type="number" min={field==='width'?80:field==='height'?40:0} max={field==='left'||field==='width'?width.current:field==='height'?5000:100000} step="1" value={Math.round(active[field])} onChange={event=>{if(Number.isFinite(event.target.valueAsNumber))change({[field]:event.target.valueAsNumber});}}/></label>)}
        <label className="desktop-layout-visible"><input type="checkbox" checked={active.visible} onChange={event=>change({visible:event.target.checked})}/>Show card</label>
      </div>:<p role="status">Loading your cards…</p>}
    </section>}
    <style>{'@media(min-width:1024px){'+rules+'}'}</style>
    <div ref={canvas} id={canvasId} data-desktop-canvas data-free-layout={ready?'true':undefined} className={className} style={{height}} onClickCapture={editing?event=>{
      const target=event.target as HTMLElement,item=DESKTOP_CARDS.find(card=>target.closest(card.selector));
      if(item){setSelected(item.id);if(target.closest('button,a,input,select')){event.preventDefault();event.stopPropagation();}}
    }:undefined}>{children}{editing&&cards&&<DesktopLayoutHandles canvas={canvas} cards={cards} selected={selected} onSelect={setSelected} onChange={next=>{setCards(next);setDirty(true);}}/>}</div>
  </>;
}
export function DesktopDashboardLayout({enabled,...props}:Props){return enabled?<Canvas {...props}/>:<div data-dashboard-flow className={props.className}>{props.children}</div>;}
