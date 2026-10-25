import {dailyScan,intradaySegments,pktDay,standardSessions,type Bar} from './engine';
import {checkEntry,exitLevels,type Rules} from './workflow';
import type {CandleSet} from './data';

export type ScanKind='daily'|'intraday';
export type MarketSymbol={symbol:string;name:string;sector:string;volume:number|null};
export type MarketUniverse={stocks:MarketSymbol[];retrievedAt:string;source:string};
export type EntrySnapshot=ReturnType<typeof intradayScan>;
export type ScanRow=MarketSymbol&{daily?:ReturnType<typeof dailyScan>;entry?:EntrySnapshot;error?:string;checkedAt:number};

export function remainingScanStocks(stocks:MarketSymbol[],rows:ScanRow[]){
  const results=new Map(rows.map(row=>[row.symbol,row]));
  // Resume unseen stocks first, so repeatedly failing names cannot starve the rest of the market.
  return [...stocks.filter(s=>!results.has(s.symbol)),...stocks.filter(s=>results.get(s.symbol)?.error)];
}

export function normalizeUniverse(stocks:MarketSymbol[]):MarketSymbol[]{
  const unique=new Map<string,MarketSymbol>();
  for(const stock of stocks){
    const symbol=String(stock.symbol||'').trim().toUpperCase();
    if(!/^[A-Z][A-Z0-9.-]{0,19}$/.test(symbol))continue;
    unique.set(symbol,{symbol,name:stock.name||symbol,sector:stock.sector||'Unclassified',volume:typeof stock.volume==='number'&&Number.isFinite(stock.volume)&&stock.volume>=0?stock.volume:null});
  }
  return [...unique.values()].sort((a,b)=>(b.volume??-1)-(a.volume??-1)||a.symbol.localeCompare(b.symbol));
}

/** A market scan is a dated observation, never an execution instruction. */
export function intradayScan(bars:Bar[],rules:Rules,now=Date.now()){
  const segments=intradaySegments(bars,now),active=standardSessions(pktDay(now)).find(s=>now>=s.start&&now<s.end);
  // Never substitute Friday morning (or yesterday) for a missing current session.
  const session=active?segments.find(s=>s.start===active.start):segments.at(-1);
  const last=session?.bars.at(-1),fresh=!!active&&!!last&&now-(last.time+300000)<=10*60000;
  const check=session?checkEntry(session,{...rules,entryMode:'range'},now):null;
  let levels:{entry:number;stop:number;target:number}|null=null;
  if(session&&check?.trigger){
    try{const exits=exitLevels(check.trigger.close,session,check.index,rules,0);levels={entry:check.trigger.close,stop:exits.stop,target:exits.target};}catch{/* No invented levels if the stop rule cannot be calculated. */}
  }
  const status=!session?'No session data':!active?'Session ended':!fresh?'Delayed data':check?.state==='triggered'?'Breakout confirmed':check?.state==='waiting'?'Waiting':check?.state==='expired'?'Window expired':'Incomplete candles';
  return {status,check,levels,fresh,date:session?.day??pktDay(now),family:session?.family??active?.family??'',last:last??null,
    latestCloseAt:last?last.time+300000:null,triggerAt:check?.trigger?check.trigger.time+300000:null,
    // An old match remains visible with its time, but is never presented as a new call.
    recent:!!fresh&&!!check?.trigger&&now-(check.trigger.time+300000)<=10*60000};
}

export class ScanFeedError extends Error{
  constructor(message:string,public status=0){super(message);this.name='ScanFeedError';}
}

/** Bounded workers, one result per stock; cancellation prevents further requests/updates. */
export async function runMarketScan(options:{stocks:MarketSymbol[];kind:ScanKind;rules:Rules;signal:AbortSignal;
  load:(symbol:string,kind:ScanKind,signal:AbortSignal)=>Promise<CandleSet>;
  onRow:(row:ScanRow)=>void;now?:()=>number;concurrency?:number}){
  const {stocks,signal,kind,rules,load,onRow}=options;
  let cursor=0,done=0,failures=0,pause='';
  await Promise.all(Array.from({length:Math.min(3,Math.max(1,options.concurrency??3),stocks.length)},async()=>{
    while(cursor<stocks.length&&!signal.aborted&&!pause){
      const stock=stocks[cursor++];
      let row:ScanRow;
      try{
        const candles=await load(stock.symbol,kind,signal);if(signal.aborted)return;
        if(candles.symbol!==stock.symbol)throw new Error('The feed returned a different stock.');
        const checkedAt=options.now?.()??Date.now();
        row={...stock,checkedAt,...(kind==='daily'?{daily:dailyScan(candles.bars,checkedAt)}:{entry:intradayScan(candles.bars,rules,checkedAt)})};
        failures=0;
      }catch(e){
        if(signal.aborted)return;
        row={...stock,checkedAt:options.now?.()??Date.now(),error:e instanceof Error?e.message:'History unavailable.'};
        if(e instanceof ScanFeedError){
          failures++;
          if(e.status===429)pause='The feed is limiting requests. Wait a few minutes, then retry unfinished stocks.';
          else if(failures>=6)pause='The feed is repeatedly unavailable. Completed results are kept; retry unfinished stocks later.';
        }
      }
      if(!signal.aborted){done++;onRow(row);}
    }
  }));
  return {done,total:stocks.length,cancelled:signal.aborted,pause};
}
