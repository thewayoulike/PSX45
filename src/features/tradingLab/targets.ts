import {pktDay,standardSessions,type Bar,type Segment} from './engine';

export type PriceBand={day:string;lower:number;upper:number;reference:number;source:string};
export type TargetContext={daily?:Bar[];intraday?:Bar[];band?:PriceBand;standardBandAllowed?:boolean};
export type TargetReview={
  day:string;requested:number;target:number|null;reason:string;resistance:number|null;
  typicalCeiling:number|null;typicalRangePct:number|null;sample:number;
  band:PriceBand|null;estimatedBand:boolean;complete:boolean;warnings:string[];
};
const floorPrice=(n:number)=>Math.floor((n+1e-9)*100)/100;
const median=(xs:number[])=>{const s=[...xs].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};

/** Only completed earlier days and candles at/before entry may shape a target. */
export function assessTarget(entry:number,requested:number,s:Segment|null,index:number,context:TargetContext={}):TargetReview{
  const day=s?.day||'',warnings:string[]=[];
  const prior=(context.daily||[]).filter(b=>pktDay(b.time)<day).sort((a,b)=>a.time-b.time).slice(-60);
  const previous=prior.at(-1),sample=prior.slice(-20);
  const recent=!!previous&&Date.parse(day)-Date.parse(pktDay(previous.time))<=7*86400000;
  const through=s?.bars[index]?.time??0;
  const windows=day?standardSessions(day):[];
  const known=(context.intraday||s?.bars||[]).filter(b=>pktDay(b.time)===day&&b.time<=through&&windows.some(w=>b.time>=w.start&&b.time+300000<=w.end)).sort((a,b)=>a.time-b.time);
  const candidates:{price:number;reason:string}[]=[{price:floorPrice(requested),reason:'R benchmark'}];
  // Prior-day high and confirmed two-sided swing highs, not every candle's high.
  const highs:number[]=previous?[previous.high]:[];
  for(const series of [prior,known])for(let i=2;i<series.length-2;i++){
    const h=series[i].high;
    if(series.slice(i-2,i).every(b=>b.high<h)&&series.slice(i+1,i+3).every(b=>b.high<=h))highs.push(h);
  }
  const resistance=highs.filter(h=>h>entry+.005).sort((a,b)=>a-b)[0]??null;
  if(resistance!=null)candidates.push({price:floorPrice(resistance-.01),reason:'Nearby resistance (one paisa below)'});
  const typicalRangePct=sample.length>=10&&recent?median(sample.map(b=>(b.high-b.low)/b.close*100)):null;
  // Anchor at the low already observed today: do not grant a fresh full day's range after a large move.
  const reference=context.band?.day===day?context.band.reference:previous?.close;
  const typicalCeiling=typicalRangePct!=null&&reference&&known.length?floorPrice(Math.min(...known.map(b=>b.low))+reference*typicalRangePct/100):null;
  if(typicalCeiling!=null)candidates.push({price:typicalCeiling,reason:'Typical daily range remaining'});
  else warnings.push('Recent daily history (at least 10 candles) and entry-time candles are needed to check typical movement.');

  let band:PriceBand|null=context.band?.day===day?context.band:null,estimatedBand=false;
  // A current quote's band must never be applied to another historical date.
  // Historical standard-band estimate is labelled, not presented as an exchange-issued limit.
  if(!band&&context.standardBandAllowed!==false&&previous&&day>='2024-07-22'&&Date.parse(day)-Date.parse(pktDay(previous.time))<=7*86400000){
    const distance=Math.max(previous.close*.10,1);
    band={day,reference:previous.close,upper:Math.round((previous.close+distance)*100)/100,lower:Math.max(.01,Math.round((previous.close-distance)*100)/100),source:'Standard-band estimate from prior daily close'};
    estimatedBand=true;
    warnings.push('Price band is estimated (10% or Rs. 1 from prior close). Special bands, ex-dates and tick rules require exchange verification.');
  }
  if(band)candidates.push({price:floorPrice(band.upper),reason:estimatedBand?'Estimated upper price limit':'PSX upper price limit'});
  else warnings.push('No date-matched price band or recent prior close: daily limit is unverified.');
  const chosen=candidates.sort((a,b)=>a.price-b.price)[0];
  let target:number|null=chosen.price,reason=chosen.reason;
  if(band&&(entry<band.lower-.005||entry>band.upper+.005)){
    target=null;reason='Entry is outside the available price band';
  }else if(!(target>entry)){
    target=null;reason=`No remaining upside: ${chosen.reason.toLowerCase()}`;
  }
  if(!prior.length)warnings.push('Resistance history is unavailable; the R benchmark alone is not a price forecast.');
  return {day,requested:floorPrice(requested),target,reason,resistance,typicalCeiling,typicalRangePct,sample:sample.length,band,estimatedBand,complete:typicalCeiling!=null&&band!=null,warnings};
}

export function targetSummary(r:TargetReview){
  return `${r.target==null?`No usable intraday target · ${r.reason}`:`Target ${r.target.toFixed(2)} · ${r.reason}`} · R benchmark ${r.requested.toFixed(2)}${r.warnings.length?' · '+r.warnings.join(' '):''}`;
}

/** Parse only the regular-market block; futures/odd-lot bands must not leak into equities. */
export function parsePriceBand(html:string,expectedSymbol?:string):PriceBand|undefined{
  if(expectedSymbol&&html.match(/<title>\s*([A-Z0-9.-]+)\s+-/i)?.[1]!==expectedSymbol)return;
  const date=html.match(/class="quote__date"[^>]*>[^<]*?([A-Z][a-z]{2}),?\s+(\d{1,2}),?\s+(\d{4})/);
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if(!date||!months.includes(date[1]))return;
  const day=`${date[3]}-${String(months.indexOf(date[1])+1).padStart(2,'0')}-${date[2].padStart(2,'0')}`;
  if(!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)return;
  const regular=html.match(/class="tabs__panel"\s+data-name="REG"[^>]*>([\s\S]*?)(?=<div class="tabs__panel"|$)/)?.[1];
  if(!regular)return;
  const range=regular.match(/CIRCUIT BREAKER<\/div>\s*<div class="stats_value">[^<]*<div class="numRange"[^>]*data-low="([\d.]+)"[^>]*data-high="([\d.]+)"/);
  const reference=Number(regular.match(/>LDCP<\/div>\s*<div class="stats_value">([\d,.]+)/)?.[1]?.replace(/,/g,''));
  const lower=Number(range?.[1]),upper=Number(range?.[2]);
  if(![lower,upper,reference].every(n=>Number.isFinite(n)&&n>0)||lower>=upper||reference<lower||reference>upper)return;
  return {day,lower,upper,reference,source:'PSX regular-market quote'};
}
