import React from 'react';
import type {MonitoredStock} from './monitor';
const when=(time:number)=>new Date(time).toLocaleString('en-GB',{timeZone:'Asia/Karachi',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+' PKT';
const price=(value:number)=>value>0&&Number.isFinite(value)?value.toLocaleString('en-PK',{maximumFractionDigits:2,minimumFractionDigits:2}):'Waiting';

export function LabMonitors({items,onView,onStop,onStopAll}:{items:MonitoredStock[];onView:(symbol:string)=>void;onStop:(symbol:string)=>void;onStopAll:()=>void}){
  if(!items.length)return null;
  return <section className="lab-panel lab-alerts" aria-label="Monitored stocks">
    <div className="lab-panel-heading"><h2>Monitoring {items.length} {items.length===1?'stock':'stocks'} · this visible page only</h2><button onClick={onStopAll}>Stop all monitoring</button></div>
    <p>Searching for another symbol adds it to this list. Each stock keeps its own levels and alerts. Checks run every 30 seconds while this page is visible; leaving the lab or reloading clears this monitoring session.</p>
    <div className="lab-monitor-list">{items.map(item=><article className="lab-monitor-item" key={item.symbol} aria-label={`${item.symbol} monitor`}>
      <div className="lab-panel-heading"><button className="lab-link" onClick={()=>onView(item.symbol)} aria-label={`View ${item.symbol} monitored plan`}>{item.symbol}</button><button onClick={()=>onStop(item.symbol)}>Stop {item.symbol}</button></div>
      <dl className="lab-monitor-levels"><div><dt>Entry</dt><dd>{price(item.plan.entry)}</dd></div><div><dt>Stop-loss</dt><dd>{price(item.plan.stop)}</dd></div><div><dt>Take profit</dt><dd>{price(item.plan.target)}</dd></div></dl>
      {item.source&&<small>{item.source}</small>}<small role="status">{item.status}{item.refreshedAt&&` · ${when(item.refreshedAt)}`}</small>
      {item.candleAt&&<small>Latest completed candle: {when(item.candleAt)}</small>}
      {item.alerts.length?<ul aria-live="polite">{item.alerts.map(alert=><li key={alert.id}>{alert.text}<small>{when(alert.time)}</small></li>)}</ul>:<p>No new notices. Historical candles do not trigger live alerts.</p>}
    </article>)}</div>
  </section>;
}
