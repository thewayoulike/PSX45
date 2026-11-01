import {dailyScan,intradaySegments,pktDay,standardSessions,type Bar,type Segment} from './engine';
import {checkEntry,exitLevels,comparableHistory,type Rules} from './workflow';
import type {CandleSet} from './data';
import type {TargetContext,TargetReview} from './targets';

export type ScanKind='daily'|'intraday';
export type MarketSymbol={symbol:string;name:string;sector:string;volume:number|null;listedIn?:string;price?:number|null};
/** Rupees traded today (price × shares), the measure of how easy a stock is to buy and sell. */
export const tradedValue=(s:Pick<MarketSymbol,'price'|'volume'>)=>s.price!=null&&s.volume!=null?s.price*s.volume:null;
/** One Rs 0.01 step is more than 0.25% of the price below Rs 4: every tick of spread is costly. */
export const wideTick=(price:number|null|undefined)=>price!=null&&price>0&&0.01/price>0.0025;
export type LiquidityRules={minValue:number;minPrice:number};
export const DEFAULT_LIQUIDITY:LiquidityRules={minValue:1_000_000,minPrice:1};
/** Keep stocks that traded at least minValue rupees today at a price of at least minPrice. */
export function liquidStocks(stocks:MarketSymbol[],rules:LiquidityRules){
  return stocks.filter(s=>(s.price??0)>=rules.minPrice&&(tradedValue(s)??0)>=rules.minValue);
}
export type MarketUniverse={stocks:MarketSymbol[];retrievedAt:string;source:string};
export type EntrySnapshot=ReturnType<typeof intradayScan>;
export type ScanRow=MarketSymbol&{daily?:ReturnType<typeof dailyScan>;entry?:EntrySnapshot;error?:string;checkedAt:number};
export type SetupProgress={state:'active'|'faded'|'target'|'stop'|'ambiguous'|'closed'|'unknown';label:string;reason:string;at:number|null};

/** First observed touch after confirmation, never the final price or the entry candle's wick. */
export function setupProgress(session:Segment,index:number,levels:{stop:number;target:number},rangeHigh:number,rules:Rules,now:number):SetupProgress{
  const flatAt=session.end-rules.flatMinutes*60000;
  const after=session.bars.slice(index+1).filter(b=>b.time+300000<=Math.min(now,flatAt));
  let previous=session.bars[index].time;
  for(const bar of after){
    if(bar.time!==previous+300000)return {state:'unknown',label:'Outcome incomplete',reason:'Missing candles after entry prevent establishing which level was touched first.',at:null};
    previous=bar.time;
    const stop=bar.low<=levels.stop,target=bar.high>=levels.target,at=bar.time+300000;
    if(stop&&target)return {state:'ambiguous',label:'Both levels touched',reason:'One candle touched stop and target; their order is unknown. Replay assumes the stop first. This is not a fill.',at};
    if(stop)return {state:'stop',label:'Stop touched first',reason:'The first observed exit-level touch was the stop. A later recovery does not reset this setup. This is not a fill.',at};
    if(target)return {state:'target',label:'Target touched first',reason:'The first observed exit-level touch was the target. A later decline does not reset this setup. This is not a fill.',at};
  }
  if(now>=flatAt){
    if(previous+300000<flatAt)return {state:'unknown',label:'Outcome incomplete',reason:'Candles do not cover the remaining period up to the planned exit time.',at:null};
    return {state:'closed',label:'Time window closed',reason:'Neither level was touched in the available continuous candles before the planned exit time.',at:flatAt};
  }
  const last=after.at(-1)??session.bars[index];
  if(last.close<=rangeHigh)return {state:'faded',label:'Below breakout level',reason:'The latest completed close is back at or below the opening high; no exit level has been touched yet.',at:last.time+300000};
  return {state:'active',label:'Between plan levels',reason:'No exit level has been touched in the continuous completed candles since entry. Check the age of this snapshot.',at:last.time+300000};
}

export function remainingScanStocks(stocks:MarketSymbol[],rows:ScanRow[]){
  const results=new Map(rows.map(row=>[row.symbol,row]));
  // Resume unseen stocks first, so repeatedly failing names cannot starve the rest of the market.
  return [...stocks.filter(s=>!results.has(s.symbol)),...stocks.filter(s=>results.get(s.symbol)?.error)];
}

export function normalizeUniverse(stocks:MarketSymbol[]):MarketSymbol[]{
  const unique=new Map<string,MarketSymbol>();
  for(const stock of stocks){
    const symbol=String(stock.symbol||'').trim().toUpperCase();
    if(!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol))continue;
    const price=typeof stock.price==='number'&&Number.isFinite(stock.price)&&stock.price>0?stock.price:null;
    unique.set(symbol,{symbol,name:stock.name||symbol,sector:stock.sector||'Unclassified',volume:typeof stock.volume==='number'&&Number.isFinite(stock.volume)&&stock.volume>=0?stock.volume:null,...(typeof stock.listedIn==='string'?{listedIn:stock.listedIn}: {}),...(price!=null?{price}:{})});
  }
  // Rupees traded first: share volume alone puts penny stocks ahead of genuinely liquid ones.
  const value=(s:MarketSymbol)=>tradedValue(s)??(s.volume!=null?s.volume*1e-9:-1);
  return [...unique.values()].sort((a,b)=>value(b)-value(a)||a.symbol.localeCompare(b.symbol));
}

/** A market scan is a dated observation, never an execution instruction. */
export function intradayScan(bars:Bar[],rules:Rules,now=Date.now(),context:TargetContext={}){
  const segments=intradaySegments(bars,now),active=standardSessions(pktDay(now)).find(s=>now>=s.start&&now<s.end);
  // Never substitute Friday morning (or yesterday) for a missing current session.
  const session=active?segments.find(s=>s.start===active.start):segments.at(-1);
  const last=session?.bars.at(-1),fresh=!!active&&!!last&&now-(last.time+300000)<=10*60000;
  const check=session?checkEntry(session,{...rules,entryMode:'range'},now,comparableHistory(segments,session)):null;
  let levels:{entry:number;stop:number;target:number}|null=null;
  let targetReview:TargetReview|null=null;
  if(session&&check?.trigger){
    try{const exits=exitLevels(check.trigger.close,session,check.index,rules,0,{...context,intraday:bars});targetReview=exits.targetReview;if(exits.target!=null)levels={entry:check.trigger.close,stop:exits.stop,target:exits.target};}catch{/* No invented levels if the stop rule cannot be calculated. */}
  }
  const status=!session?'No session data':!active?'Session ended':!fresh?'Delayed data':check?.state==='triggered'?'Breakout confirmed':check?.state==='waiting'?'Waiting':check?.state==='expired'?'Window expired':'Incomplete candles';
  const progress=session&&levels&&check?.trigger?setupProgress(session,check.index,levels,check.level!,rules,now):null;
  return {status,check,levels,targetReview,progress,fresh,date:session?.day??pktDay(now),family:session?.family??active?.family??'',last:last??null,
    latestCloseAt:last?last.time+300000:null,triggerAt:check?.trigger?check.trigger.time+300000:null,
    // An old match remains visible with its time, but is never presented as a new call.
    recent:!!fresh&&!!check?.trigger&&now-(check.trigger.time+300000)<=10*60000};
}

export class ScanFeedError extends Error{
  constructor(message:string,public status=0,public retryAt=0){super(message);this.name='ScanFeedError';}
}

export type BatchResult=Map<string,CandleSet|Error>;
type ScanOptions={stocks:MarketSymbol[];kind:ScanKind;rules:Rules;signal:AbortSignal;
  load:(symbol:string,kind:ScanKind,signal:AbortSignal,rules?:Rules)=>Promise<CandleSet>;
  loadBatch?:(symbols:string[],kind:ScanKind,signal:AbortSignal,rules:Rules)=>Promise<BatchResult>;batchSize?:number;
  wait?:(ms:number,signal:AbortSignal)=>Promise<void>;onWait?:(until:number)=>void;
  onRow:(row:ScanRow)=>void;now?:()=>number;concurrency?:number};
const scanRow=(stock:MarketSymbol,kind:ScanKind,rules:Rules,result:CandleSet|Error|undefined,checkedAt:number):ScanRow=>{
  try{
    if(!result)throw new Error('History unavailable.');
    if(result instanceof Error)throw result;
    if(result.symbol!==stock.symbol)throw new Error('The feed returned a different stock.');
    return {...stock,checkedAt,...(kind==='daily'?{daily:dailyScan(result.bars,checkedAt)}:{entry:intradayScan(result.bars,rules,checkedAt,result.targetContext)})};
  }catch(e){return {...stock,checkedAt,error:e instanceof Error?e.message:'History unavailable.'};}
};

/**
 * Batched scan: one request per group of stocks, one group at a time. A busy or rate-limited
 * reply waits for the server's Retry-After (up to 3 times per group) and continues by itself.
 */
async function runBatchedScan(options:ScanOptions&{loadBatch:NonNullable<ScanOptions['loadBatch']>}){
  const {stocks,signal,kind,rules,onRow,loadBatch}=options,now=options.now??Date.now,size=Math.max(1,options.batchSize??8);
  const wait=options.wait??((ms,s)=>new Promise<void>((resolve)=>{const t=setTimeout(resolve,ms);s.addEventListener('abort',()=>{clearTimeout(t);resolve();},{once:true});}));
  let done=0,failed=0,failures=0,pause='',retryAt=0;
  for(let i=0;i<stocks.length&&!signal.aborted&&!pause;){
    const chunk=stocks.slice(i,i+size);let result:BatchResult|null=null;
    for(let attempt=0;!signal.aborted;attempt++){
      try{result=await loadBatch(chunk.map(s=>s.symbol),kind,signal,rules);failures=0;break;}
      catch(e){
        if(signal.aborted)break;
        const feed=e instanceof ScanFeedError?e:null;
        if(feed&&(feed.status===429||feed.status===503)&&attempt<3){
          const until=Math.max(now()+5000,Math.min(feed.retryAt||now()+30000,now()+90000));
          options.onWait?.(until);await wait(until-now(),signal);continue;
        }
        failures++;retryAt=Math.max(retryAt,feed?.retryAt||0);
        if(feed?.status===429||feed?.status===503)pause='The market-data service is busy. Completed results are kept; retry unfinished stocks in a few minutes.';
        else if(failures>=3)pause='The feed is repeatedly unavailable. Completed results are kept; retry unfinished stocks later.';
        result=new Map(chunk.map(s=>[s.symbol,e instanceof Error?e:new Error('History unavailable.')]));
        break;
      }
    }
    if(signal.aborted||!result)break;
    const checkedAt=now();
    for(const stock of chunk){const row=scanRow(stock,kind,rules,result.get(stock.symbol),checkedAt);done++;if(row.error)failed++;onRow(row);}
    i+=size;
  }
  return {done,total:stocks.length,failed,cancelled:signal.aborted,pause,retryAt};
}

/** Bounded workers, one result per stock; cancellation prevents further requests/updates. */
export async function runMarketScan(options:ScanOptions){
  if(options.loadBatch)return runBatchedScan(options as ScanOptions&{loadBatch:NonNullable<ScanOptions['loadBatch']>});
  const {stocks,signal,kind,rules,load,onRow}=options;
  let cursor=0,done=0,failures=0,failed=0,pause='',retryAt=0;
  await Promise.all(Array.from({length:Math.min(3,Math.max(1,options.concurrency??3),stocks.length)},async()=>{
    while(cursor<stocks.length&&!signal.aborted&&!pause){
      const stock=stocks[cursor++];
      let row:ScanRow;
      try{
        const candles=await load(stock.symbol,kind,signal,rules);if(signal.aborted)return;
        if(candles.symbol!==stock.symbol)throw new Error('The feed returned a different stock.');
        const checkedAt=options.now?.()??Date.now();
        row={...stock,checkedAt,...(kind==='daily'?{daily:dailyScan(candles.bars,checkedAt)}:{entry:intradayScan(candles.bars,rules,checkedAt,candles.targetContext)})};
        failures=0;
      }catch(e){
        if(signal.aborted)return;
        row={...stock,checkedAt:options.now?.()??Date.now(),error:e instanceof Error?e.message:'History unavailable.'};
        if(e instanceof ScanFeedError){
          failures++;
          retryAt=Math.max(retryAt,e.retryAt);
          if(e.status===429)pause='The feed is limiting requests. Wait a few minutes, then retry unfinished stocks.';
          else if(e.status===503&&e.retryAt)pause='The market-data service asked us to wait before sending more requests. Results are incomplete; retry after the countdown.';
          else if(failures>=6)pause='The feed is repeatedly unavailable. Completed results are kept; retry unfinished stocks later.';
        }
      }
      if(!signal.aborted){done++;if(row.error)failed++;onRow(row);}
    }
  }));
  return {done,total:stocks.length,failed,cancelled:signal.aborted,pause,retryAt};
}
