import {useMobileLayout} from '../hooks/useMobileLayout';
import React, { useLayoutEffect, useRef } from 'react';
import './mobile-fit-line.css';

/** Fit the complete value to its own card, including after resize or a tab change. */
export function FittedLine({children,max=20,className=''}:React.PropsWithChildren<{max?:number;className?:string}>){
 const box=useRef<HTMLSpanElement>(null),text=useRef<HTMLSpanElement>(null);
 useLayoutEffect(()=>{
  const outer=box.current,inner=text.current;if(!outer||!inner)return;
  let frame=0,disposed=false;
  const fit=()=>{
   if(disposed||outer.clientWidth<1)return;
   inner.style.fontSize=max+'px';
   const natural=inner.scrollWidth;
   const size=Math.min(max,Math.floor(max*Math.max(0,outer.clientWidth-1)/Math.max(natural,1)*10)/10);
   inner.style.fontSize=Math.max(1,size)+'px';
  };
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(fit);};
  const observer=new ResizeObserver(schedule);observer.observe(outer);
  document.fonts.ready.then(schedule);fit();
  return()=>{disposed=true;observer.disconnect();cancelAnimationFrame(frame);};
 },[children,max]);
 return <span className={'preview-fit-line '+className} ref={box}><span ref={text} style={{fontSize:max}}>{children}</span></span>;
}

export function MobileFitLine(props: React.ComponentProps<typeof FittedLine>) {const mobile=useMobileLayout();return mobile?<FittedLine {...props}/>:<>{props.children}</>;}
