import React,{useEffect,useMemo,useRef,useState} from 'react';
import type {LabData} from './data';
import {parseWatchlist} from './storage';
import {DEFAULT_RULES,type Rules} from './workflow';
import {runMarketScan,remainingScanStocks,type MarketSymbol,type ScanKind,type ScanRow} from './scanner';
import {setupStrength,type SetupStrength} from './strength';

function StrengthCell({rating}:{rating:SetupStrength}){return <td className="lab-strength"><span className={'lab-badge lab-strength-'+rating.label.toLowerCase().replace(' ','-')}>{rating.label}</span><small>{rating.context}</small><details><summary>Why this rating?</summary><ul>{rating.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul></details></td>;}

type Job={kind:ScanKind;rules:Rules;stocks:MarketSymbol[];label:string;source:string;retrievedAt:string};
const number=(n:number|null|undefined)=>n==null?'—':n.toLocaleString('en-PK',{maximumFractionDigits:2});
const timestamp=(n:number|null|undefined)=>n?new Date(n).toLocaleString('en-GB',{timeZone:'Asia/Karachi',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+' PKT':'—';
const matches=(r:ScanRow)=>!!r.daily?.setups.length||!!r.entry?.check?.trigger;
const PAGE_SIZE=30;

export function LabScanner({data,watchlist,onWatchlist,onSaveWatchlist,onChoose,onPlan}:{data:LabData;watchlist:string;onWatchlist:(value:string)=>void;onSaveWatchlist:(value:string)=>boolean;onChoose:(symbol:string)=>void;onPlan?:(row:ScanRow,rules:Rules)=>void}){
  const [scope,setScope]=useState<'market'|'watchlist'>('market'),[kind,setKind]=useState<ScanKind>('intraday');
  const [volumeX,setVolumeX]=useState(0),[entryMinutes,setEntryMinutes]=useState(90);
  const [rows,setRows]=useState<ScanRow[]>([]),[job,setJob]=useState<Job|null>(null),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
  const [query,setQuery]=useState(''),[sector,setSector]=useState(''),[onlyMatches,setOnlyMatches]=useState(false),[minPrice,setMinPrice]=useState(0),[minVolume,setMinVolume]=useState(0),[page,setPage]=useState(0);
  const [strengthFilter,setStrengthFilter]=useState('');
  const controller=useRef<AbortController|null>(null),generation=useRef(0),running=useRef(false);
  useEffect(()=>()=>{generation.current++;controller.current?.abort();running.current=false;},[]);
  const retryStocks=job?remainingScanStocks(job.stocks,rows):[];

  async function scan(retry=false){
    if(running.current)return;
    let chosen:MarketSymbol[]|null=null;
    if(!retry&&scope==='watchlist'){
      try{chosen=parseWatchlist(watchlist).map(symbol=>({symbol,name:symbol,sector:'Watchlist',volume:null}));if(!onSaveWatchlist(chosen.map(s=>s.symbol).join(', ')))return;}
      catch(e){setError((e as Error).message);return;}
    }
    if(!retry&&kind==='intraday'&&(!Number.isFinite(volumeX)||volumeX<0||volumeX>100||!Number.isFinite(entryMinutes)||entryMinutes<20||entryMinutes>360)){
      setError('Use a volume multiplier from 0 to 100 and an entry window from 20 to 360 minutes.');return;
    }
    const abort=new AbortController();controller.current=abort;const id=++generation.current;running.current=true;setBusy(true);setError('');setStatus('Loading stock list…');
    if(!retry){setRows([]);setJob(null);setPage(0);setSector('');}
    try{
      let activeJob=job,stocks=retryStocks;
      if(!retry){
        const universe=chosen?{stocks:chosen,source:'Your saved watchlist',retrievedAt:new Date().toISOString()}:await data.universe(abort.signal);
        if(abort.signal.aborted||id!==generation.current)return;
        activeJob={...universe,kind,rules:{...DEFAULT_RULES,volumeX,entryMinutes},label:scope==='market'?'Full PSX market':'Watchlist'};
        stocks=universe.stocks;setJob(activeJob);
      }
      if(!activeJob||!stocks.length)return;
      setStatus('Scanning');
      const result=await runMarketScan({stocks,kind:activeJob.kind,rules:activeJob.rules,signal:abort.signal,load:data.scanCandles,
        onRow:row=>{if(id===generation.current)setRows(old=>[...old.filter(r=>r.symbol!==row.symbol),row]);}});
      if(id!==generation.current)return;
      setStatus(result.cancelled?'Stopped · partial results kept':result.pause?'Paused · partial results kept':'Scan finished');
      if(result.pause)setError(result.pause);
    }catch(e){
      if(id===generation.current){setStatus(abort.signal.aborted?'Stopped · partial results kept':'Scan could not finish');if(!abort.signal.aborted)setError((e as Error).message);}
    }finally{if(id===generation.current){setBusy(false);running.current=false;}}
  }

  const sectors=useMemo(()=>[...new Set(job?.stocks.map(s=>s.sector)||[])].sort(),[job]);
  const strengths=useMemo(()=>new Map(rows.map(row=>[row.symbol,setupStrength(row)])),[rows]);
  const filtered=useMemo(()=>rows.filter(r=>{
    if(query&&!`${r.symbol} ${r.name}`.toLowerCase().includes(query.trim().toLowerCase()))return false;
    if(sector&&r.sector!==sector)return false;
    if(r.error)return true; // Failed feeds stay visible, even under numeric/match filters.
    if(strengthFilter&&strengths.get(r.symbol)?.label!==strengthFilter)return false;
    const price=r.daily?.last.close??r.entry?.last?.close,volume=r.daily?.avgVolume??r.volume;
    return (minPrice===0||(price!=null&&price>=minPrice))&&(minVolume===0||(volume!=null&&volume>=minVolume))&&(!onlyMatches||matches(r));
  }).sort((a,b)=>Number(matches(b))-Number(matches(a))||(strengths.get(b.symbol)!.rank-strengths.get(a.symbol)!.rank)||((b.daily?.last.close??1)*(b.daily?.avgVolume??b.volume??0)-(a.daily?.last.close??1)*(a.daily?.avgVolume??a.volume??0))||a.symbol.localeCompare(b.symbol)),[rows,query,sector,minPrice,minVolume,onlyMatches,strengthFilter,strengths]);
  useEffect(()=>setPage(0),[query,sector,minPrice,minVolume,onlyMatches,strengthFilter]);
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)),currentPage=Math.min(page,pages-1),shown=filtered.slice(currentPage*PAGE_SIZE,(currentPage+1)*PAGE_SIZE);
  const failed=rows.filter(r=>r.error).length,matched=rows.filter(matches).length,isIntraday=(job?.kind??kind)==='intraday';
  return <section className="lab-panel lab-market-scanner" aria-label="Market-wide PSX scanner">
    <div className="lab-panel-heading"><div><span className="lab-eyebrow">PSX MARKET SCANNER</span><h2>Find setups across the market</h2><p>Scan every stock returned by PSX Market Watch, including zero-volume listings. Stocks missing from that source cannot be scanned.</p></div><span className="lab-badge">{job?`${job.stocks.length} stocks`:'Full market available'}</span></div>
    <div className="lab-scanner-controls">
      <label className="lab-field"><span>Stocks to scan</span><select disabled={busy} value={scope} onChange={e=>setScope(e.target.value as typeof scope)}><option value="market">Full PSX market</option><option value="watchlist">My watchlist</option></select></label>
      <label className="lab-field"><span>Scan for</span><select disabled={busy} value={kind} onChange={e=>setKind(e.target.value as ScanKind)}><option value="intraday">Automatic intraday setups & levels</option><option value="daily">Daily setup research</option></select></label>
      {scope==='watchlist'&&<label className="lab-field lab-scanner-wide"><span>Watchlist · up to 20 symbols</span><textarea rows={2} disabled={busy} value={watchlist} onChange={e=>onWatchlist(e.target.value)} placeholder="HBL, OGDC, MEBL"/></label>}
      {kind==='intraday'&&<details className="lab-scanner-wide lab-advanced"><summary>Advanced scan rules (optional)</summary><p>Default: opening-range breakout, range low as stop, target at 2R, 90-minute entry window. No edits are needed.</p><div className="lab-scanner-controls"><label className="lab-field"><span>Minimum opening-volume multiple</span><input disabled={busy} type="number" min={0} max={100} step="0.1" value={Number.isFinite(volumeX)?volumeX:''} onChange={e=>setVolumeX(e.target.value===''?NaN:Number(e.target.value))}/><small>0 = off; 1.5 = 1.5× the opening candles’ average</small></label><label className="lab-field"><span>Entry window · minutes after open</span><input disabled={busy} type="number" min={20} max={360} value={Number.isFinite(entryMinutes)?entryMinutes:''} onChange={e=>setEntryMinutes(e.target.value===''?NaN:Number(e.target.value))}/></label></div></details>}
    </div>
    <p>{kind==='daily'?'Daily rules use completed daily candles. Each result shows its source date.':'Rules apply automatically. After a confirmed opening-range breakout, we calculate entry, stop-loss and a 2R take-profit level. Friday sessions are separate. No confirmation means no entry levels.'} Full scans can take several minutes. Results appear as they arrive.</p>
    <div className="lab-scanner-actions"><button className="lab-primary" disabled={busy} onClick={()=>void scan()}>{busy?'Scanning…':scope==='market'?'Scan full PSX market':'Scan watchlist'}</button>{busy?<button onClick={()=>controller.current?.abort()}>Stop scan</button>:!!retryStocks.length&&<button onClick={()=>void scan(true)}>Retry {retryStocks.length} failed / unfinished</button>}</div>
    {error&&<p className="lab-warning" role="alert">{error}</p>}
    {(busy||job)&&<div className="lab-scan-progress" role="status"><strong>{status} {job&&`· ${rows.length} / ${job.stocks.length}`}</strong>{job&&<><progress aria-label="Stocks checked" max={job.stocks.length} value={rows.length}/><small>{matched} rule matches · {rows.length-failed} evaluated · {failed} failed · {job.stocks.length-rows.length} remaining</small><small>{job.label} · {job.kind==='daily'?'Daily setups':`Opening range · ${job.rules.entryMinutes} min · volume ${job.rules.volumeX}×`} · list loaded {timestamp(Date.parse(job.retrievedAt))} from {job.source}</small></>}</div>}
    {job&&<>
      <div className="lab-scanner-controls lab-scanner-filters">
        <label className="lab-field"><span>Find a stock or company</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Symbol or company name"/></label>
        <label className="lab-field"><span>Sector</span><select value={sector} onChange={e=>setSector(e.target.value)}><option value="">All sectors</option>{sectors.map(s=><option key={s}>{s}</option>)}</select></label>
        <label className="lab-field"><span>Setup strength</span><select value={strengthFilter} onChange={e=>setStrengthFilter(e.target.value)}><option value="">All ratings</option><option>Strong</option><option>Moderate</option><option>Weak</option><option>No setup</option><option>Incomplete</option></select></label>
        <label className="lab-field"><span>Minimum price · PKR</span><input type="number" min={0} value={minPrice} onChange={e=>setMinPrice(Math.max(0,Number(e.target.value)||0))}/></label>
        <label className="lab-field"><span>{isIntraday?'Minimum market snapshot volume':'Minimum 20-session average volume'}</span><input type="number" min={0} value={minVolume} onChange={e=>setMinVolume(Math.max(0,Number(e.target.value)||0))}/></label>
      </div>
      <label className="lab-check"><input type="checkbox" checked={onlyMatches} onChange={e=>setOnlyMatches(e.target.checked)}/> Show rule matches only</label>
      <p>{filtered.length} of {rows.length} results · Matches first, then setup strength and liquidity. Feed failures stay visible. Click a symbol to inspect its candles. Review setup opens the automatically calculated levels; closed-session setups are for historical testing.</p>
      <details className="lab-advanced"><summary>How Strong / Moderate / Weak is rated</summary><p>These are rule-based comparisons, not probabilities of profit. Strong meets all three checks; Moderate meets two; Weak has fewer confirmations or a failed price/cost check. Historical ratings describe the saved scan snapshot, not a current entry.</p><p>{isIntraday?'Intraday checks: breakout volume at least 1.5× the opening-candle average, reward/risk at least 1.50R after costs, and last close above the opening range but below target and above stop. A lost breakout or net reward/risk below 1R is Weak. Cost assumptions: 0.2% fees and 0.1% slippage each side; CGT excluded. Review your own costs in Trade plan.':'Daily checks: a setup other than oversold alone, close above its 20-day average, and volume at least 1.5× the previous 20-session average. Oversold alone stays Weak. Daily ratings do not include an entry/stop/target cost check.'} Missing volume never counts as confirmation. Market conditions and liquidity can change after the scan.</p></details>
      {isIntraday&&<p className="lab-warning">This is a one-time scan, not a simultaneous live feed. Check each candle and confirmation time. Closed sessions and delayed data are labelled; an earlier breakout is not a new entry call. Use Trade plan → Monitor this stock for ongoing checks.</p>}
      <div className="lab-table-wrap"><table><thead><tr><th>Stock / company</th><th>Setup strength</th><th>{isIntraday?'Last 5m close':'Daily close'} · PKR</th>{isIntraday?<><th>Opening high</th><th>Entry / stop / take profit</th></>:<><th>Daily move</th><th>RSI / volume</th></>}<th>{isIntraday?'Status when checked / candle time':'Setup / source date'}</th></tr></thead><tbody>{shown.map(r=><tr key={r.symbol}><td><button className="lab-link" onClick={()=>onChoose(r.symbol)}>{r.symbol}</button><small>{r.name}</small><small>{r.sector}</small></td><StrengthCell rating={strengths.get(r.symbol)!}/><td>{number(r.daily?.last.close??r.entry?.last?.close)}</td>{isIntraday?<><td>{number(r.entry?.check?.level)}</td><td>{r.entry?.levels?<><strong>{number(r.entry.levels.entry)}</strong><small>Stop: {number(r.entry.levels.stop)}</small><small>Take profit: {number(r.entry.levels.target)}</small><small>{timestamp(r.entry.triggerAt)}</small>{onPlan&&<button className="lab-link" onClick={()=>onPlan(r,job.rules)}>Review setup</button>}</>:<small>Waiting for confirmed levels</small>}</td></>:<><td className={(r.daily?.changePct??0)>=0?'lab-up':'lab-down'}>{r.daily?`${r.daily.changePct>=0?'+':''}${r.daily.changePct.toFixed(2)}%`:'—'}</td><td>{r.daily?.rsi?.toFixed(1)??'—'}<small>{r.daily?.relativeVolume!=null?`${r.daily.relativeVolume.toFixed(2)}× volume`:'Volume unavailable'}</small></td></>}<td>{r.error||r.daily?.setups.join(' · ')||r.entry?.status||'No rule matched'}{r.entry?.check?.trigger&&!r.entry.recent&&<small>Earlier breakout · review its time</small>}<small>{r.daily?.date??(r.entry?`${r.entry.date} · ${r.entry.family}`:'')}</small>{r.entry&&<><small>Last candle: {timestamp(r.entry.latestCloseAt)}</small><small>Checked: {timestamp(r.checkedAt)}</small></>}{r.entry?.check?.state==='incomplete'&&<small>{r.entry.check.reason}</small>}</td></tr>)}</tbody></table></div>
      {!filtered.length&&<p className="lab-empty">{busy?'Waiting for results matching these filters…':'No results match these filters.'}</p>}
      <div className="lab-scanner-pagination"><button disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Previous</button><span>Page {currentPage+1} of {pages}</span><button disabled={currentPage>=pages-1} onClick={()=>setPage(currentPage+1)}>Next</button></div>
    </>}
  </section>;
}
