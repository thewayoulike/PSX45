import {useEffect,useState} from 'react';
import {ArrowUpRight} from 'lucide-react';
import {safeUrl,type LabData,type Research} from './data';
import {catalystTags,matchHeadlines,newsSector,sectorNewsTerms} from './research';

const when=(value:string)=>{const date=new Date(value);return Number.isNaN(date.getTime())?'Unavailable':date.toLocaleString('en-GB',{timeZone:'Asia/Karachi',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})+' PKT';};
export function LabNews({symbol,research,loading,data}:{symbol:string;research:Research|null;loading:boolean;data:LabData}){
  const [query,setQuery]=useState(''),[mode,setMode]=useState<'all'|'stock'|'sector'|'custom'>('all');
  const [sector,setSector]=useState(()=>newsSector(symbol)),[sectorLoading,setSectorLoading]=useState(true);
  useEffect(()=>{
    let active=true;const controller=new AbortController();
    data.universe(controller.signal).then(market=>{if(active)setSector(newsSector(symbol,market.stocks.find(stock=>stock.symbol===symbol)?.sector));}).catch(()=>{/* Keep the app's existing sector fallback when Market Watch is unavailable. */}).finally(()=>{if(active)setSectorLoading(false);});
    return()=>{active=false;controller.abort();};
  },[symbol,data]);
  const terms=sectorNewsTerms(sector),effectiveQuery=mode==='sector'?terms.join(', '):query;
  const all=research?.news?.items||[];
  const rows=mode==='sector'&&!sector?[]:matchHeadlines(all,effectiveQuery).filter(item=>effectiveQuery.trim()||item.topics?.includes('stocks')).slice(0,30);
  return <article className="lab-panel" aria-label="News & possible catalysts">
    <h2>News & possible catalysts</h2>
    <label className="lab-field"><span>Match headline words · symbol, company or sector, comma separated</span><input value={effectiveQuery} onChange={event=>{setQuery(event.target.value);setMode('custom');}} placeholder={symbol+', company name or sector'}/></label>
    <div className="lab-actions lab-news-filters">
      <button aria-pressed={mode==='stock'} onClick={()=>{setQuery(symbol);setMode('stock');}}>Match {symbol}</button>
      <button aria-pressed={mode==='sector'} disabled={!sector} onClick={()=>setMode('sector')}>Match sector</button>
      <button aria-pressed={mode==='all'} onClick={()=>{setQuery('');setMode('all');}}>All stock-market news</button>
    </div>
    <p className="lab-sector-context">{sector?<>Sector: <strong>{sector}</strong>. {mode==='sector'&&'Showing related headlines across the feed, including commodities and policy news. These may not mention this company.'}</>:sectorLoading?'Looking up this stock’s sector…':'Sector unavailable for this symbol. Enter sector words above to search manually.'}</p>
    <p>Title matching can miss relevant articles or include unrelated ones. Tags flag headline words, not a verified cause of a price move. {research?.news&&`Checked ${when(research.news.checkedAt)}.`}</p>
    {research?.news?.stale&&<p className="lab-warning">The news feed is marked stale.</p>}
    {!!research?.news?.failedFeeds?.length&&<p className="lab-warning">Some publishers could not be refreshed; earlier headlines may remain.</p>}
    <div className="lab-news-grid">{rows.map(item=>{const href=safeUrl(item.url);return <div className="lab-news" key={item.id}>{href?<a href={href} target="_blank" rel="noopener noreferrer">{item.title}<ArrowUpRight size={13}/></a>:<strong>{item.title}</strong>}<div className="lab-tags">{catalystTags(item.title).map(tag=><span className="lab-badge" key={tag}>{tag}</span>)}</div><small>{item.source} · {item.publishedAt?when(item.publishedAt):'Publication time unavailable'}</small></div>;})}</div>
    {!rows.length&&!loading&&<p>{!all.length?'No headlines are available in the current feed.':effectiveQuery.trim()?'No headlines match these words in the current feed. Try editing the terms or choose All stock-market news.':'No stock-market headlines are available in the current feed.'}</p>}
  </article>;
}
