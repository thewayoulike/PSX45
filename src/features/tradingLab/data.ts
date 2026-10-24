import { parseBars, type Bar } from './engine';
import type { InsiderReport } from '../../services/marketReports';

export type CandleSet={symbol:string;bars:Bar[];source:string;retrievedAt:string};
export type Headline={id:string;title:string;url:string;source:string;publishedAt?:string;indexedAt:string;topics?:string[]};
export type Research={news?:{items:Headline[];checkedAt:string;stale:boolean;failedFeeds?:string[]};insiders?:InsiderReport;company?:{businessDescription?:string;source?:string;fundamentals?:{category:string;items:{label:string;value:string}[]}[]};errors:string[]};
const cache=new Map<string,{expires:number;promise:Promise<CandleSet>}>();
async function json(url:string){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
  try {const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw new Error(`Feed unavailable (${response.status}).`);const data=await response.json();if(data?.error)throw new Error('The feed is temporarily unavailable.');return data;}
  finally{clearTimeout(timer);}
}
export function safeUrl(value:string){try{const u=new URL(value);return u.protocol==='https:'?u.href:undefined;}catch{return undefined;}}
export function loadCandles(symbol:string,intraday=false,force=false):Promise<CandleSet>{
  if(!/^[A-Z][A-Z0-9.-]{0,19}$/.test(symbol))return Promise.reject(new Error('Enter a valid PSX symbol.'));
  const key=symbol+(intraday?':5m':':daily'),old=cache.get(key);
  if(!force&&old&&old.expires>Date.now())return old.promise;
  const url=intraday?`/api/pypsx?mode=intraday&symbol=${encodeURIComponent(symbol)}&interval=5m&period=1mo`:`/api/proxy?ohlc=${encodeURIComponent(symbol)}`;
  const promise=json(url).then(raw=>{
    const bars=parseBars(raw.bars);if(!bars.length)throw new Error('No usable candles were returned.');
    if(raw.symbol&&raw.symbol!==symbol)throw new Error('The feed returned a different symbol.');
    return {symbol,bars,source:String(raw.source||'PSX market feed'),retrievedAt:new Date().toISOString()};
  }).catch(e=>{cache.delete(key);throw e;});
  cache.set(key,{expires:Date.now()+(intraday?60000:300000),promise});return promise;
}
export async function loadResearch(symbol:string):Promise<Research>{
  if(!/^[A-Z][A-Z0-9.-]{0,19}$/.test(symbol))throw new Error('Invalid symbol.');
  const [news,insiders,company]=await Promise.allSettled([json('/api/proxy?feed=news'),json('/api/proxy?feed=insiders'),json(`/api/proxy?company=${encodeURIComponent(symbol)}`)]);
  const result:Research={errors:[]};
  if(news.status==='fulfilled'&&Array.isArray(news.value.data?.items))result.news=news.value.data;else result.errors.push('News feed unavailable.');
  if(insiders.status==='fulfilled'&&Array.isArray(insiders.value.data?.records))result.insiders=insiders.value.data;else result.errors.push('Insider disclosures unavailable.');
  if(company.status==='fulfilled'&&company.value.symbol===symbol)result.company=company.value;else result.errors.push('Company information unavailable.');
  return result;
}
export const labData={candles:loadCandles,research:loadResearch};
export type LabData=typeof labData;
