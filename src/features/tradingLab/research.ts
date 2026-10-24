import type {Headline} from './data';
import type {CompanyFinancials} from '../../services/financials';
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
