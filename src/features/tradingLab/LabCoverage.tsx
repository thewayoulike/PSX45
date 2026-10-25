import React from 'react';
const reviewers=new Set(['itruth2011@gmail.com','muhammadawais950@gmail.com']);
const coverage=[
 ['Scanner','Five original daily rules plus RSI recovery; price/volume filters.','Full PSX Market Watch list or saved watchlist; daily and 5-minute opening-range scans. Feed gaps are shown.'],
 ['News','Publisher links, keyword matching and headline catalyst tags.','No SEC feed or automatic news interpretation.'],
 ['Entry','Opening range/custom level, closing confirmation, volume and time window.','5-minute candles; feed latency and missing bars are shown.'],
 ['Exit','Range low/midpoint, percentage, ATR or manual stop; R target and flat-by.','ATR needs 14 past ranges; no live stop orders.'],
 ['Time Machine','Rule replay, entry-slot timing, sampling window, 10,000 paths and distributions.','Limited PSX history; minimum 3 configurable, upstream default 20.'],
 ['Budget','Whole-lot sizing, costs, capital and risk caps.','Editable costs and lot size, not broker-verified balances.'],
 ['Risk','Cash reserve, session loss/risk, entry count, duplicates and order limits.','Hypothetical session inputs; no US PDT rule or live account inspection.'],
 ['Broker','Review/export test ticket with all checks.','No Alpaca connector, broker execution or automatic fills in this lab.'],
 ['Alerts','Entry, stop/target touches and session time notices while monitoring.','Visible page only; no background or mobile push notifications.'],
 ['Analyst','Company facts, available annual/quarterly results and source filings.','No SEC XBRL or AI analyst verdict.'],
 ['Pelosi','PSX director/sponsor disclosures.','A local substitute, not US congressional trading data.'],
];
export function LabCoverage({email}:{email?:string|null}){
 if(!email||!reviewers.has(email.trim().toLowerCase()))return null;
 return <details className="lab-coverage lab-panel"><summary>Compared with the GitHub project · what matches?</summary><p>This is a separate PSX adaptation, not a verbatim copy or an autonomous trader. Checked against upstream commit <code>3d0f4ef</code>. Saved plans and their rule/risk settings sync to the lab’s own Drive file.</p><div className="lab-table-wrap"><table><thead><tr><th>Original tool</th><th>Available here</th><th>Difference</th></tr></thead><tbody>{coverage.map(([name,here,difference])=><tr key={name}><td><strong>{name}</strong></td><td>{here}</td><td>{difference}</td></tr>)}</tbody></table></div><a href="https://github.com/Jakeschincariol/day-trader-skill/tree/3d0f4ef6986f4984b7c6bd46f7ff4f87744c3abd" target="_blank" rel="noopener noreferrer">View reviewed source</a></details>;
}
