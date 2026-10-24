import type {FundamentalsData,CompanyFinancials} from '../../services/financials';
// Read only the explicitly labelled PSX financial tables. No report-period inference.
export function parseLabFinancials(html:string):FundamentalsData|null{
  const section=html.match(/id=["']financials["']([\s\S]*?)(?:id=["']ratios["']|$)/i)?.[1];
  if(!section||!/(?:thousands|000['’]?s)[\s\S]{0,50}except EPS/i.test(section))return null;
  const clean=(s:string)=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
  function read(kind:string):CompanyFinancials[]{
    const table=section!.match(new RegExp('class=["\'][^"\']*tabs__panel[^"\']*["\'][^>]*data-name=["\']'+kind+'["\'][\\s\\S]*?<table[^>]*>([\\s\\S]*?)</table>','i'))?.[1];
    if(!table)return [];
    const rows=[...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>clean(c[1])));
    const periods=rows[0]?.slice(1)||[],valid=kind==='Annual'?/^\d{4}$/:/^Q[1-4]\s+\d{4}$/;
    if(!periods.length||periods.some(p=>!valid.test(p)))return [];
    const get=(pattern:RegExp,i:number)=>{const row=rows.find(r=>pattern.test(r[0]));return row?.length===periods.length+1?row[i+1]||'-':'-';};
    return periods.map((year,i)=>({year,sales:get(/^(Sales|Revenue)$/i,i),totalIncome:get(/^Total Income$/i,i),profitAfterTax:get(/^(Profit after Taxation|Profit After Tax|Net Profit)$/i,i),eps:get(/^(EPS|Earnings per share)$/i,i)})).filter(r=>r.eps!=='-'||r.profitAfterTax!=='-');
  }
  const annual=read('Annual'),quarterly=read('Quarterly');return annual.length||quarterly.length?{annual:{financials:annual,ratios:[]},quarterly:{financials:quarterly,ratios:[]}}:null;
}
export async function loadLabFinancials(symbol:string){
  if(!/^[A-Z][A-Z0-9.-]{0,19}$/.test(symbol))throw new Error('Invalid symbol.');
  const {fetchUrlWithFallback}=await import('../../services/psxData');
  const html=await fetchUrlWithFallback(`https://dps.psx.com.pk/company/${symbol}`),data=html?parseLabFinancials(html):null;
  if(data)return {data,dated:true,units:'Amounts in PKR thousands (000s); EPS in PKR per share. PSX / Capital Stake standardized figures.'};
  const {fetchCompanyInfo}=await import('../../services/financials');const profile=await fetchCompanyInfo(symbol),fallback=profile?.statements;
  if(!fallback||(!fallback.annual.financials.length&&!fallback.quarterly.financials.length))throw new Error('No usable financial statements returned. Check the official filings below.');
  return {data:fallback,dated:false,units:'Fallback feed: verify units and reporting periods in the original PSX filing. No period is inferred.'};
}
