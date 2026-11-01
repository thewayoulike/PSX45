import React,{useState} from 'react';
import {BookOpen,ChevronDown} from 'lucide-react';

type Section='Scanner'|'Research'|'Trade plan'|'Replay';
// One step per tab, in tab order.
const steps:{title:string;text:string;section:Section;action:string}[]=[
  {title:'Find a setup',text:'Scan KSE-100, KMI-30, the full market or your Watchlist. The scanner looks for a stock whose 5-minute candle closes above its first 15 minutes’ high, and shows its chart when you tap it. A match is something to study, not an instruction to buy.',section:'Scanner',action:'Open Scanner'},
  {title:'Check the company and news',text:'Research shows the company profile, financial results, announcements, insider filings and headlines. Check the dates: an old filing or a market-wide headline may not explain today’s move.',section:'Research',action:'Open Research'},
  {title:'Plan with sample money',text:'Trade plan sets an entry, a test stop (where you would accept a loss) and a test exit (where you would take profit), then sizes the position with sample capital and realistic costs. Nothing is filled in until you choose to test a setup.',section:'Trade plan',action:'Open Trade plan'},
  {title:'See how the rules did before',text:'Replay applies the same rules to each past session in the data. You see how often they triggered, how many past trades were profitable after costs, and the average result. Small samples are labelled as such.',section:'Replay',action:'Open Replay'},
];
const terms:[string,string][]=[
  ['Opening range','The first three full 5-minute candles of a session (09:35–09:50 Monday to Thursday). A later candle must close above their highest price. Friday morning and afternoon are separate sessions.'],
  ['Test stop and test exit','Prices where you would close the position for a planned loss or profit. Real trades can fill worse, especially after a gap or when a stock is locked at its price limit.'],
  ['R','Your result measured in units of the risk to your stop. Entry Rs. 100 with a stop at Rs. 98 risks Rs. 2; finishing at Rs. 104 is +2R before costs.'],
  ['ATR','Average true range: how much the price usually moves in one 5-minute candle. An ATR stop sits a chosen multiple of that below entry.'],
  ['Closing time (“flat-by”)','How many minutes before the session ends the practice position is closed, so nothing is held overnight.'],
  ['Costs','Broker commission (Rs. 0.03 a share at Rs. 5 or below, Rs. 0.05 below Rs. 10, otherwise the greater of Rs. 0.05 or 0.15%), 15% sales tax on that commission, a Rs. 0.005-a-share CDC fee, and slippage, on both buying and selling. They can turn a small win into a loss, especially on cheap stocks.'],
];

export function LabGuide({onChoose}:{onChoose:(section:Section)=>void}){
  const [open,setOpen]=useState(false);
  return <section className="lab-guide" aria-label="How to use the Trading Lab">
    <button className="lab-guide-toggle" aria-expanded={open} aria-controls="lab-guide-body" onClick={()=>setOpen(!open)}><BookOpen size={18}/><span>How the Lab works (4 steps)</span><ChevronDown size={16} style={{transform:open?'rotate(180deg)':undefined}}/></button>
    {open&&<div id="lab-guide-body" className="lab-guide-body">
      <p>The Lab is for practising one intraday idea, an opening-range breakout, with sample money. It does not connect to a broker, place orders or change your portfolio. When you want to try a plan, send it to Practice Trading.</p>
      <div className="lab-guide-steps">{steps.map((step,index)=><article key={step.title}><span className="lab-guide-number">{index+1}</span><h3>{step.title}</h3><p>{step.text}</p><button onClick={()=>{onChoose(step.section);setOpen(false);}}>{step.action}</button></article>)}</div>
      <h3>Words used in the Lab</h3>
      <dl className="lab-guide-terms">{terms.map(([term,text])=><div key={term}><dt>{term}</dt><dd>{text}</dd></div>)}</dl>
      <details><summary>Does a scan give live trading calls?</summary><p>No. It checks stocks in small groups using completed 5-minute candles, so each result has its own time. Results from closed sessions are labelled. A scan never places an order.</p></details>
      <details><summary>Why is a button disabled?</summary><p>Replay waits for real 5-minute candles; use Refresh if the feed fails. Practise needs valid prices and a quantity your sample budget can afford, and is not offered when costs would exceed the move to the test exit.</p></details>
    </div>}
  </section>;
}
