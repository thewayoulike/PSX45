import React,{useEffect,useMemo,useRef,useState} from 'react';
import {StockAnnouncements} from '../../components/StockAnnouncements';
const StockChart=React.lazy(()=>import('../../components/StockChart').then(module=>({default:module.StockChart})));
import {LabGuide} from './LabGuide';
import {LabCoverage} from './LabCoverage';
import {LabScanner} from './LabScanner';
import {LabFinancials} from './LabFinancials';
import {RulesPanel,RiskPanel,ScenarioControls,ScenarioCharts} from './LabWorkflow';
import {intradayScan,type ScanRow} from './scanner';
import {DEFAULT_RULES,DEFAULT_RISK,parseWorkflow,replayRules,simulateRules,type Rules,type RiskContext} from './workflow';
import {useLabMonitor} from './useLabMonitor';
import {LabMonitors} from './LabMonitors';
import {LabNews} from './LabNews';
import {ArrowUpRight,Beaker,Download,RefreshCw,Search,ShieldCheck} from 'lucide-react';
import {DEFAULT_PLAN,dailyScan,intradaySegments,sizePlan,type Plan} from './engine';
import {labData,safeUrl,type CandleSet,type LabData,type Research} from './data';
import {readLab,writeLab,mergeLabs,deleteLabTicket,restoreLabTicket,LAB_CHANGED,type LabBook,type LabTicket} from './storage';
import {useLabDrive} from './useLabDrive';
import {WorkspaceDriveStatus} from '../../components/WorkspaceDriveStatus';
import './trading-lab.css';

const money=(n:number)=>Number.isFinite(n)?n.toLocaleString('en-PK',{maximumFractionDigits:2,minimumFractionDigits:2}):'—';
const pct=(n:number|null|undefined)=>n==null||!Number.isFinite(n)?'—':`${n>=0?'+':''}${n.toFixed(2)}%`;
const when=(s:string|number)=>{const d=new Date(s);return Number.isNaN(d.getTime())?'Unavailable':d.toLocaleString('en-GB',{timeZone:'Asia/Karachi',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})+' PKT';};
const tabs=['Scanner','Trade plan','Replay','Research','Lab journal'] as const;
type Tab=typeof tabs[number];
function External({url,children}:{url:string;children:React.ReactNode}){const href=safeUrl(url);return href?<a href={href} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={13}/></a>:<span>{children}</span>;}
function NumberField({label,value,onChange,step='any',suffix=''}:{label:string;value:number;onChange:(v:number)=>void;step?:string;suffix?:string}){return <label className="lab-field"><span>{label}{suffix&&<small>{suffix}</small>}</span><input type="number" step={step} value={Number.isFinite(value)?value:''} onChange={e=>onChange(e.target.value===''?NaN:Number(e.target.value))}/></label>;}

export function TradingLab({email,data=labData,driveConnected=false,onConnectDrive}:{email:string;data?:LabData;driveConnected?:boolean;onConnectDrive?:()=>void}){
  const cloud=useLabDrive(email,driveConnected);
  const [tab,setTab]=useState<Tab>('Scanner'),[book,setBook]=useState<LabBook>(()=>readLab(email)),[watchlist,setWatchlist]=useState(()=>readLab(email).watchlist);
  const [symbol,setSymbol]=useState('HBL'),[symbolInput,setSymbolInput]=useState('HBL'),[refresh,setRefresh]=useState(0);
  const [daily,setDaily]=useState<CandleSet|null>(null),[intraday,setIntraday]=useState<CandleSet|null>(null),[loading,setLoading]=useState(false),[intradayLoading,setIntradayLoading]=useState(false),[dataErrors,setDataErrors]=useState<string[]>([]);
  const [plan,setPlan]=useState<Plan>({...DEFAULT_PLAN}),[entrySource,setEntrySource]=useState(''),[note,setNote]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState('');
  const [research,setResearch]=useState<Research|null>(null),[researchLoading,setResearchLoading]=useState(false);
  const [replay,setReplay]=useState<ReturnType<typeof replayRules>|null>(null),[simulation,setSimulation]=useState<ReturnType<typeof simulateRules>|null>(null),[simulating,setSimulating]=useState(false);
  const [rules,setRules]=useState<Rules>({...DEFAULT_RULES}),[risk,setRisk]=useState<RiskContext>({...DEFAULT_RISK});
  const [deletedPlan,setDeletedPlan]=useState<{email:string;ticket:LabTicket}|null>(null);
  const monitor=useLabMonitor(data,symbol,setIntraday);
  const selectedMonitor=monitor.items.find(item=>item.symbol===symbol);
  const monitoredPlanChanged=!!selectedMonitor&&(JSON.stringify(selectedMonitor.plan)!==JSON.stringify(plan)||JSON.stringify(selectedMonitor.rules)!==JSON.stringify(rules));
  const bookRef=useRef(book);bookRef.current=book;
  useEffect(()=>{
    const reload=()=>{const next=readLab(email);setWatchlist(current=>current===bookRef.current.watchlist?next.watchlist:current);bookRef.current=next;setBook(next);};
    window.addEventListener(LAB_CHANGED,reload);window.addEventListener('storage',reload);
    return()=>{window.removeEventListener(LAB_CHANGED,reload);window.removeEventListener('storage',reload);};
  },[email]);
  const mounted=useRef(true),analysisId=useRef(0);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;analysisId.current++;};},[]);
  useEffect(()=>{
    let active=true;setLoading(true);setIntradayLoading(true);setDaily(null);setIntraday(null);setDataErrors([]);setResearch(null);setReplay(null);setSimulation(null);
    setPlan(p=>p.symbol===symbol?p:{...p,symbol,entry:0,stop:0,target:0});
    const dailyRequest=data.candles(symbol,false,refresh>0).then(d=>{
        if(active)setDaily(d);
    }).catch(()=>{if(active)setDataErrors(e=>[...e,'Daily candles unavailable. Refresh to retry.']);});
    const intradayRequest=data.candles(symbol,true,refresh>0).then(i=>{if(active)setIntraday(i);}).catch(()=>{if(active)setDataErrors(e=>[...e,'Intraday history unavailable. Entry checks and replay need real 5-minute candles.']);}).finally(()=>{if(active)setIntradayLoading(false);});
    void Promise.allSettled([dailyRequest,intradayRequest]).then(()=>{if(active)setLoading(false);});return()=>{active=false;};
  },[symbol,refresh,data]);
  useEffect(()=>{setReplay(null);setSimulation(null);analysisId.current++;setSimulating(false);},[symbol,plan,rules,intraday]);
  useEffect(()=>{
    if(tab!=='Research'||research)return;
    let active=true;setResearchLoading(true);
    data.research(symbol).then(r=>{if(active)setResearch(r);}).catch(()=>{if(active)setResearch({errors:['Research feeds are unavailable. Try refreshing.']});}).finally(()=>{if(active)setResearchLoading(false);});
    return()=>{active=false;};
  },[tab,symbol,research,data,refresh]);

  const stats=useMemo(()=>{try{return daily?dailyScan(daily.bars):null;}catch{return null;}},[daily]);
  const segment=useMemo(()=>intraday?intradaySegments(intraday.bars).at(-1):null,[intraday]);
  useEffect(()=>{
    if(selectedMonitor||!intraday||intraday.symbol!==symbol||plan.symbol!==symbol||plan.entry>0)return;
    const setup=intradayScan(intraday.bars,DEFAULT_RULES);
    if(!setup.levels)return;
    setPlan(p=>({...p,...setup.levels}));setRules({...DEFAULT_RULES});
    setEntrySource(`${setup.fresh?'Observed':'Historical'} opening-range setup · ${when(setup.triggerAt!)} · range-low stop · 2R target before costs`);
  },[intraday,symbol]);
  const sizing=useMemo(()=>sizePlan(plan),[plan]);
  const latest=segment?.bars.at(-1);
  const update=(k:keyof Plan,v:number)=>{setPlan(p=>({...p,[k]:v}));if(['entry','stop','target'].includes(k))setEntrySource('');setMessage('');};
  function choose(s:string){
    if(s!==symbol){
      const tracked=monitor.items.find(item=>item.symbol===s);
      setPlan(p=>tracked?{...tracked.plan}:{...p,symbol:s,entry:0,stop:0,target:0});
      setRules(tracked?{...tracked.rules}:{...DEFAULT_RULES});setEntrySource(tracked?.source||'');
    }
    setSymbol(s);setSymbolInput(s);setError('');setMessage('');
  }
  function toggleMonitoring(){
    if(selectedMonitor){monitor.stop(symbol);return;}
    try{monitor.start(plan,rules,entrySource);setError('');}catch(e){setError((e as Error).message);}
  }
  function updateMonitoring(){try{monitor.update(plan,rules,entrySource);setMessage(`${symbol} monitor restarted with the current plan. Other monitors were kept.`);setError('');}catch(e){setError((e as Error).message);}}
  useEffect(()=>{
    if(selectedMonitor?.plan.entry&&plan.entry<=0){setPlan({...selectedMonitor.plan});setRules({...selectedMonitor.rules});setEntrySource(selectedMonitor.source);}
  },[selectedMonitor?.plan]);
  function reviewSetup(row:ScanRow,scanRules:Rules){
    if(!row.entry?.levels)return;choose(row.symbol);
    setPlan(p=>({...p,symbol:row.symbol,...row.entry!.levels!}));setRules({...scanRules});
    setEntrySource(`${row.entry.fresh?'Observed':'Historical'} opening-range setup · ${when(row.entry.triggerAt!)} · range-low stop · 2R target before costs`);
    setTab('Trade plan');setMessage('Entry, stop-loss and take-profit levels applied automatically. Review the source time and test budget.');
  }
  function submitSymbol(e:React.FormEvent){
    e.preventDefault();const s=symbolInput.trim().toUpperCase();
    if(!/^[A-Z][A-Z0-9.-]{0,19}$/.test(s)){setError('Enter a valid PSX symbol.');return;}
    choose(s);
    if(monitor.items.length&&!monitor.items.some(item=>item.symbol===s)){
      monitor.start({...plan,symbol:s,entry:0,stop:0,target:0},{...DEFAULT_RULES});
      setMessage(`${s} added to monitoring. Existing stocks and their levels were kept.`);
    }
  }
  function persist(next:LabBook){try{const updated=mergeLabs(readLab(email),{...next,...(next.watchlist!==book.watchlist?{watchlistUpdatedAt:new Date().toISOString()}:{})});writeLab(email,updated);setBook(updated);void cloud.sync();return true;}catch{setError('This browser could not save the lab. Export your journal to keep a copy.');return false;}}
  function saveTicket(){
    if(sizing.errors.length||!daily||book.tickets.length>=100)return;
    let workflow;try{workflow=parseWorkflow({rules,risk});}catch(e){setError((e as Error).message);return;}
    const ticket:LabTicket={id:crypto.randomUUID(),createdAt:new Date().toISOString(),plan:{...plan},quantity:sizing.quantity,sourceDate:stats?.date||'',note:note.slice(0,1000),entrySource,workflow};
    if(persist({...book,tickets:[ticket,...book.tickets]})){setMessage('Test plan saved in the lab journal. No order was sent.');setNote('');}
  }
  function deleteTicket(ticket:LabTicket){
    if(persist(deleteLabTicket(book,ticket.id))){setDeletedPlan({email,ticket});setMessage('');setError('');}
  }
  function undoDelete(){
    if(!deletedPlan||deletedPlan.email!==email)return;
    if(persist(restoreLabTicket(book,deletedPlan.ticket,crypto.randomUUID()))){setDeletedPlan(null);setMessage('Test plan restored.');setError('');}
  }
  function exportJournal(){const blob=new Blob([JSON.stringify({version:1,type:'PSX Trading Lab research journal',...book},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='psx-trading-lab-journal.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function runReplay(){
    if(!intraday)return;setError('');
    try{setReplay(replayRules(intraday.bars,plan,rules));}catch(e){setError((e as Error).message);}
  }
  function runSimulation(){
    if(!intraday)return;setError('');setSimulating(true);const id=++analysisId.current;
    setTimeout(()=>{if(!mounted.current||id!==analysisId.current)return;try{setSimulation(simulateRules(intraday.bars,plan,rules));}catch(e){setError((e as Error).message);}finally{setSimulating(false);}},30);
  }
  const insiderRows=research?.insiders?.records.filter(r=>r.symbol===symbol).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12)||[];

  return <section className="trading-lab" aria-label="PSX Trading Lab">
    <header className="lab-header"><div><span className="lab-eyebrow"><Beaker size={14}/> TESTING SPACE</span><h1>PSX Trading Lab</h1><p>Scan a setup. Shape a plan. Test what could happen.</p></div><span className="lab-badge">Research & simulations</span></header>
    <div className="lab-notice"><ShieldCheck size={20}/><span>Independent lab · No orders are placed. Saved research plans use their own Google Drive file and do not change your portfolio or Practice Trading account.</span></div>
    <WorkspaceDriveStatus connected={driveConnected} onConnect={onConnectDrive} onSync={()=>void cloud.sync()} state={cloud.state} pending={cloud.pending}/>
    <LabGuide onChoose={setTab}/><LabCoverage email={email}/>
    <div className="lab-toolbar"><form onSubmit={submitSymbol}><label htmlFor="lab-symbol">PSX symbol</label><div><input id="lab-symbol" value={symbolInput} maxLength={20} onChange={e=>setSymbolInput(e.target.value)} placeholder="e.g. HBL"/><button type="submit" aria-label="Load stock"><Search size={17}/></button></div></form><div className="lab-feed"><strong>{symbol} <span>PKR {money(stats?.last.close??NaN)}</span></strong><small>{stats?`Daily close: ${stats.date} · ${daily?.source}`:loading?'Loading PSX candles…':'No completed daily candle available'}</small><small>{intraday?`${intraday.bars.length.toLocaleString()} intraday candles · ${intraday.source}`:intradayLoading?'Loading 5-minute history…':'Intraday history unavailable'}</small></div><button type="button" disabled={loading} onClick={()=>{setError('');setRefresh(x=>x+1);}}><RefreshCw size={16} className={loading?'lab-spin':''}/> Refresh</button></div>
    <LabMonitors items={monitor.items} onView={s=>{choose(s);setTab('Trade plan');}} onStop={monitor.stop} onStopAll={monitor.stopAll}/>
    {dataErrors.map(e=><p key={e} className="lab-warning" role="status">{e}</p>)}
    <nav className="lab-tabs" aria-label="Trading Lab sections">{tabs.map(t=><button key={t} type="button" aria-current={tab===t?'page':undefined} onClick={()=>{setTab(t);setError('');setMessage('');}}>{t}{t==='Lab journal'&&<span>{book.tickets.length}</span>}</button>)}</nav>
    {error&&<p className="lab-warning" role="alert">{error}</p>}{message&&<p className="lab-success" role="status">{message}</p>}
    {deletedPlan?.email===email&&<div className="lab-success lab-actions" role="status"><span>{deletedPlan.ticket.plan.symbol} test plan deleted.</span><button onClick={undoDelete}>Undo deletion</button></div>}

    <div hidden={tab!=='Scanner'}><LabScanner key={email} data={data} watchlist={watchlist} onWatchlist={setWatchlist} onSaveWatchlist={value=>persist({...book,watchlist:value})} onChoose={choose} onPlan={reviewSetup}/></div>
    {tab==='Scanner'&&<>
      <section className="lab-app-panel lab-stock-chart" aria-label={`${symbol} stock chart`}><React.Suspense fallback={<p role="status">Loading stock chart…</p>}><StockChart key={symbol} symbol={symbol}/></React.Suspense></section><article className="lab-panel"><h2>What the scan checks</h2><dl className="lab-definitions"><dt>Closing breakout</dt><dd>Latest close above the previous 20 closes.</dd><dt>Bull flag</dt><dd>More than 10% rise over the preceding run, followed by a five-close range below 5% of the latest price.</dd><dt>Oversold bounce</dt><dd>Prior RSI below 30 and the latest close higher than the previous close. RSI below 30 is also listed on its own.</dd><dt>Reclaimed average</dt><dd>Close crosses above its 20-day average.</dd><dt>RSI recovery</dt><dd>Wilder RSI 14 crosses back above 30.</dd><dt>Volume context</dt><dd>Latest session volume ÷ the previous 20-session average.</dd></dl><p>A match is a research candidate. Check liquidity, spread, disclosures and current price limits before making a trading decision.</p><button className="lab-primary" onClick={()=>setTab('Trade plan')}>Build a test plan</button></article>
    </>}

    {tab==='Trade plan'&&<>
      <details className="lab-advanced"><summary>Advanced entry & exit rules (optional)</summary><RulesPanel rules={rules} onChange={setRules} plan={plan} segment={segment} now={monitor.now} monitoring={!!selectedMonitor} onMonitor={toggleMonitoring} monitorStatus={selectedMonitor?.status||'This stock is not being monitored'} onLevels={(entry,stop,target,source)=>{setPlan(p=>({...p,entry,stop,target}));setEntrySource(source);setMessage('Testing levels applied. Review the budget and save the plan to retain these settings.');}}/></details>
      <div className="lab-two-col lab-plan-grid"><article className="lab-panel"><h2>Trade levels · {symbol}</h2><p>Default rules apply automatically: completed opening-range breakout, stop at the opening low, target at 2R before costs.</p>{plan.entry>0?<div className="lab-metrics"><div><small>Entry · PKR</small><strong>{money(plan.entry)}</strong></div><div><small>Stop-loss · PKR</small><strong>{money(plan.stop)}</strong></div><div><small>Take profit · PKR</small><strong>{money(plan.target)}</strong></div><div><small>Hypothetical capital · PKR</small><strong>{money(plan.capital)}</strong></div></div>:<p className="lab-warning">{intradayLoading?'Checking completed intraday candles…':'No confirmed setup available for this stock in the current / latest session. Scan another stock or start monitoring. Levels are not invented while waiting.'}</p>}{entrySource&&<p>{entrySource}</p>}<div className="lab-actions"><button onClick={toggleMonitoring} aria-describedby="lab-monitor-help">{selectedMonitor?`Stop monitoring ${symbol}`:`Monitor ${symbol}`}</button>{monitoredPlanChanged&&<button onClick={updateMonitoring}>Update {symbol} monitored plan</button>}</div><p id="lab-monitor-help" className="lab-monitor-help">Adds {symbol} with its own levels and rules. Searching for another stock adds it without replacing existing monitors. Edit a plan, then use Update monitored plan to apply it to that stock. Checks run every 30 seconds while this page is visible; notices use completed 5-minute candles. No orders, emails or push notifications are sent.</p><details className="lab-advanced"><summary>Edit prices, test budget & costs (optional)</summary><p>The default Rs. 100,000 is sample test capital, not your account balance. Change it if you want sizing for a different budget.</p><div className="lab-fields"><NumberField label="Entry" suffix="PKR" value={plan.entry} onChange={v=>update('entry',v)}/><NumberField label="Stop level" suffix="PKR" value={plan.stop} onChange={v=>update('stop',v)}/><NumberField label="Target level" suffix="PKR" value={plan.target} onChange={v=>update('target',v)}/><NumberField label="Test capital" suffix="PKR" value={plan.capital} onChange={v=>update('capital',v)}/><NumberField label="Risk per plan" suffix="%" value={plan.riskPct} onChange={v=>update('riskPct',v)}/><NumberField label="Position cap" suffix="%" value={plan.capPct} onChange={v=>update('capPct',v)}/><NumberField label="Fees each side" suffix="%" value={plan.feePct} onChange={v=>update('feePct',v)}/><NumberField label="Slippage each side" suffix="%" value={plan.slipPct} onChange={v=>update('slipPct',v)}/><NumberField label="Minimum reward/risk" value={plan.minRR} onChange={v=>update('minRR',v)}/><NumberField label="Lot size" value={plan.lot} step="1" onChange={v=>update('lot',v)}/></div><p>Fees are an editable all-in estimate, not your broker tariff. CGT is excluded. Verify current lot sizes, price bands and available cash separately.</p></details></article>
      <div className="lab-stack"><article className="lab-panel" hidden={plan.entry<=0}><div className="lab-panel-heading"><h2>Budget & risk check</h2><span className={'lab-badge '+(sizing.errors.length||sizing.warnings.length?'lab-caution':'')}>{sizing.errors.length?'Check inputs':sizing.warnings.length?'Research warning':'Arithmetic checks pass'}</span></div><div className="lab-metrics"><div><small>Whole shares</small><strong>{sizing.quantity.toLocaleString()}</strong></div><div><small>Estimated entry cost</small><strong>Rs. {money(sizing.cost)}</strong></div><div><small>Loss if stop fills as modeled</small><strong className="lab-down">Rs. {money(sizing.loss)}</strong></div><div><small>{sizing.reward<0?'Loss if target fills after costs':'Profit if target fills after costs'}</small><strong className={sizing.reward<0?'lab-down':'lab-up'}>Rs. {money(sizing.reward)}</strong></div><div><small>Reward / risk after costs</small><strong>{money(sizing.rr)}R</strong><small>R = profit at target ÷ loss at stop, after costs.</small></div></div>{[...sizing.errors,...sizing.warnings].map(e=><p key={e} className="lab-warning">{e}</p>)}{!!sizing.warnings.length&&!sizing.errors.length&&<p>You can save and replay this research plan with its warning.</p>}{entrySource&&<p className="lab-warning">{entrySource} · For historical testing.</p>}<p>{sizing.binding&&`Size limited by ${sizing.binding.toLowerCase()}. `}A gap, locked price limit or missing liquidity can cause a larger loss. These checks do not approve a live trade.</p><label className="lab-field"><span>Research note</span><textarea rows={2} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} placeholder="What would confirm or invalidate this setup?"/></label><button className="lab-primary" disabled={!!sizing.errors.length||!daily||book.tickets.length>=100} onClick={saveTicket}>{sizing.warnings.length?'Save test plan with warning':'Save test plan'}</button>{book.tickets.length>=100&&<p>100 plans saved. Export the journal to retain your work.</p>}</article>
      </div></div>
    </>}

    {tab==='Trade plan'&&<details className="lab-advanced"><summary>Advanced session risk limits (optional)</summary><RiskPanel plan={plan} risk={risk} onChange={setRisk} rules={rules}/></details>}

    {tab==='Replay'&&<>{!intraday&&<p className={intradayLoading?'lab-notice':'lab-warning'} role="status">{intradayLoading?'Loading real 5-minute history… Replay will unlock as soon as it arrives.':'Replay needs intraday candles. Use Refresh above to retry the feed.'}</p>}<div className="lab-two-col"><article className="lab-panel"><span className="lab-eyebrow">HISTORICAL TEST</span><h2>Replay your entry & exit rules</h2><p>Uses the Trade plan rules: {rules.entryMode==='range'?'opening-range breakout':'custom price level'}, volume {rules.volumeX}×, {rules.entryMinutes}-minute entry window, {rules.stopMode} stop, {rules.targetR}R target and exit {rules.flatMinutes} minutes before the session ends. Manual stops and custom levels reuse the same absolute price on every historical day.</p><button onClick={()=>setTab('Trade plan')}>Edit replay rules</button><button className="lab-primary" disabled={!intraday} onClick={runReplay}>{intradayLoading?'Loading intraday history…':'Replay available history'}</button>{replay&&<><div className="lab-metrics"><div><small>Complete sessions</small><strong>{replay.sessions}</strong></div><div><small>Triggered tests</small><strong>{replay.trades.length}</strong></div><div><small>Average after-cost R</small><strong>{replay.averageR==null?'—':money(replay.averageR)}</strong></div><div><small>Incomplete / excluded</small><strong>{replay.excluded}</strong></div></div><p>Current plan fees ({plan.feePct}%) and slippage ({plan.slipPct}%) apply on each side. {replay.skipped} triggers skipped because the selected stop lacked sufficient history/valid levels or left no exit candle. Friday sessions stay separate.</p></>}</article>
      <article className="lab-panel"><span className="lab-eyebrow">TIME MACHINE</span><h2>Resample 10,000 paths</h2><p>Resample your current plan using only earlier comparable sessions. Select the entry candle, time window and sample threshold below. The flat-by rule comes from Trade plan.</p><ScenarioControls rules={rules} onChange={setRules} segment={segment}/><button disabled={!intraday||!!sizing.errors.length||simulating} onClick={runSimulation} className="lab-primary">{intradayLoading?'Loading intraday history…':simulating?'Resampling…':'Run test scenario'}</button>{!!sizing.errors.length&&<p>Complete the Trade plan checks to enable this test.</p>}{simulation&&<><div className="lab-metrics"><div><small>Target first</small><strong className="lab-up">{(simulation.counts.target/simulation.replays*100).toFixed(1)}%</strong></div><div><small>Stop first</small><strong className="lab-down">{(simulation.counts.stop/simulation.replays*100).toFixed(1)}%</strong></div><div><small>Neither before close</small><strong>{(simulation.counts.close/simulation.replays*100).toFixed(1)}%</strong></div><div><small>Average after-cost R</small><strong>{money(simulation.meanR)}</strong></div></div><p>{simulation.sessions} earlier {simulation.family} sessions, before {simulation.before}. {simulation.barsPerPath} candles per path. Seed {simulation.seed}. 5th–95th percentile: {money(simulation.p5)}R to {money(simulation.p95)}R.</p>{simulation.sessions<20&&<p className="lab-warning">Small sample: fewer than the upstream default of 20 sessions. Treat this as an exploratory scenario.</p>}<ScenarioCharts result={simulation}/></>}</article></div>
      <p className="lab-notice">R uses the entry-to-stop price distance; costs can turn a target hit into a net loss. Historical frequency is not a future win probability. Gaps can fill beyond the stop; if both levels occur in one candle, the stop wins. Missing sessions are excluded. Resampling does not model news shocks, circuit locks, queue priority or changing market conditions.</p>
      {replay&&<div className="lab-panel lab-table-wrap"><h2>Historical outcomes</h2>{!replay.trades.length?<p>No test entries found in the complete sessions available.</p>:<table><thead><tr><th>Session</th><th>Entry</th><th>Stop</th><th>Target</th><th>Outcome</th><th>After-cost R</th></tr></thead><tbody>{replay.trades.map((r,i)=><tr key={i}><td>{r.day}<small>{r.session}</small></td><td>{money(r.entry)}</td><td>{money(r.stop)}</td><td>{money(r.target)}</td><td>{r.outcome==='close'?'Session close':r.outcome}</td><td className={r.netR>=0?'lab-up':'lab-down'}>{money(r.netR)}</td></tr>)}</tbody></table>}</div>}
    </>}

    {tab==='Research'&&<>{researchLoading&&<p role="status">Loading news, company information and disclosed transactions…</p>}{research?.errors.map(e=><p key={e} className="lab-warning">{e}</p>)}<div className="lab-two-col"><article className="lab-panel"><h2>{symbol} · Company research</h2><p>{research?.company?.businessDescription||(researchLoading?'Loading company profile…':'Company description unavailable in the current feed.')}</p>{research?.company?.fundamentals?.map(g=><div key={g.category}><h3>{g.category}</h3><dl className="lab-facts">{g.items.map((item,i)=><React.Fragment key={i}><dt>{item.label}</dt><dd>{item.value}</dd></React.Fragment>)}</dl></div>)}<small>Source: PSX company profile. Financial statements and announcements are shown below.</small></article><article className="lab-panel"><h2>{symbol} · Insider disclosures</h2><p>Public director and sponsor filings replace the original US congressional-trades module.</p>{research?.insiders&&<p>Report as of {research.insiders.asOf} · {research.insiders.coverage}</p>}{insiderRows.length?insiderRows.map(r=><div className="lab-news" key={r.id}><strong>{r.person} · {r.action}</strong><small>{r.date} · {r.shares.toLocaleString()} shares · {r.value==null?'Value not provided':'Rs. '+money(r.value)}</small><External url={r.sourceUrl}>Source filing</External></div>):<p>No {symbol} records in the available report. This is not evidence of no insider activity.</p>}<p>Disclosures can arrive late and include transfers or restructurings. They are not necessarily open-market purchases.</p></article></div><LabFinancials key={`${symbol}:${refresh}`} symbol={symbol}/><section className="lab-app-panel lab-announcements" aria-label={`${symbol} announcements`}><h2 className="text-lg font-bold mb-3">{symbol} · Company announcements</h2><StockAnnouncements key={`${symbol}:${refresh}`} ticker={symbol}/></section><LabNews key={`${symbol}:${refresh}`} symbol={symbol} research={research} loading={researchLoading} data={data}/></>}

    {tab==='Lab journal'&&<article className="lab-panel"><div className="lab-panel-heading"><div><h2>Saved test plans</h2><p>Saved plans sync to your separate Drive file when connected. Deletions sync too; Undo restores the last deleted plan while this page stays open. Check the save status above before switching devices; Export journal also keeps a downloadable copy.</p></div><button onClick={exportJournal}><Download size={16}/> Export journal</button></div>{!book.tickets.length?<div className="lab-empty"><h3>Your testing journal starts here</h3><p>Build a plan and save it to compare your reasoning later.</p><button className="lab-primary" onClick={()=>setTab('Trade plan')}>Create a test plan</button></div>:<div className="lab-journal">{book.tickets.map(t=>{const last=t.plan.symbol===symbol?latest:null;const status=last?(last.close<=t.plan.stop?'Last observed close below stop':last.close>=t.plan.target?'Last observed close above target':'Last observed close between levels'):'Select this symbol to check latest available close';return <article key={t.id}><div className="lab-panel-heading"><button className="lab-link" onClick={()=>choose(t.plan.symbol)}>{t.plan.symbol}</button><small>{when(t.createdAt)}</small></div><strong>{t.quantity.toLocaleString()} shares · Entry {money(t.plan.entry)}</strong><p>Stop {money(t.plan.stop)} · Target {money(t.plan.target)} · Source day {t.sourceDate}</p><p>{t.note||'No research note.'}</p><button onClick={()=>{choose(t.plan.symbol);setPlan({...t.plan});setNote(t.note);setEntrySource(t.entrySource||'');setRules(t.workflow?{...t.workflow.rules}:{...DEFAULT_RULES});setRisk(t.workflow?{...t.workflow.risk}:{...DEFAULT_RISK});setTab('Trade plan');setMessage(t.workflow?'Saved plan and rule/risk settings loaded. Recheck dates and hypothetical balances.':'Older plan loaded. Review the default rule and risk settings before testing.');}}>Load saved plan & settings</button><button className="lab-delete-plan" aria-label={`Delete ${t.plan.symbol} test plan from ${when(t.createdAt)}`} onClick={()=>deleteTicket(t)}>Delete plan</button>{t.entrySource&&<p>{t.entrySource}</p>}{sizePlan(t.plan).warnings.map(w=><p className="lab-warning" key={w}>{w}</p>)}<div className="lab-journal-status">{status}{last&&<small>{when(last.time+300000)} · This check does not prove which level was reached first.</small>}</div></article>;})}</div>}<p>Load a saved plan to restore its levels, note and rule/risk settings. Start monitoring in Trade plan for in-page notices on new candles. No background alerts, simulated fills or broker orders are submitted.</p></article>}

    <footer className="lab-footer"><span>Adapted from <External url="https://github.com/Jakeschincariol/day-trader-skill">Jake Schincariol’s Day Trader skills</External> · <a href="/licenses/day-trader-skill.txt" target="_blank" rel="noopener noreferrer">MIT license</a></span><span><External url="https://www.psx.com.pk/psx/exchange/general/trading-hours">PSX hours</External> · <External url="https://www.nccpl.com.pk/transition-to-t1-settlement-cycle">Settlement rules</External></span></footer>
  </section>;
}
