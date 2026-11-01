import React,{useEffect,useMemo,useRef,useState} from 'react';
import type {LabData} from './data';
import {DEFAULT_RULES,type Rules} from './workflow';
import {SCAN_BATCH} from './scannerData';
import {DEFAULT_PLAN} from './engine';
import {runMarketScan,remainingScanStocks,type MarketSymbol,type ScanKind,type ScanRow,type SetupProgress} from './scanner';
import {setupStrength,RATING_TEXT,type SetupStrength,type ScanCosts} from './strength';
import {enrichWatchlist,matchesResultGroup,scanMembership,RESULT_GROUPS,type ResultGroup} from './resultGroups';

export type ScanScope='kse100'|'kmi30'|'market'|'watchlist';
const SCOPES:[ScanScope,string][]=[['kse100','KSE-100 stocks'],['kmi30','KMI-30 (Shariah) stocks'],['market','Full PSX market'],['watchlist','My Watchlist']];
const SCOPE_LABEL:Record<ScanScope,string>={kse100:'KSE-100',kmi30:'KMI-30',market:'Full PSX market',watchlist:'Watchlist'};
const savedKey='psx-lab-last-scan:v1';
/** The last scan is kept for this browser session so leaving the Lab does not lose it. */
function readSavedScan(){try{const raw=JSON.parse(sessionStorage.getItem(savedKey)||'null');return raw&&Array.isArray(raw.rows)&&raw.job?raw as {job:Job;rows:ScanRow[]}:null;}catch{return null;}}
function saveScan(job:Job|null,rows:ScanRow[]){try{if(job)sessionStorage.setItem(savedKey,JSON.stringify({job,rows}));}catch{/* Too large or blocked storage: the scan stays on screen only. */}}
import {recentOpenSnapshot,missingLevelsReason,scanDiagnostics} from './scannerView';

function StrengthCell({rating}:{rating:SetupStrength}){return <td className="lab-strength" data-label="Checks passed"><span className={'lab-badge lab-strength-'+rating.label.toLowerCase().replace(' ','-')}>{RATING_TEXT[rating.label]}</span><small>{rating.context}</small>{rating.netRR!=null&&<strong className="lab-rating-metric">{rating.netRR.toFixed(2)}R after costs</strong>}{rating.volumeRatio!=null&&<small>{rating.volumeRatio.toFixed(2)}× breakout volume</small>}{rating.summary&&<small>{rating.summary}</small>}{rating.label==='Skip'&&<strong className="lab-down">{rating.reasons[0]}</strong>}<details><summary>Which checks passed?</summary><ul>{rating.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul></details></td>;}
function Outcome({progress}:{progress:SetupProgress}){return <div className={'lab-outcome lab-outcome-'+progress.state}><strong>{progress.label}</strong><small>Candle close: {timestamp(progress.at)}</small><details><summary>Candle check</summary><small>{progress.reason}</small></details></div>;}
function StockTags({stock,held}:{stock:MarketSymbol;held:boolean}){
  const membership=scanMembership(stock);
  return <div className="lab-stock-tags" aria-label={`${stock.symbol} groups`}>
    {membership.kse100&&<span className="lab-stock-tag lab-stock-index">KSE-100</span>}
    {membership.kmi30&&<span className="lab-stock-tag lab-stock-index">KMI-30</span>}
    {membership.shariah&&<span className="lab-stock-tag lab-stock-shariah" title="Listed in a Shariah-screened index in this scan’s PSX Market Watch snapshot">Shariah</span>}
    {held&&<span className="lab-stock-tag lab-stock-held">My holding</span>}
  </div>;
}

type Job={kind:ScanKind;rules:Rules;stocks:MarketSymbol[];label:string;source:string;retrievedAt:string;membershipNotice?:string};
const number=(n:number|null|undefined)=>n==null?'—':n.toLocaleString('en-PK',{maximumFractionDigits:2});
const timestamp=(n:number|null|undefined)=>n?new Date(n).toLocaleString('en-GB',{timeZone:'Asia/Karachi',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+' PKT':'—';
const matches=(r:ScanRow)=>!!r.daily?.setups.length||!!r.entry?.check?.trigger;
const PAGE_SIZE=30;
const EMPTY_HOLDINGS:string[]=[];

export function LabScanner({data,watchlist=EMPTY_HOLDINGS,onOpenWatchlist,canScan,onChoose,onPlan,onKind,costs=DEFAULT_PLAN,onCosts,holdings=EMPTY_HOLDINGS,holdingsLabel='Selected portfolio'}:{data:LabData;watchlist?:string[];onOpenWatchlist?:()=>void;canScan?:(scope:ScanScope)=>boolean;onChoose:(symbol:string)=>void;onPlan?:(row:ScanRow,rules:Rules)=>void;onKind?:(kind:ScanKind)=>void;costs?:ScanCosts;onCosts?:(value:ScanCosts)=>void;holdings?:string[];holdingsLabel?:string}){
  const saved=useMemo(readSavedScan,[]);
  const [scope,setScope]=useState<ScanScope>('kse100'),[kind,setKind]=useState<ScanKind>(saved?.job.kind??'intraday'),[includeInactive,setIncludeInactive]=useState(false);
  const [volumeX,setVolumeX]=useState(0),[entryMinutes,setEntryMinutes]=useState(90);
  const [rows,setRows]=useState<ScanRow[]>(saved?.rows??[]),[job,setJob]=useState<Job|null>(saved?.job??null),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
  const [query,setQuery]=useState(''),[sector,setSector]=useState(''),[onlyMatches,setOnlyMatches]=useState(false),[minPrice,setMinPrice]=useState(0),[minVolume,setMinVolume]=useState(0),[page,setPage]=useState(0);
  const [strengthFilter,setStrengthFilter]=useState(''),[includeSkipped,setIncludeSkipped]=useState(false);
  const [progressFilter,setProgressFilter]=useState('');
  const [group,setGroup]=useState<ResultGroup>('');
  const [clock,setClock]=useState(Date.now),[startedAt,setStartedAt]=useState(0),[finishedAt,setFinishedAt]=useState(0);
  const [retryAt,setRetryAt]=useState(0);
  useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState!=='hidden')setClock(Date.now());},15000);return()=>clearInterval(timer);},[]);
  useEffect(()=>onKind?.(job?.kind??kind),[onKind,job?.kind,kind]);
  const heldSymbols=useMemo(()=>new Set(holdings.map(symbol=>symbol.trim().toUpperCase())),[holdings]);
  const controller=useRef<AbortController|null>(null),generation=useRef(0),running=useRef(false);
  useEffect(()=>()=>{generation.current++;controller.current?.abort();running.current=false;},[]);
  const retryStocks=job?remainingScanStocks(job.stocks,rows):[];

  async function scan(retry=false){
    if(running.current||Date.now()<retryAt)return;
    let chosen:MarketSymbol[]|null=null;
    if(!retry&&scope==='watchlist'){
      const symbols=[...new Set(watchlist.map(s=>s.trim().toUpperCase()).filter(s=>/^[A-Z][A-Z0-9.-]{0,11}$/.test(s)))];
      if(!symbols.length){setError('Your Watchlist is empty. Add stocks to it, then scan it here.');return;}
      chosen=symbols.map(symbol=>({symbol,name:symbol,sector:'Watchlist',volume:null}));
    }
    // Plan limits apply to list scans; a watchlist scan checks only your own few stocks.
    if(!retry&&scope!=='watchlist'&&canScan&&!canScan(scope))return;
    if(!retry&&kind==='intraday'&&(!Number.isFinite(volumeX)||volumeX<0||volumeX>100||!Number.isFinite(entryMinutes)||entryMinutes<20||entryMinutes>360)){
      setError('Use a volume multiplier from 0 to 100 and an entry window from 20 to 360 minutes.');return;
    }
    const abort=new AbortController();controller.current=abort;const id=++generation.current;running.current=true;setBusy(true);setError('');setStatus('Loading stock list…');setStartedAt(Date.now());setFinishedAt(0);setClock(Date.now());
    if(!retry){setRows([]);setJob(null);setPage(0);setSector('');}
    try{
      let activeJob=job,stocks=retryStocks;
      if(!retry){
        let universe:Awaited<ReturnType<LabData['universe']>>&{membershipNotice?:string};
        if(chosen){
          try{
            const market=await data.universe(abort.signal);
            universe={...market,stocks:enrichWatchlist(chosen,market.stocks)};
          }catch(e){
            if(abort.signal.aborted)throw e;
            universe={stocks:chosen,source:'Your saved watchlist',retrievedAt:new Date().toISOString(),membershipNotice:'Index tags are unavailable because Market Watch could not load. Your watchlist scan can still continue.'};
          }
        }else{
          const market=await data.universe(abort.signal);
          // Index lists come from Market Watch membership; zero-volume listings are left out unless asked for.
          const listed=market.stocks.filter(s=>scope==='kse100'?scanMembership(s).kse100:scope==='kmi30'?scanMembership(s).kmi30:true);
          universe={...market,stocks:includeInactive?listed:listed.filter(s=>(s.volume??0)>0)};
          if(!universe.stocks.length)throw new Error(`No ${SCOPE_LABEL[scope]} stocks were found in PSX Market Watch. Try again shortly.`);
        }
        if(abort.signal.aborted||id!==generation.current)return;
        activeJob={...universe,kind,rules:{...DEFAULT_RULES,volumeX,entryMinutes},label:SCOPE_LABEL[scope]};
        stocks=universe.stocks;setJob(activeJob);
      }
      if(!activeJob||!stocks.length)return;
      setStatus('Scanning');
      const result=await runMarketScan({stocks,kind:activeJob.kind,rules:activeJob.rules,signal:abort.signal,load:data.scanCandles,
        loadBatch:data.scanBatch,batchSize:SCAN_BATCH[activeJob.kind],
        onWait:until=>{if(id===generation.current)setStatus(`Service busy · continuing by itself at ${timestamp(until)}`);},
        onRow:row=>{if(id===generation.current)setRows(old=>[...old.filter(r=>r.symbol!==row.symbol),row]);}});
      if(id!==generation.current)return;
      setRetryAt(result.retryAt);
      setStatus(result.cancelled?'Stopped · partial results kept':result.pause?'Paused · partial results kept':result.failed?'Scan finished with feed errors':'Scan finished');
      if(result.pause)setError(result.pause);
    }catch(e){
      if(id===generation.current){setStatus(abort.signal.aborted?'Stopped · partial results kept':'Scan could not finish');if(!abort.signal.aborted)setError((e as Error).message);}
    }finally{if(id===generation.current){setBusy(false);running.current=false;setFinishedAt(Date.now());setClock(Date.now());}}
  }
  useEffect(()=>{if(!busy)saveScan(job,rows);},[busy,job,rows]);

  const sectors=useMemo(()=>[...new Set(job?.stocks.map(s=>s.sector)||[])].sort(),[job]);
  const strengths=useMemo(()=>new Map(rows.map(row=>[row.symbol,setupStrength(row,costs)])),[rows,costs.feePct,costs.slipPct,costs.oneSideCommission]);
  const ratingCounts=useMemo(()=>new Map(['Strong','Moderate','Weak','Skip','No setup','Incomplete','Unavailable'].map(label=>[label,[...strengths.values()].filter(r=>r.label===label).length])),[strengths]);
  const groupCounts=useMemo(()=>new Map(RESULT_GROUPS.map(option=>[option.value,rows.filter(row=>matchesResultGroup(row,option.value,heldSymbols)).length])),[rows,heldSymbols]);
  const diagnostics=useMemo(()=>scanDiagnostics(rows,strengths),[rows,strengths]);
  const filtered=useMemo(()=>rows.filter(r=>{
    if(query&&!`${r.symbol} ${r.name}`.toLowerCase().includes(query.trim().toLowerCase()))return false;
    if(sector&&r.sector!==sector)return false;
    if(!matchesResultGroup(r,group,heldSymbols))return false;
    if(r.error)return true; // Failed feeds stay visible, even under numeric/match filters.
    if(!includeSkipped&&strengths.get(r.symbol)?.label==='Skip')return false;
    if(strengthFilter&&strengths.get(r.symbol)?.label!==strengthFilter)return false;
    if(job?.kind==='intraday'&&progressFilter){
      const entry=r.entry;
      if(progressFilter==='recent'&&!recentOpenSnapshot(r,clock))return false;
      if(progressFilter!=='recent'&&entry?.progress?.state!==progressFilter)return false;
    }
    const price=r.daily?.last.close??r.entry?.last?.close,volume=r.daily?.avgVolume??r.volume;
    return (minPrice===0||(price!=null&&price>=minPrice))&&(minVolume===0||(volume!=null&&volume>=minVolume))&&(!onlyMatches||matches(r));
  }).sort((a,b)=>Number(strengths.get(a.symbol)?.label==='Skip')-Number(strengths.get(b.symbol)?.label==='Skip')||Number(matches(b))-Number(matches(a))||(strengths.get(b.symbol)!.rank-strengths.get(a.symbol)!.rank)||((b.daily?.last.close??b.entry?.last?.close??0)*(b.daily?.avgVolume??b.volume??0)-(a.daily?.last.close??a.entry?.last?.close??0)*(a.daily?.avgVolume??a.volume??0))||a.symbol.localeCompare(b.symbol)),[rows,query,sector,minPrice,minVolume,onlyMatches,includeSkipped,strengthFilter,strengths,group,heldSymbols,progressFilter,job?.kind,clock]);
  useEffect(()=>setPage(0),[query,sector,minPrice,minVolume,onlyMatches,includeSkipped,strengthFilter,group,heldSymbols,progressFilter]);
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)),currentPage=Math.min(page,pages-1),shown=filtered.slice(currentPage*PAGE_SIZE,(currentPage+1)*PAGE_SIZE);
  const skippedCount=rows.filter(row=>strengths.get(row.symbol)?.label==='Skip').length;
  const failed=rows.filter(r=>r.error).length,matched=rows.filter(matches).length,isIntraday=(job?.kind??kind)==='intraday';
  const elapsed=startedAt?Math.max(0,Math.floor(((finishedAt||clock)-startedAt)/1000)):0;
  const coolingDown=clock<retryAt;
  const clearFilters=()=>{setQuery('');setSector('');setGroup('');setStrengthFilter('');setProgressFilter('');setMinPrice(0);setMinVolume(0);setOnlyMatches(false);setIncludeSkipped(false);};
  return <section className="lab-panel lab-market-scanner" aria-label="Market-wide PSX scanner">
    <div className="lab-panel-heading"><div><span className="lab-eyebrow">SCANNER</span><h2>Find setups to practise on</h2><p>Check KSE-100, KMI-30, the full PSX market or your Watchlist against the opening-range rules. A match is something to study, not a recommendation.</p></div><span className="lab-badge">{job?`${job.stocks.length} stocks · ${job.label}`:SCOPE_LABEL[scope]}</span></div>
    <div className="lab-scanner-controls">
      <label className="lab-field"><span>Stocks to scan</span><select disabled={busy} value={scope} onChange={e=>setScope(e.target.value as ScanScope)}>{SCOPES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="lab-field"><span>Scan for</span><select disabled={busy} value={kind} onChange={e=>setKind(e.target.value as ScanKind)}><option value="intraday">Automatic intraday setups & levels</option><option value="daily">Daily setup research</option></select></label>
      {scope==='watchlist'&&<p className="lab-field lab-scanner-wide">{watchlist.length?<span>Scans the {watchlist.length} stocks in your app Watchlist: {watchlist.slice(0,12).join(', ')}{watchlist.length>12?'…':''}.</span>:<span>Your Watchlist is empty.</span>}{onOpenWatchlist&&<button type="button" onClick={onOpenWatchlist}>Edit Watchlist</button>}</p>}
      {scope==='market'&&<label className="lab-check lab-scanner-wide"><input type="checkbox" disabled={busy} checked={includeInactive} onChange={e=>setIncludeInactive(e.target.checked)}/> Include stocks with no trades today (slower; usually nothing to test)</label>}
      {kind==='intraday'&&<details className="lab-scanner-wide lab-advanced"><summary>Advanced scan rules (optional)</summary><p>Default: opening-range breakout, range low as stop, 2R benchmark capped by resistance, typical movement and price limits, 90-minute entry window, volume filter off. Optional changes apply to the next scan.</p><div className="lab-scanner-controls"><label className="lab-field"><span>Minimum opening-volume multiple</span><input disabled={busy} type="number" min={0} max={100} step="0.1" value={Number.isFinite(volumeX)?volumeX:''} onChange={e=>setVolumeX(e.target.value===''?NaN:Number(e.target.value))}/><small>0 = off; 1.5 = 1.5× the opening candles’ average</small></label><label className="lab-field"><span>Entry window · minutes after open</span><input disabled={busy} type="number" min={20} max={360} value={Number.isFinite(entryMinutes)?entryMinutes:''} onChange={e=>setEntryMinutes(e.target.value===''?NaN:Number(e.target.value))}/></label></div><button disabled={busy} onClick={()=>{setVolumeX(DEFAULT_RULES.volumeX);setEntryMinutes(DEFAULT_RULES.entryMinutes);}}>Restore default scan rules</button></details>}
    </div>
    <p>{kind==='daily'?'Daily rules use completed daily candles. Each result shows its source date.':'Rules apply automatically. After a confirmed opening-range breakout, we calculate entry, stop-loss and a take-profit estimate limited by nearby resistance, typical daily movement, the daily price band and a 2R benchmark. Friday sessions are separate. No confirmation means no entry levels.'} Stocks are checked in small groups, so a KSE-100 scan takes a few minutes and a full-market scan longer. Results appear as each group finishes and stay here while you use the rest of the app.</p>
    {kind==='intraday'&&<p className="lab-scan-settings"><strong>{busy?'Running rules':'Next scan rules'}:</strong> {entryMinutes}-minute window after the regular open · {volumeX===0?'volume filter off':`volume at least ${volumeX}× the opening average`}. {entryMinutes!==DEFAULT_RULES.entryMinutes||volumeX!==DEFAULT_RULES.volumeX?'Custom rules are selected.':'Default rules are selected.'}</p>}
    {isIntraday&&<details className="lab-advanced"><summary>Trading costs used in ratings · {number(costs.feePct)}% commission (Rs. 0.03–0.05/share minimum by price){costs.oneSideCommission?' on buying only':''} + 15% tax + CDC Rs. 0.005/share + exchange fees + {number(costs.slipPct)}% slippage, each side</summary><p>Applied to both buying and selling. Capital gains tax is excluded. Changes update ratings without rescanning and also apply in Trade plan.</p>{onCosts&&<div className="lab-scanner-controls">{(['feePct','slipPct'] as const).map(key=><label className="lab-field" key={key}><span>{key==='feePct'?'Commission rate per side · %':'Slippage per side · %'}</span><input type="number" min={0} max={10} step="0.01" value={Number.isFinite(costs[key])?costs[key]:''} onChange={e=>onCosts({...costs,[key]:e.target.value===''?NaN:Number(e.target.value)})}/></label>)}<label className="lab-check lab-scanner-wide"><input type="checkbox" checked={!!costs.oneSideCommission} onChange={e=>onCosts({...costs,oneSideCommission:e.target.checked})}/> My broker charges commission on one side only for same-day trades</label></div>}</details>}
    <div className="lab-scanner-actions"><button className="lab-primary" disabled={busy||coolingDown} onClick={()=>void scan()}>{busy?'Scanning…':`Scan ${SCOPE_LABEL[scope]}`}</button>{busy?<button onClick={()=>controller.current?.abort()}>Stop scan</button>:!!retryStocks.length&&<button disabled={coolingDown} onClick={()=>void scan(true)}>Retry {retryStocks.length} failed / unfinished</button>}</div>
    {error&&<p className="lab-warning" role="alert">{error}</p>}{coolingDown&&<p role="status">Feed requested a pause. Retry becomes available in about {Math.ceil((retryAt-clock)/1000)} seconds.</p>}
    {(busy||job)&&<div className="lab-scan-progress"><strong role="status">{status}</strong>{job&&<span> · {rows.length} / {job.stocks.length}</span>}<small>Elapsed {Math.floor(elapsed/60)}m {elapsed%60}s · stocks checked in groups, paced to protect the data service</small>{job&&<><progress aria-label="Stocks checked" max={job.stocks.length} value={rows.length}/><small>{matched} rule matches · {rows.length-failed} evaluated · {failed} failed · {job.stocks.length-rows.length} remaining</small><small>{job.label} · {job.kind==='daily'?'Daily setups':`Opening range · ${job.rules.entryMinutes} min · volume ${job.rules.volumeX}×`} · list loaded {timestamp(Date.parse(job.retrievedAt))} from {job.source}</small></>}</div>}
    {job&&<>
      <div className="lab-rating-counts" aria-label="Scan rating totals">{[...ratingCounts].map(([label,count])=><span key={label}><strong>{count}</strong> {RATING_TEXT[label as SetupStrength['label']]}</span>)}</div>
      {isIntraday&&<p className="lab-membership-help">Quality compares conditions at the original entry using the costs shown above. The outcome column shows what happened afterward, as of each stock’s check time. A target or stop touch does not change its original quality. Changing costs recalculates quality; it does not refresh candles.</p>}
      {isIntraday&&rows.length>0&&diagnostics.stronger===0&&<div className="lab-scan-diagnostics" role="status"><strong>{busy?'No setups passing 2 or 3 checks so far':'No setups passing 2 or 3 checks in the checked results'}</strong><p>{diagnostics.matched} confirmed breakouts · {diagnostics.lowReward} passing 1 check with net reward/risk below 1R · {diagnostics.skipped} skipped · {diagnostics.incomplete} incomplete · {diagnostics.failed} feed failures.</p><p>{diagnostics.waiting} waiting for a match · {diagnostics.expired} entry windows ended without a match. These counts cover the checked results, before filters. {rows.length<job.stocks.length||failed?'Unchecked or failed stocks prevent a conclusion about the whole market.':'The rating is a rule comparison, not proof that no stock can rise.'}</p></div>}
      <div className="lab-scanner-controls lab-scanner-filters">
        <label className="lab-field"><span>Find a stock or company</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Symbol or company name"/></label>
        <label className="lab-field"><span>Sector</span><select value={sector} onChange={e=>setSector(e.target.value)}><option value="">All sectors</option>{sectors.map(s=><option key={s}>{s}</option>)}</select></label>
        <label className="lab-field"><span>Index / holdings</span><select value={group} onChange={e=>setGroup(e.target.value as ResultGroup)}><option value="">All stocks ({rows.length})</option>{RESULT_GROUPS.map(option=><option key={option.value} value={option.value}>{option.label} ({groupCounts.get(option.value)||0})</option>)}</select><small>Counts are from scanned results, before other filters. Holdings: {holdingsLabel.toLowerCase()}.</small></label>
        <label className="lab-field"><span>Checks passed</span><select value={strengthFilter} onChange={e=>{setStrengthFilter(e.target.value);if(e.target.value==='Skip')setIncludeSkipped(true);}}><option value="">All results</option>{(['Strong','Moderate','Weak','Skip','No setup','Incomplete','Unavailable'] as const).map(label=><option key={label} value={label}>{RATING_TEXT[label]}</option>)}</select></label>
        {isIntraday&&<label className="lab-field"><span>Outcome when checked</span><select value={progressFilter} onChange={e=>setProgressFilter(e.target.value)}><option value="">All outcomes</option><option value="recent">Recent & open snapshots</option><option value="target">Target touched first</option><option value="stop">Stop touched first</option><option value="ambiguous">Both levels in one candle</option><option value="faded">Below breakout level</option><option value="closed">Time window closed</option><option value="unknown">Outcome incomplete</option></select><small>Confirmed within the last 10 minutes, with fresh candles and neither level touched when checked. Snapshots age out automatically; prices are not refreshed by this filter.</small></label>}
        <label className="lab-field"><span>Minimum price · PKR</span><input type="number" min={0} value={minPrice} onChange={e=>setMinPrice(Math.max(0,Number(e.target.value)||0))}/></label>
        <label className="lab-field"><span>{isIntraday?'Minimum market snapshot volume':'Minimum 20-session average volume'}</span><input type="number" min={0} value={minVolume} onChange={e=>setMinVolume(Math.max(0,Number(e.target.value)||0))}/></label>
      </div>
      <button onClick={clearFilters}>Clear result filters</button>
      {job.membershipNotice&&<p className="lab-warning" role="status">{job.membershipNotice}</p>}
      <p className="lab-membership-help">Index and Shariah tags use the scan’s PSX Market Watch list. Shariah means membership in a Shariah-screened index; missing tags mean unverified membership. Filters update these results without rescanning.</p>
      {group==='HOLDINGS'&&heldSymbols.size===0&&<p className="lab-warning" role="status">No current stock holdings in {holdingsLabel.toLowerCase()}. Load or select a portfolio with open stock positions to use this filter.</p>}
      <label className="lab-check"><input type="checkbox" checked={onlyMatches} onChange={e=>setOnlyMatches(e.target.checked)}/> Show rule matches only</label>
      {isIntraday&&<label className="lab-check"><input type="checkbox" checked={includeSkipped} onChange={e=>{setIncludeSkipped(e.target.checked);if(!e.target.checked&&strengthFilter==='Skip')setStrengthFilter('');}}/> Show skipped setups for research ({skippedCount})</label>}{isIntraday&&<p className="lab-membership-help">{skippedCount} skipped: no usable upside or no positive profit after estimated costs. Hidden by default. A breakout alone is not a trade candidate.</p>}
      <p>{filtered.length} of {rows.length} results · Matches first, then setup strength and liquidity. Feed failures stay visible. Tap a symbol to see its chart. Test this setup opens its levels in Trade plan for practice; closed-session setups are for historical testing.</p>
      {isIntraday&&progressFilter==='recent'&&filtered.length>0&&!filtered.some(row=>!row.error)&&<p className="lab-empty">No recent open setups match these filters. Closed sessions, old breakouts and finished setups are excluded. Feed failures remain below so you can retry them.</p>}
      <details className="lab-advanced"><summary>What “3 of 3 checks” means</summary><p>These count rule checks; they are not probabilities of profit or recommendations. 3 of 3 passes every check; 2 of 3 passes two; 1 of 3 has fewer confirmations or too little reward after costs. Historical ratings describe the setup at confirmation, not a current entry.</p><p>{isIntraday?'Intraday checks: a completed closing breakout, breakout volume at least 1.5× the opening-candle average, and reward/risk at least 1.50R after costs. Positive net reward/risk below 1R remains Weak. No positive profit at the target is Skip and hidden by default. Missing target data is Incomplete; estimated price bands or other target warnings cap quality at Moderate. Later price movement is shown separately as the outcome. Touches use only completed candles after entry and before the planned session exit; they are not confirmed fills. Missing candles make the outcome incomplete, and a candle touching both levels has unknown order.':'Daily checks: a setup other than oversold alone, close above its 20-day average, and volume at least 1.5× the previous 20-session average. Oversold alone stays Weak. Daily ratings do not include an entry/stop/target cost check.'} Missing volume never counts as confirmation. Market conditions and liquidity can change after the scan.</p></details>
      {isIntraday&&<p className="lab-warning">This is a one-time scan, not a simultaneous live feed. Check each candle and confirmation time. Closed sessions and delayed data are labelled; an earlier breakout is not a new entry call. Use Trade plan → Monitor this stock for ongoing checks.</p>}
      <div className="lab-table-wrap"><table><thead><tr><th>Stock / company</th><th>Checks passed</th><th>{isIntraday?'Last 5m close':'Daily close'} · PKR</th>{isIntraday?<><th>First 15 minutes high</th><th>Entry / test stop / test exit</th></>:<><th>Daily move</th><th>RSI / volume</th></>}<th>{isIntraday?'Outcome / snapshot time':'Setup / source date'}</th></tr></thead><tbody>{shown.map(r=><tr key={r.symbol}><td data-label="Stock"><button className="lab-link" onClick={()=>onChoose(r.symbol)}>{r.symbol}</button><small>{r.name}</small><small>{r.sector}</small><StockTags stock={r} held={heldSymbols.has(r.symbol)}/></td><StrengthCell rating={strengths.get(r.symbol)!}/><td data-label={isIntraday?'Last 5-minute close':'Daily close'}>{number(r.daily?.last.close??r.entry?.last?.close)}</td>{isIntraday?<><td data-label="First 15 minutes high">{number(r.entry?.check?.level)}</td><td data-label="Entry / test stop / test exit">{r.entry?.levels?<><strong>{number(r.entry.levels.entry)}</strong><small>Test stop: {number(r.entry.levels.stop)}</small><small>Test exit: {number(r.entry.levels.target)}</small><small>{r.entry.targetReview?.reason}</small>{r.entry.targetReview&&!r.entry.targetReview.complete&&<small className="lab-down">Target checks incomplete</small>}{r.entry.targetReview?.estimatedBand&&<small>Estimated price band</small>}<small>{timestamp(r.entry.triggerAt)}</small>{onPlan&&<button className="lab-link" onClick={()=>onPlan(r,job.rules)}>{strengths.get(r.symbol)?.label==='Skip'?'Inspect skipped setup':r.entry.status==='Session ended'?'Test historical setup':!recentOpenSnapshot(r,clock)?'Inspect earlier snapshot':'Test this setup'}</button>}</>:<small>{missingLevelsReason(r)}</small>}</td></>:<><td data-label="Daily move" className={(r.daily?.changePct??0)>=0?'lab-up':'lab-down'}>{r.daily?`${r.daily.changePct>=0?'+':''}${r.daily.changePct.toFixed(2)}%`:'—'}</td><td data-label="RSI / volume">{r.daily?.rsi?.toFixed(1)??'—'}<small>{r.daily?.relativeVolume!=null?`${r.daily.relativeVolume.toFixed(2)}× volume`:'Volume unavailable'}</small></td></>}<td data-label={isIntraday?'Outcome':'Setup'}>{r.entry?.progress&&<Outcome progress={r.entry.progress}/>}{r.error||r.daily?.setups.join(' · ')||r.entry?.status||'No rule matched'}{r.entry?.check?.trigger&&!r.entry.recent&&<small>Earlier breakout · review its time</small>}<small>{r.daily?.date??(r.entry?`${r.entry.date} · ${r.entry.family}`:'')}</small>{r.entry&&<><small>Last candle: {timestamp(r.entry.latestCloseAt)}</small><small>Checked: {timestamp(r.checkedAt)}</small>{clock-r.checkedAt>600000&&<small className="lab-down">Snapshot over 10 minutes old · rescan to update</small>}</>}{r.entry?.check?.state==='incomplete'&&<small>{r.entry.check.reason}</small>}</td></tr>)}</tbody></table></div>
      {!filtered.length&&<p className="lab-empty">{busy?'Waiting for results matching these filters…':group==='HOLDINGS'&&heldSymbols.size?'None of your current holdings match these scan results and filters.':progressFilter==='recent'?'No recent open setups match these filters. Closed sessions, old breakouts and finished setups are excluded.':'No results match these filters.'}</p>}
      <div className="lab-scanner-pagination"><button disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Previous</button><span>Page {currentPage+1} of {pages}</span><button disabled={currentPage>=pages-1} onClick={()=>setPage(currentPage+1)}>Next</button></div>
    </>}
  </section>;
}
