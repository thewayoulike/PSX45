import React from 'react';
import type {ScanKind} from './scanner';

export function ScanExplainer({kind,onPlan}:{kind:ScanKind;onPlan:()=>void}){
 const intraday=kind==='intraday';
 const checks=intraday?[
  ['Opening range','The first three full 5-minute candles after the regular session opens. The highest high is the breakout level; the lowest low is the default stop.'],
  ['Entry confirmation','A later completed candle must close above the opening high before the selected entry cutoff. If a volume filter is enabled, that candle must pass it too. Forming candles cannot confirm an entry.'],
  ['Target estimate','Use the lowest of the 2R benchmark, nearby resistance, estimated remaining daily range and the session’s price limit. These are constraints, not a prediction of where price will go.'],
  ['Setup quality','Strong requires a closing breakout, at least 1.5× opening-average volume and at least 1.50R after costs, with complete target checks. Moderate meets two checks; net reward/risk below 1R stays Weak. A target that cannot cover costs is Skip.'],
  ['Outcome and freshness','The outcome checks completed candles after entry up to the planned exit time. It records observed level touches, not actual trades. Each stock has its own timestamp; a one-off scan does not refresh itself.'],
 ]:[
  ['Closing breakout','Latest completed daily close above the previous 20 closes.'],
  ['Bull flag','More than 10% rise over the preceding run, followed by a five-close range below 5% of the latest price.'],
  ['Oversold bounce','Prior RSI below 30 and the latest close higher than the previous close. RSI below 30 is also listed on its own.'],
  ['Reclaimed average','Close crosses above its 20-day average.'],
  ['RSI recovery','Wilder RSI 14 crosses back above 30.'],
  ['Daily volume context','Latest completed session volume divided by the previous 20-session average. This is different from intraday breakout volume.'],
 ];
 return <article className="lab-panel" aria-label="Scan rules explained"><h2>What the {intraday?'intraday':'daily'} scan checks</h2><dl className="lab-definitions">{checks.map(([title,text])=><React.Fragment key={title}><dt>{title}</dt><dd>{text}</dd></React.Fragment>)}</dl><p>{intraday?'Friday morning and afternoon are separate sessions. Missing candles, delayed feeds and incomplete target checks must be reviewed.':'Daily research uses completed sessions and does not supply intraday entry levels.'} A match is a research candidate, not an instruction to trade.</p><button onClick={onPlan}>Open Trade plan</button></article>;
}
