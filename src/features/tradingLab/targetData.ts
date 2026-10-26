import {parseBars} from './engine';
import {parsePriceBand,type TargetContext} from './targets';

const cache=new Map<string,{expires:number;value:TargetContext}>();
/** Supplementary data may fail without hiding the breakout. Its missing checks remain visible. */
export async function loadTargetContext(symbol:string,signal?:AbortSignal):Promise<TargetContext>{
  if(!/^[A-Z][A-Z0-9.-]{0,19}$/.test(symbol))throw new Error('Invalid PSX symbol.');
  const cached=cache.get(symbol);if(cached&&cached.expires>Date.now())return cached.value;
  const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,25000);
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const read=async(url:string)=>{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw new Error('Target context unavailable');return response.text();};
  try{
    const [history,quote]=await Promise.allSettled([
      read('/api/proxy?ohlc='+encodeURIComponent(symbol)).then(text=>{const raw=JSON.parse(text);if(raw.symbol&&raw.symbol!==symbol)throw new Error('Wrong stock');return parseBars(raw.bars);}),
      read('/api/proxy?url='+encodeURIComponent('https://dps.psx.com.pk/company/'+symbol)).then(html=>parsePriceBand(html,symbol))
    ]);
    const value:TargetContext={...(history.status==='fulfilled'?{daily:history.value}:{}),...(quote.status==='fulfilled'&&quote.value?{band:quote.value}:{}),standardBandAllowed:!symbol.includes('ETF')&&!symbol.includes('-')};
    if(!controller.signal.aborted){cache.delete(symbol);cache.set(symbol,{value,expires:Date.now()+(value.daily?.length&&value.band?300000:30000)});while(cache.size>100)cache.delete(cache.keys().next().value!);}
    return value;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
