import React,{useState} from 'react';
import {BookOpen,ChevronDown} from 'lucide-react';

type Section='Scanner'|'Trade plan'|'Replay'|'Research'|'Lab journal';
const steps:{title:string;text:string;section:Section;action:string}[]=[
  {title:'Start with a few stocks',text:'In Scanner, enter PSX symbols such as HBL, OGDC or MEBL, then choose Scan watchlist. Click a stock in the results to load it. A matched rule is a reason to investigate, not a buy instruction.',section:'Scanner',action:'Open Scanner'},
  {title:'Read the candles and source date',text:'Each daily candle shows the open, high, low and close. The body joins open to close; the thin wick reaches the high and low. Green means close ≥ open; red means close < open. Hover, tap or use arrow keys to read the exact values.',section:'Scanner',action:'See the candles'},
  {title:'Check the business and news',text:'Research shows the company profile, source filings, disclosed insider transactions and market headlines. Check their dates. An old disclosure or a market-wide headline may not explain today’s move in your stock.',section:'Research',action:'Open Research'},
  {title:'Build a hypothetical plan',text:'In Trade plan, set an entry price, a lower stop and a higher target. Enter test capital, risk limit, position cap and realistic costs. Starting levels are examples. Use historical breakout levels copies a past setup for testing and keeps its date.',section:'Trade plan',action:'Build a test plan'},
  {title:'Test the idea',text:'Replay available history tests the opening-range rule on complete sessions. Run test scenario resamples your current plan across 10,000 historical paths. Read the costs, excluded sessions and sample size; the results do not predict your next trade.',section:'Replay',action:'Open Replay'},
  {title:'Save your reasoning',text:'Add a research note and save the test plan. A low reward/risk warning still allows saving; invalid prices or an unfundable lot need correcting. Find it in Lab journal and export a backup. These plans stay in this browser under your login.',section:'Lab journal',action:'Open the journal'},
];

export function LabGuide({onChoose}:{onChoose:(section:Section)=>void}){
  const [open,setOpen]=useState(false);
  return <section className="lab-guide" aria-label="Trading Lab beginner guide">
    <button className="lab-guide-toggle" aria-expanded={open} aria-controls="lab-guide-body" onClick={()=>setOpen(!open)}><BookOpen size={18}/><span>New here? How to use this lab</span><ChevronDown size={16} style={{transform:open?'rotate(180deg)':undefined}}/></button>
    {open&&<div id="lab-guide-body" className="lab-guide-body">
      <p>This PSX adaptation follows the Day Trader project’s research workflow: scan, investigate, plan, check risk and test. Its tools use market data and explicit rules. There is no autonomous AI trader or broker execution in this section.</p>
      <div className="lab-guide-steps">{steps.map((step,index)=><article key={step.title}><span className="lab-guide-number">{index+1}</span><h3>{step.title}</h3><p>{step.text}</p><button onClick={()=>{onChoose(step.section);setOpen(false);}}>{step.action}</button></article>)}</div>
      <h3>The terms in plain language</h3>
      <dl className="lab-guide-terms">
        <div><dt>Entry, stop and target</dt><dd>Entry is the price you would buy at. The stop is your planned loss exit; the target is your planned profit exit. Real execution may be worse than the chosen level.</dd></div>
        <div><dt>Risk budget and position cap</dt><dd>Risk budget limits the estimated loss if the modeled stop fills. Position cap limits how much capital goes into the stock. Whole-share sizing uses whichever limit allows fewer shares.</dd></div>
        <div><dt>R and reward/risk</dt><dd>Entry Rs. 100, stop Rs. 98 and target Rs. 104 give a Rs. 2 price risk and Rs. 4 potential gain: 2R before costs. Replay R divides net gain/loss by that original Rs. 2. The sizing panel also includes costs in its risk denominator.</dd></div>
        <div><dt>Fees and slippage</dt><dd>Fees are estimated charges on buying and selling. Slippage models a worse execution price. Both reduce returns, so even a target hit can lose money after costs.</dd></div>
        <div><dt>RSI and relative volume</dt><dd>RSI describes recent price momentum. A low RSI alone does not prove a rebound is coming. Relative volume of 1.5× means volume was 50% above the prior 20-session average.</dd></div>
        <div><dt>Opening-range breakout</dt><dd>The lab uses the first three full 5-minute candles of a regular session. A later candle must close above their highest price. Friday morning and afternoon are tested separately.</dd></div>
      </dl>
      <details><summary>Why is a button disabled?</summary><p>Replay waits for real 5-minute candles. A loading message appears while the feed responds; use Refresh if the feed fails. Saving needs daily source data, valid prices and a quantity the test budget can fund. A low reward/risk warning does not block saving or simulation.</p></details>
      <details><summary>How should I read replay results?</summary><p>Target first and Stop first count modeled outcomes. Neither before close means the position reached neither level before the session ended; it does not mean profit or zero return. Average after-cost R includes fees and slippage. Missing candles exclude sessions, and a candle touching both levels counts as a stop first. Small samples and past results can be misleading.</p></details>
      <details><summary>Will this change my portfolio or place an order?</summary><p>No. The lab stores separate research plans only. It does not change your portfolio, connect to your broker or update Practice Trading. Use Export journal to keep a copy before clearing browser data or moving devices.</p></details>
    </div>}
  </section>;
}
