import React,{useRef} from 'react';
import {GripVertical,ArrowDownRight} from 'lucide-react';
import {moveFreeCard,resizeFreeCard,type FreeCard,type ResizeDirection} from './desktopDashboardModel';
type Mode='move'|ResizeDirection;
type Props={canvas:React.RefObject<HTMLDivElement>;cards:FreeCard[];selected:string;onChange:(cards:FreeCard[])=>void;onSelect:(id:string)=>void};
type Gesture={id:string;mode:Mode;x:number;y:number;cards:FreeCard[];canvasWidth:number;ratio:number};
const directions:{direction:ResizeDirection;label:string}[]=[{direction:'n',label:'top'},{direction:'e',label:'right'},{direction:'s',label:'bottom'},{direction:'w',label:'left'},{direction:'nw',label:'top left'},{direction:'ne',label:'top right'},{direction:'sw',label:'bottom left'},{direction:'se',label:'bottom right'}];
export function DesktopLayoutHandles({canvas,cards,selected,onChange,onSelect}:Props){
  const gesture=useRef<Gesture|null>(null);
  function start(event:React.PointerEvent<HTMLButtonElement>,card:FreeCard,mode:Mode){
    const root=canvas.current;if(event.button!==0||!root)return;
    event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current={id:card.id,mode,x:event.clientX,y:event.clientY,cards,canvasWidth:root.clientWidth,ratio:root.clientWidth/root.getBoundingClientRect().width};onSelect(card.id);
  }
  function move(event:React.PointerEvent<HTMLButtonElement>){
    const g=gesture.current;if(!g)return;
    const card=g.cards.find(card=>card.id===g.id)!,dx=(event.clientX-g.x)*g.ratio,dy=(event.clientY-g.y)*g.ratio;
    const next=g.mode==='move'?moveFreeCard(card,card.left+dx,card.top+dy,g.canvasWidth):resizeFreeCard(card,g.mode,dx,dy,g.canvasWidth);
    onChange(g.cards.map(card=>card.id===g.id?next:card));
  }
  function keyboard(event:React.KeyboardEvent<HTMLButtonElement>,card:FreeCard,mode:Mode){
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();onSelect(card.id);
    const step=event.shiftKey?10:1,dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;
    const width=canvas.current?.clientWidth||1,next=mode==='move'?moveFreeCard(card,card.left+dx,card.top+dy,width):resizeFreeCard(card,mode,dx,dy,width);
    onChange(cards.map(item=>item.id===card.id?next:item));
  }
  const events=(card:FreeCard,mode:Mode)=>({onPointerDown:(event:React.PointerEvent<HTMLButtonElement>)=>start(event,card,mode),onPointerMove:move,
    onPointerUp:()=>{gesture.current=null;},onPointerCancel:()=>{gesture.current=null;},onKeyDown:(event:React.KeyboardEvent<HTMLButtonElement>)=>keyboard(event,card,mode)});
  return <div className="desktop-layout-overlays" aria-label="Drag and resize Dashboard cards">{cards.filter(card=>card.visible).map(card=><div key={card.id} className="desktop-layout-card-outline" style={{left:card.left,top:card.top,width:card.width,height:card.height,zIndex:selected===card.id?2:0}}>
    <button type="button" className="desktop-layout-handle desktop-layout-move" aria-label={'Move '+card.label} title={'Drag '+card.label+' anywhere · arrow keys move 1 pixel, Shift + arrow keys move 10'} {...events(card,'move')}><GripVertical size={13}/><span>{card.label}</span></button>
    {directions.map(({direction,label})=><button key={direction} type="button" className={'desktop-layout-handle desktop-layout-resize desktop-layout-resize-'+direction} aria-label={'Resize '+card.label+' from '+label} title={'Drag '+label+' to resize · arrow keys also work'} {...events(card,direction)}>{direction.length===2&&<ArrowDownRight size={14}/>}</button>)}
  </div>)}</div>;
}
