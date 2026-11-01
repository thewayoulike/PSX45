import React from 'react';
import type {MonitoredStock} from './monitor';
const when=(time:number)=>new Date(time).toLocaleString('en-GB',{timeZone:'Asia/Karachi',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+' PKT';
const price=(value:number)=>value>0&&Number.isFinite(value)?value.toLocaleString('en-PK',{maximumFractionDigits:2,minimumFractionDigits:2}):'Waiting';

export function LabMonitors({items,onView,onStop,onStopAll}:{items:MonitoredStock[];onView:(symbol:string)=>void;onStop:(symbol:string)=>void;onStopAll:()=>void}){
  if(!items.length)return null;
  return <section className="lab-panel lab-alerts" aria-label="Monitored stocks">
    <div className="lab-panel-heading"><h2>Watching {items.length} {items.length===1?'stock':'stocks'} while this page is open</h2><button onClick={onStopAll}>Stop watching all</button></div>
    <p>Each new 5-minute candle is checked while this page stays open on screen. Leaving the Lab, locking your phone or reloading stops it. For alerts that keep working, use Price Alerts.</p>
    <div className="sr-only" aria-live="polite" aria-atomic="false">{items.flatMap(item=>item.alerts.slice(0,1).map(alert=><p key={alert.id}>{alert.text}</p>))}</div>
    <div className="lab-monitor-list">{items.map(item=><article className="lab-monitor-item" key={item.symbol} aria-label={`${item.symbol} monitor`}>
      <div className="lab-panel-heading"><button className="lab-link" onClick={()=>onView(item.symbol)} aria-label={`View ${item.symbol} monitored plan`}>{item.symbol}</button><button onClick={()=>onStop(item.symbol)}>Stop watching {item.symbol}</button></div>
      <dl className="lab-monitor-levels"><div><dt>Entry</dt><dd>{price(item.plan.entry)}</dd></div><div><dt>Test stop</dt><dd>{price(item.plan.stop)}</dd></div><div><dt>Test exit</dt><dd>{price(item.plan.target)}</dd></div></dl>
      {item.source&&<small>{item.source}</small>}<small>{item.status}{item.refreshedAt&&` · ${when(item.refreshedAt)}`}</small>
      {item.candleAt&&<small>Latest completed candle: {when(item.candleAt)}</small>}
      {item.alerts.length?<ul>{item.alerts.map(alert=><li key={alert.id}>{alert.text}<small>{when(alert.time)}</small></li>)}</ul>:<p>No notices yet. Earlier candles never trigger notices.</p>}
    </article>)}</div>
  </section>;
}
