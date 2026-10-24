import React,{useEffect,useRef,useState} from 'react';
import {pktDay,type Bar} from './engine';

const number=(n:number)=>n.toLocaleString('en-PK',{minimumFractionDigits:2,maximumFractionDigits:2});
const date=(time:number)=>new Date(time).toLocaleDateString('en-GB',{timeZone:'Asia/Karachi',day:'numeric',month:'short',year:'numeric'});

/** Daily OHLC from the lab's existing feed; no synthetic candles or extra requests. */
export function LabCandles({bars,symbol}:{bars:Bar[];symbol:string}){
  const box=useRef<HTMLDivElement>(null),[width,setWidth]=useState(600),[period,setPeriod]=useState(90),[selected,setSelected]=useState<number|null>(null);
  useEffect(()=>{if(!box.current)return;const observer=new ResizeObserver(([entry])=>setWidth(Math.max(200,entry.contentRect.width)));observer.observe(box.current);return()=>observer.disconnect();},[]);
  useEffect(()=>setSelected(null),[bars,symbol,period]);
  const candles=bars.slice(-period),current=candles[Math.min(selected??candles.length-1,candles.length-1)];
  const low=candles.length?Math.min(...candles.map(b=>b.low)):0,high=candles.length?Math.max(...candles.map(b=>b.high)):1;
  const pad=(high-low||high*.01||1)*.08,left=56,right=width-8,top=12,bottom=236,step=(right-left)/Math.max(1,candles.length),body=Math.max(.7,Math.min(12,step*.64));
  const x=(i:number)=>left+step*(i+.5),y=(price:number)=>bottom-(price-low+pad)/(high-low+2*pad)*(bottom-top);
  const pointer=(event:React.PointerEvent<SVGSVGElement>)=>{const rect=event.currentTarget.getBoundingClientRect(),px=(event.clientX-rect.left)/rect.width*width;setSelected(Math.max(0,Math.min(candles.length-1,Math.floor((px-left)/step))));};
  return <div ref={box} className="lab-candles">
    <div className="lab-candle-controls"><span>Daily · PKR</span><div aria-label="Candle history">{[30,60,90].map(n=><button key={n} aria-pressed={period===n} onClick={()=>setPeriod(n)}>{n} sessions</button>)}</div></div>
    {current?<>
      <div className="lab-candle-readout" aria-live="polite"><strong>{date(current.time)}</strong><span>O <b>{number(current.open)}</b></span><span>H <b>{number(current.high)}</b></span><span>L <b>{number(current.low)}</b></span><span>C <b className={current.close>=current.open?'lab-up':'lab-down'}>{number(current.close)}</b></span><span>Vol <b>{current.volume==null?'Unavailable':current.volume.toLocaleString('en-PK')}</b></span></div>
      <svg viewBox={`0 0 ${width} 267`} width="100%" height="267" role="img" tabIndex={0}
        aria-label={`${symbol} daily candlestick chart, ${candles.length} sessions. Use left and right arrow keys to inspect open, high, low and close.`}
        onPointerMove={pointer} onPointerDown={pointer} onPointerLeave={event=>{if(event.pointerType==='mouse')setSelected(null);}}
        onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();setSelected(i=>event.key==='Home'?0:event.key==='End'?candles.length-1:Math.min(candles.length-1,Math.max(0,(i??candles.length-1)+(event.key==='ArrowLeft'?-1:1))));}}>
        {[0,1,2,3,4].map(i=>{const v=low-pad+(high-low+2*pad)*i/4;return <g key={i}><line x1={left} x2={right} y1={y(v)} y2={y(v)} stroke="var(--lab-line)" strokeDasharray="3 3"/><text x={left-6} y={y(v)+4} textAnchor="end">{v.toLocaleString('en-PK',{maximumFractionDigits:2})}</text></g>;})}
        {candles.map((b,i)=>{const color=b.close>=b.open?'#059669':'#dc3855';return <g key={b.time} data-candle-date={pktDay(b.time)}><title>{date(b.time)}: Open {number(b.open)}, High {number(b.high)}, Low {number(b.low)}, Close {number(b.close)}</title><line x1={x(i)} x2={x(i)} y1={y(b.high)} y2={y(b.low)} stroke={color} strokeWidth={Math.max(.6,Math.min(1.2,step*.3))}/><rect x={x(i)-body/2} y={Math.min(y(b.open),y(b.close))} width={body} height={Math.max(1,Math.abs(y(b.open)-y(b.close)))} fill={color}/></g>;})}
        {selected!=null&&<line x1={x(Math.min(selected,candles.length-1))} x2={x(Math.min(selected,candles.length-1))} y1={top} y2={bottom} stroke="var(--lab-muted)" strokeDasharray="4 4"/>}
        {[0,.5,1].map((f,i)=>{const index=Math.round(f*(candles.length-1));return <text key={i} x={f===0?left:f===1?right:x(index)} y="258" textAnchor={f===0?'start':f===1?'end':'middle'}>{pktDay(candles[index].time).slice(5)}</text>;})}
      </svg>
      <p className="lab-candle-help">Hover, tap or use ← → to inspect. Green: close ≥ open. Red: close &lt; open.</p>
    </>:<p className="lab-empty">Daily candles are unavailable.</p>}
  </div>;
}
