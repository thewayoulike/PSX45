import type {Headline} from './data';
import type {CompanyFinancials} from '../../services/financials';
import {getSector,SECTOR_CODE_MAP} from '../../services/sectors';
export function newsSector(symbol:string,marketSector?:string){
  const value=(marketSector||getSector(symbol)).trim();
  return /^(other|miscellaneous|unclassified|watchlist)(\b|\s*\/)/i.test(value)?'':(SECTOR_CODE_MAP[value]||value);
}
/** Related headline vocabulary, not a claim that a story affects this company. */
export function sectorNewsTerms(sector:string):string[]{
  if(!sector)return [];
  const groups:[RegExp,string[]][]=[
    [/oil|gas|refiner/i,['oil','crude','petroleum','natural gas','gas prices','gas supply','gas exports','gas imports','gas exploration','gas production','gas reserves','gas discovery','gas sector','gas firm','gas tariff','gas tariffs','LNG','OPEC','refinery','refineries','fuel prices']],
    [/commercial bank/i,['bank','banks','banking','SBP','State Bank','interest rate','interest rates','monetary policy']],
    [/inv\.|investment|securities/i,['investment bank','investment banks','securities','brokerage','capital market','capital markets','SECP']],
    [/cement/i,['cement','construction','clinker']],
    [/fertili[sz]/i,['fertilizer','fertiliser','fertilizers','fertilisers','urea','DAP','agriculture']],
    [/power|electricity/i,['power sector','power tariff','power tariffs','electricity','NEPRA','IPP','IPPs','circular debt']],
    [/textile|synthetic|rayon|apparel|wool|jute/i,['textile','textiles','cotton','yarn','garment','garments','apparel','weaving','spinning']],
    [/automobile/i,['automobile','automobiles','auto sector','car sales','auto sales','vehicle','vehicles','automotive']],
    [/technology|communication/i,['technology','IT exports','IT sector','software','telecom','telecommunications','broadband']],
    [/pharma/i,['pharmaceutical','pharmaceuticals','pharma','medicine','medicines','drug prices','DRAP']],
    [/chemical/i,['chemical','chemicals','petrochemical','petrochemicals']],
    [/sugar/i,['sugar','sugarcane']],
    [/food|personal care|vanaspati/i,['food industry','food prices','edible oil','palm oil','consumer goods','FMCG']],
    [/engineering/i,['engineering','steel','iron','industrial production']],
    [/cable|electrical goods/i,['electrical goods','cables','copper','appliances']],
    [/glass|ceramic/i,['glass','ceramics','ceramic','construction']],
    [/insurance/i,['insurance','insurers','takaful']],
    [/leas/i,['leasing','lease financing']],
    [/leather|tanner/i,['leather','tannery','tanneries','footwear']],
    [/modaraba/i,['modaraba','modarabas','Islamic finance']],
    [/paper|packaging/i,['paper industry','paper prices','packaging','paperboard']],
    [/tobacco/i,['tobacco','cigarette','cigarettes']],
    [/transport/i,['transport','shipping','freight','logistics','airline','airlines']],
    [/real estate|property|reit/i,['real estate','property sector','REIT','REITs','housing','construction']],
    [/fund/i,['mutual fund','mutual funds','ETF','ETFs','asset management']],
  ];
  return [...new Set([sector,...(groups.find(([pattern])=>pattern.test(sector))?.[1]||[])])];
}
export function matchHeadlines(items:Headline[],query:string){
  const needles=query.toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
  return items.filter(n=>!needles.length||needles.some(term=>new RegExp('(^|[^a-z0-9])'+term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^a-z0-9]|$)','i').test(n.title)));
}
export function catalystTags(title:string){
  const categories:[string,RegExp][]=[['Earnings',/\b(earnings|financial results|revenue|net profit|quarterly profit|posts?\b.{0,30}\bprofit)\b/i],['Payout',/\b(dividend|bonus|payout|buyback)\b/i],['Company event',/\b(merger|acquisition|contract|expansion|rights issue)\b/i],['Policy / economy',/\b(interest rate|rate cut|rate hike|inflation|tax reform|tax hike|budget|imf|policy)\b/i]];
  return categories.filter(([,pattern])=>pattern.test(title)).map(([label])=>label);
}
export function annualChanges(rows:CompanyFinancials[]){
  const annual=rows.filter(r=>/^\d{4}$/.test(r.year)).sort((a,b)=>Number(b.year)-Number(a.year));
  if(annual.length<2||Number(annual[0].year)-Number(annual[1].year)!==1)return [];
  const [latest,prior]=annual,read=(s:string)=>{const text=s.replace(/,/g,'').trim();if(!/^\(?-?\d+(\.\d+)?\)?$/.test(text))return null;const n=Number(text.replace(/[()]/g,''));return text.startsWith('(')?-n:n;};
  return (['sales','profitAfterTax','eps'] as const).flatMap(key=>{
    const a=read(latest[key]),b=read(prior[key]);if(a==null||b==null)return [];
    return [{key,latest:latest.year,prior:prior.year,current:a,previous:b,changePct:b>0?(a-b)/b*100:null}];
  });
}
