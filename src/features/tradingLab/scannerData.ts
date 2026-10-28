import {marketTableMarkup,marketNumber} from '../../services/marketOverview';
import {SECTOR_CODE_MAP} from '../../services/sectors';
import {parseBars} from './engine';
import {normalizeUniverse,intradayScan,ScanFeedError,type MarketUniverse,type ScanKind} from './scanner';
import {DEFAULT_RULES,type Rules} from './workflow';
import type {CandleSet} from './data';
import {loadTargetContext} from './targetData';

async function request(url:string,signal?:AbortSignal){
  const controller=new AbortController(),abort=()=>controller.abort();
  if(signal?.aborted)controller.abort();
  signal?.addEventListener('abort',abort,{once:true});
  // The production gateway allows 35 seconds for its worker; do not abandon it
  // at 25 seconds and start more requests while it still occupies a server slot.
  const timer=setTimeout(abort,45000);
  try{
    const response=await fetch(url,{signal:controller.signal});
    if(!response.ok){
      const retry=response.headers.get('Retry-After');
      const parsed=retry?(/^\d+$/.test(retry.trim())?Date.now()+Number(retry)*1000:Date.parse(retry)):0;
      const retryAt=Number.isFinite(parsed)&&parsed>Date.now()?parsed:0;
      throw new ScanFeedError(`Market feed unavailable (${response.status}).`,response.status,retryAt);
    }
    return await response.text();
  }catch(e){
    if(signal?.aborted)throw new DOMException('Scan cancelled','AbortError');
    if(e instanceof ScanFeedError)throw e;
    throw new ScanFeedError('Market feed timed out or could not be reached.');
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

export function parseMarketUniverse(html:string):MarketUniverse['stocks']{
  const template=document.createElement('template');
  template.innerHTML=marketTableMarkup(html); // Inert, sanitized table data only.
  const stocks:MarketUniverse['stocks']=[];
  for(const table of Array.from(template.content.querySelectorAll('table'))){
    const headers=Array.from(table.querySelectorAll('thead th')).map(th=>th.getAttribute('data-name'));
    const symbolIndex=headers.indexOf('symbol');if(symbolIndex<0)continue;
    for(const tr of Array.from(table.querySelectorAll('tbody tr'))){
      const cells=Array.from(tr.querySelectorAll('td'));
      const value=(key:string)=>{const cell=cells[headers.indexOf(key)];return (cell?.getAttribute('data-order')??cell?.textContent??'').trim();};
      stocks.push({symbol:value('symbol'),name:cells[symbolIndex]?.querySelector('a')?.getAttribute('data-title')||value('symbol'),sector:SECTOR_CODE_MAP[value('sector')]||value('sector')||'Unclassified',volume:marketNumber(value('volume')),listedIn:value('listed')});
    }
  }
  // Keep zero-volume and unpriced listings too; history availability is assessed per stock.
  return normalizeUniverse(stocks);
}

export async function loadMarketUniverse(signal?:AbortSignal):Promise<MarketUniverse>{
  const html=await request('/api/proxy?url='+encodeURIComponent('https://dps.psx.com.pk/market-watch'),signal);
  const stocks=parseMarketUniverse(html);
  if(!stocks.length)throw new Error('PSX Market Watch did not return a usable stock list. Retry the market scan.');
  return {stocks,retrievedAt:new Date().toISOString(),source:'PSX Market Watch'};
}

// A bounded cache avoids retaining years of candles for the entire exchange on mobile.
const cache=new Map<string,{expires:number;value:CandleSet}>();
export async function loadScanCandles(symbol:string,kind:ScanKind,signal:AbortSignal,rules:Rules=DEFAULT_RULES):Promise<CandleSet>{
  if(!/^[A-Z][A-Z0-9.-]{0,19}$/.test(symbol))throw new Error('Invalid PSX symbol.');
  if(signal.aborted)throw new DOMException('Scan cancelled','AbortError');
  const key=kind+':'+symbol,existing=cache.get(key);
  if(existing&&existing.expires>Date.now())return withTargetContext(existing.value,kind,signal,rules);
  const url=kind==='daily'?`/api/proxy?ohlc=${encodeURIComponent(symbol)}`:`/api/pypsx?mode=intraday&symbol=${encodeURIComponent(symbol)}&interval=5m&period=5d`;
  let raw:any;try{raw=JSON.parse(await request(url,signal));}catch(e){if(e instanceof SyntaxError)throw new ScanFeedError('Market feed returned an unreadable response.');throw e;}
  if(!raw||typeof raw!=='object')throw new ScanFeedError('Market feed returned an unreadable response.');
  if(raw?.error)throw new ScanFeedError('Market feed is temporarily unavailable.');
  if(raw.symbol&&raw.symbol!==symbol)throw new Error('The feed returned a different stock.');
  const bars=parseBars(raw.bars);if(!bars.length)throw new Error('No usable candle history returned.');
  if(signal.aborted)throw new DOMException('Scan cancelled','AbortError');
  const value={symbol,bars,source:String(raw.source||'PSX market feed'),retrievedAt:new Date().toISOString()};
  cache.delete(key);cache.set(key,{expires:Date.now()+(kind==='daily'?300000:30000),value});
  while(cache.size>80)cache.delete(cache.keys().next().value!);
  return withTargetContext(value,kind,signal,rules);
}

async function withTargetContext(value:CandleSet,kind:ScanKind,signal:AbortSignal,rules:Rules):Promise<CandleSet>{
  // Most stocks have no confirmed entry. Daily history and a company quote are
  // only needed once a real breakout needs exit levels, reducing full-scan load.
  if(kind!=='intraday'||!intradayScan(value.bars,rules).check?.trigger)return value;
  const targetContext=await loadTargetContext(value.symbol,signal);
  if(signal.aborted)throw new DOMException('Scan cancelled','AbortError');
  return {...value,targetContext};
}
