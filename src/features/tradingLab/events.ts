import {fetchBoardMeetings,fetchCompanyAnnouncements} from '../../services/financials';
import {normalizeExDateIso} from '../../utils/xDateMerge';
import {takeLabSlot} from './labBudget';

export type StockEvent={day:string;kind:'ex-date'|'results'|'board'|'dividend';label:string};
const DAY=86400000;
const iso=(t:number)=>new Date(t+5*3600000).toISOString().slice(0,10);
const days=(a:string,b:string)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/DAY);

/**
 * Dated events that move prices: results and board-meeting announcements, dividend announcements,
 * upcoming board meetings and ex-dividend dates. Each source may fail on its own.
 */
export async function loadStockEvents(symbol:string,companyJson:()=>Promise<any>):Promise<StockEvent[]>{
  const events:StockEvent[]=[];
  await takeLabSlot();
  const [announcements,meetings,company]=await Promise.allSettled([fetchCompanyAnnouncements(symbol),fetchBoardMeetings(),companyJson()]);
  if(announcements.status==='fulfilled')for(const a of announcements.value){
    if(!a.ts||a.kind==='Other')continue;
    events.push({day:iso(a.ts),kind:a.kind==='Result'?'results':a.kind==='Dividend'?'dividend':'board',label:a.kind==='Result'?'Financial results announced':a.kind==='Dividend'?'Dividend announced':'Board meeting announced'});
  }
  if(meetings.status==='fulfilled')for(const m of meetings.value){
    if(m.ticker?.toUpperCase()!==symbol||!(m.date instanceof Date)||Number.isNaN(m.date.getTime()))continue;
    // The sheet date is a local calendar date, so read its local day rather than shifting time zones.
    const local=`${m.date.getFullYear()}-${String(m.date.getMonth()+1).padStart(2,'0')}-${String(m.date.getDate()).padStart(2,'0')}`;
    events.push({day:local,kind:'board',label:`Board meeting${m.quarter?` (${m.quarter})`:''}: results or payouts often follow`});
  }
  if(company.status==='fulfilled'){
    const rows=[...(company.value?.dividendHistory||[]),...(company.value?.latestDividend?[company.value.latestDividend]:[])];
    for(const r of rows){const day=normalizeExDateIso(r?.exDividendDate);if(day)events.push({day,kind:'ex-date',label:'Ex-dividend date: the price usually drops by about the payout'});}
  }
  const unique=new Map(events.map(e=>[`${e.day}:${e.kind}`,e]));
  return [...unique.values()].sort((a,b)=>a.day.localeCompare(b.day));
}

/** Events from `before` days ago to `after` days ahead of a day. */
export const eventsNear=(events:StockEvent[],day:string,before=3,after=10)=>events.filter(e=>{const d=days(day,e.day);return d>=-before&&d<=after;});
/** Event on the same day or the trading day before: a breakout then may be news, not a pattern. */
export const eventOnDay=(events:StockEvent[],day:string)=>events.find(e=>{const d=days(e.day,day);return d>=0&&d<=1;})??null;
export const relativeDay=(from:string,to:string)=>{const d=days(from,to);return d===0?'today':d===1?'tomorrow':d===-1?'yesterday':d>0?`in ${d} days`:`${-d} days ago`;};
