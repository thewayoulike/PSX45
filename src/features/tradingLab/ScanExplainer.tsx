import React from 'react';
import type {ScanKind} from './scanner';

export function ScanExplainer({kind,onPlan}:{kind:ScanKind;onPlan:()=>void}){
 const intraday=kind==='intraday';
 const checks=intraday?[
  ['First 15 minutes','The first three full 5-minute candles after the session opens (from 09:35 Monday to Thursday). Their highest price is the breakout level; their lowest price is the default test stop.'],
  ['Entry confirmation','A later completed candle must close above that high within the entry window. If a volume filter is on, the candle must also trade more than usual for that time of day.'],
  ['Test exit','The lowest of: 2× the risk, nearby resistance, the usual daily range left, and the daily price limit. These are limits, not a prediction.'],
  ['Checks passed','Three checks: a completed closing breakout, volume at least 1.5× usual for that time, and reward at least 1.5× risk after costs. “3 of 3” passes all three. If costs would exceed the move to the test exit, the setup is marked Skip.'],
  ['Outcome and freshness','The outcome checks completed candles after entry up to the planned exit time. It records observed level touches, not actual trades. Each stock has its own timestamp; a one-off scan does not refresh itself.'],
 ]:[
  ['Closing breakout','Latest completed daily close above the previous 20 closes.'],
  ['Bull flag','More than 10% rise over the preceding run, followed by a five-close range below 5% of the latest price.'],
  ['Oversold bounce','Prior RSI below 30 and the latest close higher than the previous close. RSI below 30 is also listed on its own.'],
  ['Reclaimed average','Close crosses above its 20-day average.'],
  ['RSI recovery','Wilder RSI 14 crosses back above 30.'],
  ['Daily volume context','Latest completed session volume divided by the previous 20-session average. This is different from intraday breakout volume.'],
 ];
 return <article className="lab-panel" aria-label="Scan rules explained"><h2>What the {intraday?'intraday':'daily'} scan checks</h2><dl className="lab-definitions">{checks.map(([title,text])=><React.Fragment key={title}><dt>{title}</dt><dd>{text}</dd></React.Fragment>)}</dl><p>{intraday?'Friday morning and afternoon are separate sessions. Missing candles, delayed feeds and incomplete target checks must be reviewed.':'Daily research uses completed sessions and does not supply intraday entry levels.'} A match is something to study, not a recommendation or an instruction to trade.</p><button onClick={onPlan}>Open Trade plan</button></article>;
}
