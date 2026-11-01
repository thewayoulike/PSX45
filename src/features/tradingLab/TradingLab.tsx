import React,{useEffect,useMemo,useRef,useState} from 'react';
import {StockAnnouncements} from '../../components/StockAnnouncements';
const StockChart=React.lazy(()=>import('../../components/StockChart').then(module=>({default:module.StockChart})));
import {LabGuide} from './LabGuide';
import {LabScanner} from './LabScanner';
import {ScanExplainer} from './ScanExplainer';
import {LabFinancials} from './LabFinancials';
import {RulesPanel,RiskPanel,ScenarioControls,ScenarioCharts} from './LabWorkflow';
import {intradayScan,type ScanRow,type ScanKind} from './scanner';
import {DEFAULT_RULES,DEFAULT_RISK,replayRules,simulateRules,MIN_SESSIONS_FOR_PERCENT,type Rules,type RiskContext} from './workflow';
import {useLabMonitor} from './useLabMonitor';
import {LabMonitors} from './LabMonitors';
import {LabNews} from './LabNews';
import {TargetSummary} from './TargetSummary';
import {targetSummary,type TargetReview} from './targets';
import {ArrowUpRight,Beaker,Download,RefreshCw,Search,ShieldAlert} from 'lucide-react';
import {useFreemium} from '../../components/FreemiumContext';
import {consumeDailyQuota} from '../../utils/freemiumQuotas';
import type {PracticeOrderDraft} from '../../components/PracticeTrading';
import type {ScanScope} from './LabScanner';
import {DEFAULT_PLAN,dailyScan,intradaySegments,sizePlan,standardSessions,pktDay,detectHalt,type Plan} from './engine';
import {visibleInterval} from '../../utils/visibleInterval';
import {eventsNear,eventOnDay,relativeDay,type StockEvent} from './events';
import {labData,safeUrl,type CandleSet,type LabData,type Research} from './data';
import {readLab,writeLab,mergeLabs,deleteLabTicket,restoreLabTicket,readLabRaw,isLabDamaged,labKey,LAB_CHANGED,type LabBook,type LabTicket} from './storage';
import {useLabDrive} from './useLabDrive';
import {WorkspaceDriveStatus} from '../../components/WorkspaceDriveStatus';
import './trading-lab.css';

const money=(n:number)=>Number.isFinite(n)?n.toLocaleString('en-PK',{maximumFractionDigits:2,minimumFractionDigits:2}):'—';
const pct=(n:number|null|undefined)=>n==null||!Number.isFinite(n)?'—':`${n>=0?'+':''}${n.toFixed(2)}%`;
const when=(s:string|number)=>{const d=new Date(s);return Number.isNaN(d.getTime())?'Unavailable':d.toLocaleString('en-GB',{timeZone:'Asia/Karachi',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})+' PKT';};
const tabs=['Scanner','Research','Trade plan','Replay','Saved plans'] as const;
const ACK_KEY='psx-lab-ack:v1';
const readAck=()=>{try{return localStorage.getItem(ACK_KEY)==='1';}catch{return false;}};
const csvCell=(v:unknown)=>{const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
/** Shown on every visit: the Lab is for practice, not advice. */
export const LAB_DISCLAIMER='Educational simulation only. This is not investment advice or a recommendation to buy or sell any security. Intraday trading is high risk and you can lose money. No orders are placed.';
type Tab=typeof tabs[number];
function External({url,children}:{url:string;children:React.ReactNode}){const href=safeUrl(url);return href?<a href={href} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={13}/></a>:<span>{children}</span>;}
function NumberField({label,value,onChange,step='any',suffix=''}:{label:string;value:number;onChange:(v:number)=>void;step?:string;suffix?:string}){return <label className="lab-field"><span>{label}{suffix&&<small>{suffix}</small>}</span><input type="number" step={step} value={Number.isFinite(value)?value:''} onChange={e=>onChange(e.target.value===''?NaN:Number(e.target.value))}/></label>;}

export function TradingLab({email,altEmail,data=labData,driveConnected=false,onConnectDrive,holdings,holdingsLabel,watchlist:appWatchlist,onOpenWatchlist,onOpenInsiders,onPractise}:{email:string;altEmail?:string;data?:LabData;driveConnected?:boolean;onConnectDrive?:()=>void;holdings?:string[];holdingsLabel?:string;watchlist?:string[];onOpenWatchlist?:()=>void;onOpenInsiders?:()=>void;onPractise?:(order:PracticeOrderDraft)=>void}){
  const {isFree,quotas,requestUpgrade}=useFreemium();
  const [acknowledged,setAcknowledged]=useState(readAck);
  // Plans saved under a different Google account than the sign-in account stay visible: merge them once.
  useState(()=>{try{if(altEmail&&email&&altEmail.toLowerCase()!==email.toLowerCase()){const other=readLab(altEmail);if(other.tickets.length&&!isLabDamaged(altEmail)&&!isLabDamaged(email))writeLab(email,mergeLabs(readLab(email),other));}}catch{/* Both copies are kept unchanged. */}return null;});
  const cloud=useLabDrive(email,driveConnected);
  const [tab,setTab]=useState<Tab>('Scanner'),[book,setBook]=useState<LabBook>(()=>readLab(email)),[damaged]=useState(()=>isLabDamaged(email));
  const [scanKind,setScanKind]=useState<ScanKind>('intraday');
  const [symbol,setSymbol]=useState('HBL'),[symbolInput,setSymbolInput]=useState('HBL'),[refresh,setRefresh]=useState(0);
  const [daily,setDaily]=useState<CandleSet|null>(null),[intraday,setIntraday]=useState<CandleSet|null>(null),[loading,setLoading]=useState(false),[intradayLoading,setIntradayLoading]=useState(false),[dataErrors,setDataErrors]=useState<string[]>([]);
  const [plan,setPlan]=useState<Plan>({...DEFAULT_PLAN}),[entrySource,setEntrySource]=useState(''),[note,setNote]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState('');
  const [research,setResearch]=useState<Research|null>(null),[researchLoading,setResearchLoading]=useState(false);
  const [replay,setReplay]=useState<ReturnType<typeof replayRules>|null>(null),[simulation,setSimulation]=useState<ReturnType<typeof simulateRules>|null>(null),[simulating,setSimulating]=useState(false);
  const [rules,setRules]=useState<Rules>({...DEFAULT_RULES}),[risk,setRisk]=useState<RiskContext>({...DEFAULT_RISK});
  const [targetReview,setTargetReview]=useState<TargetReview|null>(null);
  const [deletedPlan,setDeletedPlan]=useState<{email:string;ticket:LabTicket}|null>(null);
  const monitorLimit=Number.isFinite(quotas.labMonitors)?quotas.labMonitors:5;
  const monitor=useLabMonitor(data,symbol,setIntraday,monitorLimit);
  function canScan(scope:ScanScope){
    const limit=Number.isFinite(quotas.labScansPerDay)?quotas.labScansPerDay:15;
    if(consumeDailyQuota('labScans',limit).ok)return true;
    if(isFree)requestUpgrade();
    setError(`You have used today’s ${limit} ${scope==='market'?'market':'list'} scans on your plan. Watchlist scans are still available, and the limit resets tomorrow.`);
    return false;
  }
  const selectedMonitor=monitor.items.find(item=>item.symbol===symbol);
  const monitoredPlanChanged=!!selectedMonitor&&(JSON.stringify(selectedMonitor.plan)!==JSON.stringify(plan)||JSON.stringify(selectedMonitor.rules)!==JSON.stringify(rules));
  const bookRef=useRef(book);bookRef.current=book;
  useEffect(()=>{
    const reload=()=>{const next=readLab(email);bookRef.current=next;setBook(next);};
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
  // Levels are never filled in just because a stock was opened. The person chooses to test a setup.
  const latestSetup=useMemo(()=>intraday&&intraday.symbol===symbol?intradayScan(intraday.bars,DEFAULT_RULES,Date.now(),intraday.targetContext):null,[intraday,symbol]);
  function useLatestSetup(){
    if(!latestSetup?.levels)return;
    setTargetReview(latestSetup.targetReview);setPlan(p=>({...p,...latestSetup.levels!}));setRules({...DEFAULT_RULES,entryIndex:latestSetup.check?.index??2});
    setEntrySource(`${latestSetup.fresh?'Observed':'Historical'} opening-range setup · ${when(latestSetup.triggerAt!)} · range-low stop · ${latestSetup.targetReview?targetSummary(latestSetup.targetReview):'Exit checks unavailable'}`);
    setMessage('Practice levels applied from the latest confirmed setup. Check its time: an earlier breakout is not a current opportunity.');
  }
  // Price-moving events for the selected stock, loaded when planning or replaying.
  const [events,setEvents]=useState<{symbol:string;items:StockEvent[]}|null>(null);
  useEffect(()=>{
    if(!data.events||(tab!=='Trade plan'&&tab!=='Replay')||events?.symbol===symbol)return;
    let active=true;data.events(symbol).then(items=>{if(active)setEvents({symbol,items});}).catch(()=>{if(active)setEvents({symbol,items:[]});});
    return()=>{active=false;};
  },[tab,symbol,data,events?.symbol]);
  const stockEvents=events?.symbol===symbol?events.items:[];
  // Session status: closed days, missing trades during hours, and the KSE-30 market-wide halt.
  const [halt,setHalt]=useState<ReturnType<typeof detectHalt>>(null),[clockNow,setClockNow]=useState(Date.now());
  useEffect(()=>{
    if(!data.haltIndex)return;
    let active=true;
    const check=()=>{setClockNow(Date.now());const today=standardSessions(pktDay(Date.now()));if(!today.length)return;data.haltIndex!().then(bars=>{if(active)setHalt(detectHalt(bars));}).catch(()=>{/* The check is advisory; candles still show their own times. */});};
    check();const stop=visibleInterval(check,300000);return()=>{active=false;stop();};
  },[data]);
  const todaySessions=standardSessions(pktDay(clockNow)),inSession=todaySessions.find(s=>clockNow>=s.start&&clockNow<s.end);
  const lastCandleEnd=intraday?.bars.at(-1)?(intraday.bars.at(-1)!.time+300000):null;
  const sessionNotice=!todaySessions.length?'PSX is closed today (weekend or holiday). Results use the latest completed session.'
    :halt?`Market-wide halt: the KSE-30 moved 5% ${halt.direction} from the previous close; PSX pauses all trading for this, then reopens after a 5-minute pre-open. Detected ${when(halt.at)}.`
    :inSession&&clockNow-inSession.start>20*60000&&lastCandleEnd!=null&&clockNow-lastCandleEnd>20*60000?'No new trades in the last 20 minutes during market hours. PSX may be closed for a holiday not in the calendar, trading may be halted, or the stock may not be trading.'
    :null;
  const sizing=useMemo(()=>sizePlan(plan,{worstExit:targetReview?.band?.lower,band:targetReview?.band}),[plan,targetReview]);
  const skipReason=sizing.skipReason||(targetReview?.target===null?`Skip — ${targetReview.reason}`:null);
  const latest=segment?.bars.at(-1);
  const update=(k:keyof Plan,v:number)=>{setPlan(p=>({...p,[k]:v}));if(['entry','stop','target'].includes(k)){setEntrySource('Manually edited levels — reapply exit rules to check the target.');setTargetReview(null);}setMessage('');};
  function choose(s:string){
    if(s!==symbol){
      const tracked=monitor.items.find(item=>item.symbol===s);
      setTargetReview(tracked?.targetReview??null);
      setPlan(p=>tracked?{...tracked.plan}:{...p,symbol:s,entry:0,stop:0,target:0});
      setRules(tracked?{...tracked.rules}:{...DEFAULT_RULES});setEntrySource(tracked?.source||'');
    }
    setSymbol(s);setSymbolInput(s);setError('');setMessage('');
  }
  function toggleMonitoring(){
    if(selectedMonitor){monitor.stop(symbol);return;}
    try{monitor.start(plan,rules,entrySource,targetReview??undefined);setError('');}catch(e){setError((e as Error).message);}
  }
  function updateMonitoring(){try{monitor.update(plan,rules,entrySource,targetReview??undefined);setMessage(`${symbol} monitor restarted with the current plan. Other monitors were kept.`);setError('');}catch(e){setError((e as Error).message);}}
  useEffect(()=>{
    if(selectedMonitor?.plan.entry&&plan.entry<=0){setPlan({...selectedMonitor.plan});setRules({...selectedMonitor.rules});setEntrySource(selectedMonitor.source);setTargetReview(selectedMonitor.targetReview??null);}
  },[selectedMonitor?.plan]);
  function reviewSetup(row:ScanRow,scanRules:Rules){
    if(!row.entry?.levels)return;choose(row.symbol);
    setPlan(p=>({...p,symbol:row.symbol,...row.entry!.levels!,feePct:plan.feePct,slipPct:plan.slipPct}));setRules({...scanRules,entryIndex:row.entry.check?.index??2});setTargetReview(row.entry.targetReview);
    setEntrySource(`${row.entry.fresh?'Observed':'Historical'} opening-range setup · ${when(row.entry.triggerAt!)} · range-low stop · ${row.entry.targetReview?targetSummary(row.entry.targetReview):'Target checks unavailable'}`);
    setTab('Trade plan');setMessage(sizePlan({...plan,symbol:row.symbol,...row.entry!.levels!}).skipReason?'Skipped setup opened for study. Review the reason below.':'Setup opened for practice. Check when it was confirmed and adjust the sample budget if you like.');
  }
  function submitSymbol(e:React.FormEvent){
    e.preventDefault();const s=symbolInput.trim().toUpperCase();
    if(!/^[A-Z][A-Z0-9.-]{0,11}$/.test(s)){setError('Enter a valid PSX symbol.');return;}
    choose(s);
    if(monitor.items.length&&!monitor.items.some(item=>item.symbol===s)){
      monitor.start({...plan,symbol:s,entry:0,stop:0,target:0},{...DEFAULT_RULES});
      setMessage(`${s} added to monitoring. Existing stocks and their levels were kept.`);
    }
  }
  function persist(next:LabBook){try{const updated=mergeLabs(readLab(email),next);writeLab(email,updated);setBook(updated);void cloud.sync();return true;}catch{setError('This browser could not update your saved plans. Download them to keep a copy.');return false;}}
  /** Practice Trading keeps one record of practice trades; the Lab hands it a pre-filled limit order. */
  function practise(){
    if(sizing.errors.length||!onPractise)return;
    onPractise({id:crypto.randomUUID(),symbol:plan.symbol,quantity:sizing.quantity,price:plan.entry,
      note:`From your Trading Lab plan: buy ${sizing.quantity.toLocaleString()} ${plan.symbol} at Rs. ${money(plan.entry)}. Practice Trading does not hold stop or exit orders, so watch your test stop (Rs. ${money(plan.stop)}) and test exit (Rs. ${money(plan.target)}) yourself.${note?` Note: ${note.slice(0,200)}`:''}`});
  }
  function deleteTicket(ticket:LabTicket){
    if(persist(deleteLabTicket(book,ticket.id))){setDeletedPlan({email,ticket});setMessage('');setError('');}
  }
  function undoDelete(){
    if(!deletedPlan||deletedPlan.email!==email)return;
    if(persist(restoreLabTicket(book,deletedPlan.ticket,crypto.randomUUID()))){setDeletedPlan(null);setMessage('Test plan restored.');setError('');}
  }
  function download(name:string,body:string,type:string){const blob=new Blob([body],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  /** CSV opens in Excel or Google Sheets on a phone, unlike a JSON file. */
  function exportJournal(){
    const head=['Saved','Symbol','Shares','Entry','Test stop','Test exit','Source day','Note'];
    const rows=book.tickets.map(t=>[t.createdAt,t.plan.symbol,t.quantity,t.plan.entry,t.plan.stop,t.plan.target,t.sourceDate,t.note]);
    download('psx-trading-lab-plans.csv',[head,...rows].map(r=>r.map(csvCell).join(',')).join('\n'),'text/csv');
  }
  function downloadDamaged(){const raw=readLabRaw(email);if(raw)download('psx-trading-lab-damaged-copy.json',raw,'application/json');}
  function runReplay(){
    if(!intraday)return;setError('');
    try{setReplay(replayRules(intraday.bars,plan,rules,Date.now(),intraday.targetContext));}catch(e){setError((e as Error).message);}
  }
  function runSimulation(){
    if(!intraday)return;setError('');setSimulating(true);const id=++analysisId.current;
    setTimeout(()=>{if(!mounted.current||id!==analysisId.current)return;try{setSimulation(simulateRules(intraday.bars,plan,rules));}catch(e){setError((e as Error).message);}finally{setSimulating(false);}},30);
  }
  const insiderRows=research?.insiders?.records.filter(r=>r.symbol===symbol).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12)||[];

  const visibleTabs=tabs.filter(t=>t!=='Saved plans'||book.tickets.length>0||damaged);
  const header=<header className="lab-header"><div><span className="lab-eyebrow"><Beaker size={14}/> PRACTICE SPACE</span><h1>PSX Trading Lab</h1><p>Practise intraday trading rules on PSX stocks with sample money: find a morning breakout, plan where you would get out, and see how the same rules did before.</p></div><span className="lab-badge">Education only</span></header>;
  const notice=<div className="lab-notice lab-disclaimer" role="note"><ShieldAlert size={20}/><span>{LAB_DISCLAIMER}</span></div>;
  if(!acknowledged)return <section className="trading-lab" aria-label="PSX Trading Lab">{header}
    <article className="lab-panel lab-ack"><h2>Before you start</h2><p>{LAB_DISCLAIMER}</p><ul><li>Scans count rule checks on past prices. A match is something to study, not a signal to trade.</li><li>Levels, costs and results are estimates. Real fills, fees and taxes differ.</li><li>Past results do not predict future results.</li></ul><button className="lab-primary" onClick={()=>{try{localStorage.setItem(ACK_KEY,'1');}catch{/* Asked again next visit. */}setAcknowledged(true);}}>I understand, open the Lab</button></article>
  </section>;

  return <section className="trading-lab" aria-label="PSX Trading Lab">
    {header}{notice}
    {(book.tickets.length>0||damaged)&&<WorkspaceDriveStatus connected={driveConnected} onConnect={onConnectDrive} onSync={()=>void cloud.sync()} state={cloud.state} pending={cloud.pending}/>}
    <LabGuide onChoose={setTab}/>
    <div className="lab-toolbar"><form onSubmit={submitSymbol}><label htmlFor="lab-symbol">PSX symbol</label><div><input id="lab-symbol" value={symbolInput} maxLength={12} onChange={e=>setSymbolInput(e.target.value)} placeholder="e.g. HBL"/><button type="submit" aria-label="Open stock"><Search size={17}/></button></div></form><div className="lab-feed"><strong>{symbol} <span>PKR {money(stats?.last.close??NaN)}</span></strong><small>{stats?`Daily close: ${stats.date} · ${daily?.source}`:loading?'Loading PSX candles…':'No completed daily candle available'}</small><small>{intraday?`${intraday.bars.length.toLocaleString()} intraday candles · ${intraday.source}`:intradayLoading?'Loading 5-minute history…':'Intraday history unavailable'}</small></div><button type="button" disabled={loading} onClick={()=>{setError('');setRefresh(x=>x+1);}}><RefreshCw size={16} className={loading?'lab-spin':''}/> Refresh</button></div>
    <LabMonitors items={monitor.items} onView={s=>{choose(s);setTab('Trade plan');}} onStop={monitor.stop} onStopAll={monitor.stopAll}/>
    {sessionNotice&&<p className="lab-warning" role="status">{sessionNotice}</p>}
    {dataErrors.map(e=><p key={e} className="lab-warning" role="status">{e}</p>)}
    <div className="lab-tabs" role="tablist" aria-label="Trading Lab sections">{visibleTabs.map(t=><button key={t} type="button" role="tab" id={`lab-tab-${t}`} aria-selected={tab===t} onClick={()=>{setTab(t);setError('');setMessage('');}}>{t}{t==='Saved plans'&&<span>{book.tickets.length}</span>}</button>)}</div>
    {error&&<p className="lab-warning" role="alert">{error}</p>}{message&&<p className="lab-success" role="status">{message}</p>}
    {deletedPlan?.email===email&&<div className="lab-success lab-actions" role="status"><span>{deletedPlan.ticket.plan.symbol} test plan deleted.</span><button onClick={undoDelete}>Undo deletion</button></div>}

    <div hidden={tab!=='Scanner'}><LabScanner key={email} data={data} onKind={setScanKind} costs={plan} onCosts={costs=>setPlan(p=>({...p,...costs}))} holdings={holdings} holdingsLabel={holdingsLabel} watchlist={appWatchlist} onOpenWatchlist={onOpenWatchlist} canScan={canScan} onChoose={choose} onPlan={reviewSetup}/></div>
    {tab==='Scanner'&&<>
      <section className="lab-app-panel lab-stock-chart" aria-label={`${symbol} stock chart`}><React.Suspense fallback={<p role="status">Loading stock chart…</p>}><StockChart key={symbol} symbol={symbol}/></React.Suspense></section><ScanExplainer kind={scanKind} onPlan={()=>setTab('Trade plan')}/>
    </>}

    {tab==='Trade plan'&&<>
      <details className="lab-advanced"><summary>Advanced entry & exit rules (optional)</summary><RulesPanel rules={rules} onChange={setRules} plan={plan} targetContext={{...intraday?.targetContext,intraday:intraday?.bars}} segment={segment} now={monitor.now} monitoring={!!selectedMonitor} onMonitor={toggleMonitoring} monitorStatus={selectedMonitor?.status||'This stock is not being monitored'} onLevels={(entry,stop,target,source,review)=>{setTargetReview(review);setPlan(p=>({...p,entry,stop,target}));setEntrySource(source);setMessage('Testing levels applied. Review the budget and save the plan to retain these settings.');}}/></details>
      {skipReason&&<div className="lab-skip-notice" role="status"><strong>{skipReason}</strong><p>{sizing.skipReason?'Even if the target is reached, estimated fees and slippage leave no positive profit. Skip this setup under the current cost assumptions. You can save it as a skipped research example.':'The available price constraints leave no usable target above entry. A breakout alone does not qualify this setup.'}</p></div>}<div className="lab-two-col lab-plan-grid"><article className="lab-panel"><h2>Practice levels · {symbol}</h2><p>The default rules: a completed close above the first 15 minutes’ high, a test stop at that period’s low, and a test exit capped by nearby resistance, typical daily movement and the daily price limit. R means the reward measured in units of the risk to your stop.</p>{plan.entry>0?<div className="lab-metrics"><div><small>Entry · PKR</small><strong>{money(plan.entry)}</strong></div><div><small>Test stop · PKR</small><strong>{money(plan.stop)}</strong></div><div><small>{sizing.skipReason?'Test exit · PKR (skipped)':'Test exit · PKR'}</small><strong>{money(plan.target)}</strong></div><div><small>Sample capital · PKR</small><strong>{money(plan.capital)}</strong></div></div>:<div className="lab-empty">{intradayLoading?<p>Checking completed 5-minute candles…</p>:latestSetup?.levels?<><p>{symbol} had a confirmed setup at {when(latestSetup.triggerAt!)}{latestSetup.fresh?'':' (an earlier session)'}. Levels are not filled in until you choose to test it.</p><button className="lab-primary" onClick={useLatestSetup}>Test this setup</button></>:<p>No confirmed setup for {symbol} in the latest session. Scan for another stock, or watch this one while the page is open. Levels are never invented.</p>}</div>}{targetReview&&<TargetSummary review={targetReview}/>}{(()=>{const today=pktDay(clockNow),near=eventsNear(stockEvents,today);const soon=near.find(e=>e.day>=today&&relativeDay(today,e.day).match(/today|tomorrow/));return <details className="lab-advanced" open={!!soon}><summary>Events near {symbol} {events?.symbol!==symbol?'· checking…':near.length?`· ${near.length}`:'· none found'}</summary>{soon&&<p className="lab-warning">{soon.label} {relativeDay(today,soon.day)}. Prices can jump on these days, so a breakout may be news rather than a pattern.</p>}{near.length?<ul>{near.map(e=><li key={e.day+e.kind}>{e.day} ({relativeDay(today,e.day)}): {e.label}</li>)}</ul>:<p>No results, board meetings, dividends or ex-dates found in the last 3 or next 10 days. Sources can miss events.</p>}</details>;})()}<details className="lab-advanced"><summary>Plan source</summary><p>{entrySource||'No source saved.'}</p></details>{plan.entry>0&&!targetReview&&<p className="lab-warning">Saved or manual levels are unchanged. Reapply exit rules to check their target against the available market data.</p>}<div className="lab-actions"><button onClick={toggleMonitoring} aria-describedby="lab-monitor-help">{selectedMonitor?`Stop watching ${symbol}`:`Watch ${symbol} while this page is open`}</button>{monitoredPlanChanged&&<button onClick={updateMonitoring}>Update {symbol} watched plan</button>}</div><p id="lab-monitor-help" className="lab-monitor-help">Checks each new 5-minute candle only while this page is open on screen. It stops when you leave, lock your phone or reload. For alerts that keep working, use Price Alerts. Your plan allows {monitorLimit} watched {monitorLimit===1?'stock':'stocks'} at once.</p><details className="lab-advanced"><summary>Edit prices, sample budget & costs (optional)</summary><p>The default Rs. 100,000 is sample capital, not your account balance.</p><div className="lab-fields"><NumberField label="Entry" suffix="PKR" value={plan.entry} onChange={v=>update('entry',v)}/><NumberField label="Stop level" suffix="PKR" value={plan.stop} onChange={v=>update('stop',v)}/><NumberField label="Target level" suffix="PKR" value={plan.target} onChange={v=>update('target',v)}/><NumberField label="Test capital" suffix="PKR" value={plan.capital} onChange={v=>update('capital',v)}/><NumberField label="Risk per plan" suffix="%" value={plan.riskPct} onChange={v=>update('riskPct',v)}/><NumberField label="Position cap" suffix="%" value={plan.capPct} onChange={v=>update('capPct',v)}/><NumberField label="Commission rate each side" suffix="%" value={plan.feePct} onChange={v=>update('feePct',v)}/><NumberField label="Slippage each side" suffix="%" value={plan.slipPct} onChange={v=>update('slipPct',v)}/><NumberField label="Minimum reward/risk" value={plan.minRR} onChange={v=>update('minRR',v)}/><NumberField label="Lot size" value={plan.lot} step="1" onChange={v=>update('lot',v)}/></div><label className="lab-check"><input type="checkbox" checked={!!plan.oneSideCommission} onChange={e=>setPlan(p=>({...p,oneSideCommission:e.target.checked}))}/> My broker charges commission on one side only for same-day trades</label><p>Each side pays commission of Rs. 0.03 a share at Rs. 5 or below, Rs. 0.05 below Rs. 10, and above that the greater of Rs. 0.05 or this rate, plus 15% sales tax on the commission, a Rs. 0.005-a-share CDC fee, and PSX, SECP and NCCPL fees (about Rs. 5.26 per Rs. 100,000). Slippage is at least one Rs. 0.01 price step. Set the rate to 0 to turn charges off. Capital gains tax is not included.</p></details></article>
      <div className="lab-stack"><article className="lab-panel" hidden={plan.entry<=0}><div className="lab-panel-heading"><h2>Budget & risk check</h2><span className={'lab-badge '+(sizing.skipReason?'lab-skip':sizing.errors.length||sizing.warnings.length||targetReview?.warnings.length||!targetReview?'lab-caution':'')}>{sizing.skipReason?'Skip':sizing.errors.length?'Check inputs':sizing.warnings.length||targetReview?.warnings.length||!targetReview?'Research warning':'Arithmetic checks pass'}</span></div><div className="lab-metrics"><div><small>Whole shares</small><strong>{sizing.quantity.toLocaleString()}</strong></div><div><small>Estimated entry cost</small><strong>Rs. {money(sizing.cost)}</strong></div><div><small>Loss if the test stop fills</small><strong className="lab-down">Rs. {money(sizing.loss)}</strong></div>{sizing.gapLoss!=null&&<div><small>Loss if price gaps to the daily lower limit</small><strong className="lab-down">Rs. {money(sizing.gapLoss)}</strong></div>}<div><small>{sizing.reward<0?'Loss at the test exit after costs':'Profit at the test exit after costs'}</small><strong className={sizing.reward<0?'lab-down':'lab-up'}>Rs. {money(sizing.reward)}</strong></div><div><small>Reward / risk after costs</small><strong>{money(sizing.rr)}R</strong><small>R = profit at the test exit ÷ loss at the test stop, after costs.</small></div></div>{[...sizing.errors,...sizing.warnings].map(e=><p key={e} className="lab-warning">{e}</p>)}{sizing.skipReason&&<p className="lab-skip-notice">{sizing.skipReason}. Costs would take more than the move to the test exit.</p>}<p>{sizing.binding&&`Size limited by ${sizing.binding.toLowerCase()}. `}A gap, a stock locked at its price limit or thin trading can cause a bigger loss. These checks do not approve a real trade.</p><label className="lab-field"><span>Your note (optional)</span><textarea rows={2} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} placeholder="What would make this idea right or wrong?"/></label><button className="lab-primary" disabled={!!sizing.errors.length||!!sizing.skipReason||!onPractise} onClick={practise}>Practise in Practice Trading</button><p className="lab-monitor-help">Opens Practice Trading with a limit order filled in. You review and place it there; your practice trades and results are kept in one place.</p></article>
      </div></div>
    </>}

    {tab==='Trade plan'&&<details className="lab-advanced"><summary>Advanced session risk limits (optional)</summary><RiskPanel plan={plan} risk={risk} onChange={setRisk} rules={rules} targetWarnings={targetReview?.warnings??['Target checks have not been reapplied to this plan.']}/></details>}

    {tab==='Replay'&&<>{!intraday&&<p className={intradayLoading?'lab-notice':'lab-warning'} role="status">{intradayLoading?'Loading real 5-minute history… Replay will unlock as soon as it arrives.':'Replay needs intraday candles. Use Refresh above to retry the feed.'}</p>}<div className="lab-two-col"><article className="lab-panel"><span className="lab-eyebrow">HISTORY CHECK</span><h2>How did these rules do before?</h2><p>Applies your Trade plan rules to each complete past session in the data (about a month): {rules.entryMode==='range'?'a close above the first 15 minutes’ high':'a close that crosses your price level'}, a {rules.entryMinutes}-minute entry window, and closing the position {rules.flatMinutes} minutes before the session ends. Entries fill at the next candle’s open, as a real order would.</p><button onClick={()=>setTab('Trade plan')}>Edit replay rules</button><button className="lab-primary" disabled={!intraday} onClick={runReplay}>{intradayLoading?'Loading intraday history…':'Replay available history'}</button>{replay&&<><div className="lab-metrics"><div><small>Sessions checked</small><strong>{replay.sessions}</strong></div><div><small>Times the rules triggered</small><strong>{replay.trades.length}</strong></div><div><small>Profitable after costs</small><strong>{replay.trades.length?`${replay.wins} of ${replay.trades.length}`:'—'}</strong>{replay.winRange&&replay.trades.length>=MIN_SESSIONS_FOR_PERCENT&&<small>Likely range {Math.round(replay.winRange.low*100)}–{Math.round(replay.winRange.high*100)}%</small>}</div><div><small>Average result after costs</small><strong>{replay.averageR==null?'—':`${money(replay.averageR)}R`}</strong></div></div>{replay.trades.some(t=>eventOnDay(stockEvents,t.day))&&<p className="lab-warning">{replay.trades.filter(t=>eventOnDay(stockEvents,t.day)).length} of these past trades were on or right after a results, dividend or ex-date day. Those moves may be news-driven and can flatter or spoil the rules’ record.</p>}{replay.trades.length>0&&replay.trades.length<MIN_SESSIONS_FOR_PERCENT&&<p className="lab-warning">Only {replay.trades.length} past {replay.trades.length===1?'trade':'trades'}. That is too few to judge these rules, so no win percentage is shown.</p>}<p>{replay.excluded} sessions with missing 5-minute candles were left out (often minutes with no trades in thin stocks), so quiet days are under-represented. {replay.skipped} triggers were skipped because no valid stop or exit was possible, costs exceeded the upside, or no candle remained.{replay.blocked?` ${replay.blocked} entries could not fill because the stock was locked at its upper limit.`:''}{replay.locked?` ${replay.locked} trades could not be sold because the stock stayed locked at its lower limit.`:''} Commission ({plan.feePct}%, with per-share minimums) with 15% sales tax, the CDC fee and slippage ({plan.slipPct}%) apply on each side; capital gains tax is not included.</p></>}</article>
      <article className="lab-panel"><span className="lab-eyebrow">WHAT-IF</span><h2>Try this plan on past breakout days</h2><p>Places your current entry, test stop and test exit on each earlier session where the same entry rules triggered, then shows the spread of outcomes. It is not a forecast.</p>{sizing.skipReason&&<p className="lab-skip-notice">{sizing.skipReason}. This is for study only.</p>}<ScenarioControls rules={rules} onChange={setRules} segment={segment}/><button disabled={!intraday||!!sizing.errors.length||simulating} onClick={runSimulation} className="lab-primary">{intradayLoading?'Loading intraday history…':simulating?'Working…':'Try on past breakout days'}</button>{!!sizing.errors.length&&<p>Complete the Trade plan checks to enable this test.</p>}{simulation&&<><p><strong>{simulation.sessions} past {simulation.family} {simulation.sessions===1?'session':'sessions'}</strong> where your rules triggered, out of {simulation.checked} checked before {simulation.before}.</p>{simulation.sessions>=MIN_SESSIONS_FOR_PERCENT?<div className="lab-metrics"><div><small>Test exit reached first</small><strong className="lab-up">{Math.round(simulation.counts.target/simulation.replays*100)}%</strong></div><div><small>Test stop reached first</small><strong className="lab-down">{Math.round(simulation.counts.stop/simulation.replays*100)}%</strong></div><div><small>Neither before closing</small><strong>{Math.round(simulation.counts.close/simulation.replays*100)}%</strong></div><div><small>Average result after costs</small><strong>{money(simulation.meanR)}R</strong></div></div>:<p className="lab-warning">Fewer than {MIN_SESSIONS_FOR_PERCENT} past breakout days, so no percentages are shown. Results range from {money(simulation.p5)}R to {money(simulation.p95)}R; treat them as examples, not odds.</p>}{simulation.counts.locked>0&&<p className="lab-warning">On {simulation.counts.locked.toLocaleString()} of {simulation.replays.toLocaleString()} replays the stock was locked at its lower limit at closing time, so the position could not be sold that day.</p>}<ScenarioCharts result={simulation}/></>}</article></div>
      <p className="lab-notice">R is measured against the distance from entry to the test stop; costs can turn a test exit into a loss. Past results are not future odds. A gap can fill below the stop, and when one candle touches both levels the stop is counted first. These checks cannot model news, price-limit locks, queue position or changing markets.</p>
      {replay&&<div className="lab-panel lab-table-wrap"><h2>Past trades</h2>{!replay.trades.length?<p>The rules did not trigger in the complete sessions available.</p>:<table><thead><tr><th>Session</th><th>Entry</th><th>Test stop</th><th>Test exit</th><th>Outcome</th><th>Result after costs</th></tr></thead><tbody>{replay.trades.map((r,i)=><tr key={i}><td data-label="Session">{r.day}<small>{r.session}</small>{eventOnDay(stockEvents,r.day)&&<small className="lab-down">Event: {eventOnDay(stockEvents,r.day)!.label}</small>}</td><td data-label="Entry">{money(r.entry)}</td><td data-label="Test stop">{money(r.stop)}</td><td data-label="Test exit">{money(r.target)}<small>{r.targetReview.reason}</small>{!r.targetReview.complete&&<small>Exit checks incomplete</small>}{r.targetReview.estimatedBand&&<small>Estimated price band</small>}</td><td data-label="Outcome">{r.outcome==='close'?'Closed before session end':r.outcome==='target'?'Test exit reached':r.outcome==='locked'?'Couldn’t sell: locked at lower limit':'Test stop reached'}</td><td data-label="Result after costs" className={r.netR>=0?'lab-up':'lab-down'}>{money(r.netR)}R</td></tr>)}</tbody></table>}</div>}
    </>}

    {tab==='Research'&&<>{researchLoading&&<p role="status">Loading news, company information and disclosed transactions…</p>}{research?.errors.map(e=><p key={e} className="lab-warning">{e}</p>)}<div className="lab-two-col"><article className="lab-panel"><h2>{symbol} · Company research</h2><p>{research?.company?.businessDescription||(researchLoading?'Loading company profile…':'Company description unavailable in the current feed.')}</p>{research?.company?.fundamentals?.map(g=><div key={g.category}><h3>{g.category}</h3><dl className="lab-facts">{g.items.map((item,i)=><React.Fragment key={i}><dt>{item.label}</dt><dd>{item.value}</dd></React.Fragment>)}</dl></div>)}<small>Source: PSX company profile. Financial statements and announcements are shown below.</small></article><article className="lab-panel"><h2>{symbol} · Insider disclosures</h2><p>Public filings by directors and sponsors, from the same data as the Insider Transactions page.{onOpenInsiders&&<> <button className="lab-link" onClick={onOpenInsiders}>Open Insider Transactions</button></>}</p>{research?.insiders&&<p>Report as of {research.insiders.asOf} · {research.insiders.coverage}</p>}{insiderRows.length?insiderRows.map(r=><div className="lab-news" key={r.id}><strong>{r.person} · {r.action}</strong><small>{r.date} · {r.shares.toLocaleString()} shares · {r.value==null?'Value not provided':'Rs. '+money(r.value)}</small><External url={r.sourceUrl}>Source filing</External></div>):<p>No {symbol} records in the available report. This is not evidence of no insider activity.</p>}<p>Disclosures can arrive late and include transfers or restructurings. They are not necessarily open-market purchases.</p></article></div><LabFinancials key={`financials:${symbol}:${refresh}`} symbol={symbol}/><section className="lab-app-panel lab-announcements" aria-label={`${symbol} announcements`}><h2 className="text-lg font-bold mb-3">{symbol} · Company announcements</h2><StockAnnouncements key={`${symbol}:${refresh}`} ticker={symbol}/></section><LabNews key={`news:${symbol}:${refresh}`} symbol={symbol} research={research} loading={researchLoading} data={data}/></>}

    {tab==='Saved plans'&&<article className="lab-panel"><div className="lab-panel-heading"><div><h2>Plans saved earlier</h2><p>New plans now go to Practice Trading, where your practice trades and results are kept together. These earlier plans stay here to view, load or download.</p></div><button onClick={exportJournal}><Download size={16}/> Download as CSV</button></div>{damaged&&<div className="lab-warning" role="alert"><p>Your saved plans on this device could not be read. Nothing has been deleted.</p><button onClick={downloadDamaged}>Download the saved copy</button></div>}{!book.tickets.length?<div className="lab-empty"><p>No earlier plans on this device.</p></div>:<div className="lab-journal">{book.tickets.map(t=>{const savedSizing=sizePlan(t.plan);const last=t.plan.symbol===symbol?latest:null;const status=last?(last.close<=t.plan.stop?'Last observed close below stop':last.close>=t.plan.target?'Last observed close above target':'Last observed close between levels'):'Select this symbol to check latest available close';return <article key={t.id}><div className="lab-panel-heading"><button className="lab-link" onClick={()=>choose(t.plan.symbol)}>{t.plan.symbol}</button><small>{when(t.createdAt)}</small></div><strong>{t.quantity.toLocaleString()} shares · Entry {money(t.plan.entry)}</strong><p>Stop {money(t.plan.stop)} · Target {money(t.plan.target)} · Source day {t.sourceDate}</p><p>{t.note||'No research note.'}</p>{savedSizing.skipReason&&<p className="lab-skip-notice">{savedSizing.skipReason} · Saved for research only.</p>}<button onClick={()=>{choose(t.plan.symbol);setTargetReview(null);setPlan({...t.plan});setNote(t.note);setEntrySource(t.entrySource||'');setRules(t.workflow?{...t.workflow.rules}:{...DEFAULT_RULES});setRisk(t.workflow?{...t.workflow.risk}:{...DEFAULT_RISK});setTab('Trade plan');setMessage(t.workflow?'Saved plan and rule/risk settings loaded. Recheck dates and hypothetical balances.':'Older plan loaded. Review the default rule and risk settings before testing.');}}>Load saved plan & settings</button><button className="lab-delete-plan" aria-label={`Delete ${t.plan.symbol} test plan from ${when(t.createdAt)}`} onClick={()=>deleteTicket(t)}>Delete plan</button>{t.entrySource&&<p>{t.entrySource}</p>}{savedSizing.warnings.map(w=><p className="lab-warning" key={w}>{w}</p>)}<div className="lab-journal-status">{status}{last&&<small>{when(last.time+300000)} · This check does not prove which level was reached first.</small>}</div></article>;})}</div>}</article>}

    <footer className="lab-footer"><span>{LAB_DISCLAIMER}</span><span>Workflow inspired by <External url="https://github.com/Jakeschincariol/day-trader-skill">Day Trader skills</External> · <a href="/licenses/day-trader-skill.txt" target="_blank" rel="noopener noreferrer">MIT license</a></span><span><External url="https://www.psx.com.pk/psx/exchange/general/trading-hours">PSX hours</External> · <External url="https://www.nccpl.com.pk/transition-to-t1-settlement-cycle">Settlement rules</External></span></footer>
  </section>;
}
