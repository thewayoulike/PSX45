import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Newspaper, RefreshCw, Search } from 'lucide-react';
import { loadMarketData } from '../../services/marketOverview';
import { MarketPagination, useMarketPagination } from './MarketPagination';

const categories = [['all', 'All news'], ['pakistan', 'Pakistan'], ['world', 'World'], ['markets', 'Markets'], ['business-finance', 'Business & Finance'], ['technology', 'Technology'], ['sports', 'Sports'], ['life-style', 'Life & Style'], ['editorials', 'Editorials'], ['opinion', 'Opinion'], ['perspectives', 'Perspectives'], ['br-research', 'BR Research'], ['supplements', 'Supplements'], ['print', 'Print edition'], ['general', 'Other']] as const;
type Category = typeof categories[number][0];
type Headline = { id: string; title: string; url: string; source: string; sourceDomain: string; category: Category; publisherCategory?: string; indexedAt: string; publishedAt?: string; provider?: string };
type NewsFeed = { items: Headline[]; checkedAt: string; stale: boolean; provider: string; windowDays: number; businessRecorder?: { unavailable: boolean; lastSuccessAt?: string; latestCount?: number; failedFeeds?: string[] } };
const when = (value: string) => new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' PKT';

export function MarketNews({ preview = false, onBrowse }: { preview?: boolean; onBrowse?: () => void }) {
  const [data, setData] = useState<NewsFeed | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0), [category, setCategory] = useState<Category>('all'), [search, setSearch] = useState('');
  const resultsStart = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true; setLoading(true); setError(false);
    loadMarketData('news', attempt > 0).then(result => {
      if (!Array.isArray(result.data?.items)) throw new Error('Invalid news response');
      if (active) setData(result.data);
    }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') setAttempt(value => value + 1); }, 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  const filtered = useMemo(() => (data?.items || []).filter(item => item.sourceDomain === 'brecorder.com' && item.provider === 'Business Recorder RSS' && (category === 'all' || item.category === category) && `${item.title} ${item.publisherCategory || ''}`.toLowerCase().includes(search.toLowerCase().trim())), [data, category, search]);
  const pages = useMarketPagination(filtered, `${category}|${search}`);
  const shown = preview ? filtered.slice(0, 6) : pages.rows;
  return <section className={'mk-news' + (preview ? ' mk-news-preview' : '')} aria-label={preview ? 'Latest market headlines' : 'Market news'}>
    <div className="mk-section-heading"><div><span className="mk-eyebrow">BUSINESS RECORDER</span><h2>Latest news across all sections</h2><p>Pakistan, world, business, technology, sports and more.</p></div>
      {preview ? <button onClick={onBrowse}>View all news <ArrowUpRight size={16}/></button> : <button disabled={loading} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={15}/>{loading ? 'Checking…' : 'Refresh news'}</button>}
    </div>
    {!preview && <div className="mk-news-toolbar"><div className="mk-news-filters" role="group" aria-label="News category">{categories.map(([id, label]) => <button key={id} aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</button>)}</div><div className="mk-news-search"><label className="mk-search"><Search size={16}/><input aria-label="Search news" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search Business Recorder headlines"/></label><a href="https://www.brecorder.com/latest-news" target="_blank" rel="noopener noreferrer">Browse Business Recorder’s full site ↗</a></div></div>}
    {data?.businessRecorder?.unavailable && <p className="mk-small" role="status">Some Business Recorder sections could not refresh.{data.businessRecorder.lastSuccessAt ? ` Last complete check: ${when(data.businessRecorder.lastSuccessAt)}.` : ' Please try again later.'} Previously retrieved headlines remain available.</p>}
    <div className="mk-news-status" role="status"><span>{loading ? 'Checking the latest headlines…' : error || data?.stale ? 'Headlines could not refresh.' + (data?.items.length ? ' Showing previously retrieved headlines.' : ' Please try again shortly.') : `${filtered.length} headline${filtered.length === 1 ? '' : 's'} collected · Past ${data?.windowDays || 7} days · Updated hourly`}</span>{data?.checkedAt && <time dateTime={data.checkedAt}>Checked {when(data.checkedAt)}</time>}</div>
    {!preview && shown.length > 0 && <div ref={resultsStart} className="mk-table-top"><MarketPagination pagination={pages} label="Headlines" position="top"/></div>}
    {shown.length ? <div className="mk-news-grid">{shown.map(item => <article className="mk-news-card" key={item.id}>
      <div className="mk-news-card-top"><span className="mk-tag">{item.publisherCategory || categories.find(([id]) => id === item.category)?.[1] || 'News'}</span><Newspaper size={18} aria-hidden="true"/></div>
      <h3><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}<ArrowUpRight size={16} aria-hidden="true"/></a></h3>
      <div className="mk-news-card-footer"><strong>{item.source}</strong><time dateTime={item.publishedAt || item.indexedAt}>{when(item.publishedAt || item.indexedAt)}</time><span>Read original story ↗</span></div>
    </article>)}</div> : <div className="mk-news-empty" role="status"><Newspaper size={30}/><h3>{loading ? 'Loading headlines' : error ? 'News is temporarily unavailable' : 'No headlines match this selection'}</h3><p>{loading ? 'Looking for recent stories from the news feeds.' : error ? 'The news provider may be busy. Your market prices remain available.' : 'Try another category or clear your search.'}</p>{!loading && (error ? <button onClick={() => setAttempt(value => value + 1)}>Retry news</button> : <button onClick={() => { setCategory('all'); setSearch(''); }}>Show all headlines</button>)}</div>}
    {!preview && shown.length > 0 && <MarketPagination pagination={pages} label="Headlines" position="bottom" onNavigate={() => resultsStart.current?.scrollIntoView({ block: 'start' })}/>}
    <p className="mk-small mk-news-attribution">Source: <a href="https://www.brecorder.com/latest-news" target="_blank" rel="noopener noreferrer">Business Recorder ↗</a>. All categories from its available section feeds are included, with collected headlines kept for seven days. Each feed provides a limited selection of recent stories, so this is not the full site archive. Categories and times come from the publisher; times may reflect story updates. Refreshed hourly; this page checks every 15 minutes. Open a headline to read the full article on Business Recorder.</p>
  </section>;
}
