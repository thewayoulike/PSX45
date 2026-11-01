import { parseBars, type Bar } from './engine';
import type { InsiderReport } from '../../services/marketReports';
import {loadMarketUniverse,loadScanCandles,loadScanBatch} from './scannerData';
import {loadTargetContext} from './targetData';
import type {TargetContext} from './targets';
import {takeLabSlot,LAB_SYMBOL} from './labBudget';
import {loadMarketData} from '../../services/marketOverview';

export type CandleSet={symbol:string;bars:Bar[];source:string;retrievedAt:string;targetContext?:TargetContext};
export type Headline={id:string;title:string;url:string;source:string;publishedAt?:string;indexedAt:string;topics?:string[]};
export type Research={news?:{items:Headline[];checkedAt:string;stale:boolean;failedFeeds?:string[]};insiders?:InsiderReport;company?:{businessDescription?:string;source?:string;fundamentals?:{category:string;items:{label:string;value:string}[]}[]};errors:string[]};
const cache=new Map<string,{expires:number;promise:Promise<CandleSet>}>();
async function json(url:string){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
  try {await takeLabSlot(controller.signal);const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw new Error(`Feed unavailable (${response.status}).`);const data=await response.json();if(data?.error)throw new Error('The feed is temporarily unavailable.');return data;}
  finally{clearTimeout(timer);}
}
export function safeUrl(value:string){try{const u=new URL(value);return u.protocol==='https:'?u.href:undefined;}catch{return undefined;}}
export function loadCandles(symbol:string,intraday=false,force=false):Promise<CandleSet>{
  if(!LAB_SYMBOL.test(symbol))return Promise.reject(new Error('Enter a valid PSX symbol.'));
  const key=symbol+(intraday?':5m':':daily'),old=cache.get(key);
  if(!force&&old&&old.expires>Date.now())return old.promise;
  const url=intraday?`/api/pypsx?mode=intraday&symbol=${encodeURIComponent(symbol)}&interval=5m&period=1mo`:`/api/proxy?ohlc=${encodeURIComponent(symbol)}`;
  const promise=Promise.all([json(url),intraday?loadTargetContext(symbol):Promise.resolve(undefined)]).then(([raw,targetContext])=>{
    const bars=parseBars(raw.bars);if(!bars.length)throw new Error('No usable candles were returned.');
    if(raw.symbol&&raw.symbol!==symbol)throw new Error('The feed returned a different symbol.');
    return {symbol,bars,source:String(raw.source||'PSX market feed'),retrievedAt:new Date().toISOString(),...(targetContext?{targetContext}:{})};
  }).catch(e=>{cache.delete(key);throw e;});
  cache.set(key,{expires:Date.now()+(intraday?60000:300000),promise});
  // Bounded: a long session browsing many stocks must not keep every history in memory.
  while(cache.size>40)cache.delete(cache.keys().next().value!);
  return promise;
}
export async function loadResearch(symbol:string):Promise<Research>{
  if(!LAB_SYMBOL.test(symbol))throw new Error('Invalid symbol.');
  // News and insider filings come from the same cached loader as the app's Markets and Insider pages.
  const [news,insiders,company]=await Promise.allSettled([loadMarketData('news'),loadMarketData('insiders'),json(`/api/proxy?company=${encodeURIComponent(symbol)}`)]);
  const result:Research={errors:[]};
  const text=(v:unknown)=>typeof v==='string';
  if(news.status==='fulfilled'&&Array.isArray(news.value.data?.items))result.news={...news.value.data,items:news.value.data.items.filter((h:any)=>h&&text(h.id)&&text(h.title)&&text(h.url))};else result.errors.push('News feed unavailable.');
  // One malformed filing must not break the Research tab.
  if(insiders.status==='fulfilled'&&Array.isArray(insiders.value.data?.records))result.insiders={...insiders.value.data,records:insiders.value.data.records.filter((r:any)=>r&&text(r.id)&&text(r.symbol)&&text(r.date)&&text(r.person)&&Number.isFinite(r.shares))};else result.errors.push('Insider disclosures unavailable.');
  if(company.status==='fulfilled'&&company.value.symbol===symbol)result.company={...company.value,fundamentals:Array.isArray(company.value.fundamentals)?company.value.fundamentals.filter((g:any)=>g&&text(g.category)&&Array.isArray(g.items)):undefined};else result.errors.push('Company information unavailable.');
  return result;
}
/** KSE-30 5-minute candles for the market-halt check, cached for 5 minutes. */
let indexCache:{expires:number;promise:Promise<Bar[]>}|null=null;
export function loadHaltIndex():Promise<Bar[]>{
  if(indexCache&&indexCache.expires>Date.now())return indexCache.promise;
  const promise=json('/api/pypsx?mode=intraday&symbol=KSE30&interval=5m&period=5d').then(raw=>parseBars(raw.bars));
  indexCache={expires:Date.now()+300000,promise};promise.catch(()=>{indexCache=null;});
  return promise;
}
export const labData={candles:loadCandles,research:loadResearch,universe:loadMarketUniverse,scanCandles:loadScanCandles,scanBatch:loadScanBatch,haltIndex:loadHaltIndex};
export type LabData=typeof labData;
