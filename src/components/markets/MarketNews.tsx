import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Newspaper, RefreshCw, Search } from 'lucide-react';
import { loadMarketData } from '../../services/marketOverview';

const categories = [['all', 'All'], ['general', 'General'], ['psx', 'PSX'], ['companies', 'Companies'], ['economy', 'Economy'], ['forex', 'Forex'], ['commodities', 'Commodities']] as const;
type Category = typeof categories[number][0];
type Headline = { id: string; title: string; url: string; source: string; sourceDomain: string; category: Category; region: string; indexedAt: string; publishedAt?: string };
type NewsFeed = { items: Headline[]; checkedAt: string; stale: boolean; provider: string; windowDays: number; businessRecorder?: { unavailable: boolean; lastSuccessAt?: string; latestCount?: number } };
const when = (value: string) => new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' PKT';

export function MarketNews({ preview = false, onBrowse }: { preview?: boolean; onBrowse?: () => void }) {
  const [data, setData] = useState<NewsFeed | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0), [category, setCategory] = useState<Category>('all'), [search, setSearch] = useState(''), [limit, setLimit] = useState(12);
  const [publisher, setPublisher] = useState('');
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
  useEffect(() => setLimit(12), [category, search, publisher]);
  const publishers = useMemo(() => [...new Set((data?.items || []).map(item => item.source))].sort(), [data]);
  const filtered = useMemo(() => (data?.items || []).filter(item => (category === 'all' || item.category === category) && (!publisher || item.source === publisher) && `${item.title} ${item.source}`.toLowerCase().includes(search.toLowerCase().trim())), [data, category, search, publisher]);
  const shown = filtered.slice(0, preview ? 6 : limit);
  return <section className={'mk-news' + (preview ? ' mk-news-preview' : '')} aria-label={preview ? 'Latest market headlines' : 'Market news'}>
    <div className="mk-section-heading"><div><span className="mk-eyebrow">IN THE HEADLINES</span><h2>Latest news</h2><p>Pakistan, world affairs, markets and business. All includes general news too.</p></div>
      {preview ? <button onClick={onBrowse}>View all news <ArrowUpRight size={16}/></button> : <button disabled={loading} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={15}/>{loading ? 'Checking…' : 'Refresh news'}</button>}
    </div>
    {!preview && <div className="mk-news-toolbar"><div className="mk-news-filters" role="group" aria-label="News category">{categories.map(([id, label]) => <button key={id} aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</button>)}</div><div className="mk-news-search"><select aria-label="News publisher" value={publisher} onChange={event => setPublisher(event.target.value)}><option value="">All publishers</option>{publishers.map(name => <option key={name}>{name}</option>)}</select><label className="mk-search"><Search size={16}/><input aria-label="Search news" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search headlines or publisher"/></label></div></div>}
    {data?.businessRecorder?.unavailable && <p className="mk-small" role="status">Business Recorder could not refresh.{data.businessRecorder.lastSuccessAt ? ` Last successful check: ${when(data.businessRecorder.lastSuccessAt)}.` : ' Please try again later.'} Previously retrieved headlines remain available.</p>}
    <div className="mk-news-status" role="status"><span>{loading ? 'Checking the latest headlines…' : error || data?.stale ? 'Headlines could not refresh.' + (data?.items.length ? ' Showing previously retrieved headlines.' : ' Please try again shortly.') : `${filtered.length} headline${filtered.length === 1 ? '' : 's'} · Latest ${data?.windowDays || 3} days`}</span>{data?.checkedAt && <time dateTime={data.checkedAt}>Checked {when(data.checkedAt)}</time>}</div>
    {shown.length ? <div className="mk-news-grid">{shown.map(item => <article className="mk-news-card" key={item.id}>
      <div className="mk-news-card-top"><span className="mk-tag">{categories.find(([id]) => id === item.category)?.[1] || 'Markets'} · {item.region || 'Markets'}</span><Newspaper size={18} aria-hidden="true"/></div>
      <h3><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}<ArrowUpRight size={16} aria-hidden="true"/></a></h3>
      <div className="mk-news-card-footer"><strong>{item.source}</strong><time dateTime={item.publishedAt || item.indexedAt}>{item.publishedAt ? 'Published' : 'Indexed'} {when(item.publishedAt || item.indexedAt)}</time><span>Read original story ↗</span></div>
    </article>)}</div> : <div className="mk-news-empty" role="status"><Newspaper size={30}/><h3>{loading ? 'Loading headlines' : error ? 'News is temporarily unavailable' : 'No headlines match this selection'}</h3><p>{loading ? 'Looking for recent stories from the news feeds.' : error ? 'The news provider may be busy. Your market prices remain available.' : 'Try another category or clear your search.'}</p>{!loading && (error ? <button onClick={() => setAttempt(value => value + 1)}>Retry news</button> : <button onClick={() => { setCategory('all'); setSearch(''); setPublisher(''); }}>Show all headlines</button>)}</div>}
    {!preview && shown.length < filtered.length && <div className="mk-news-more"><button onClick={() => setLimit(value => value + 12)}>Show more headlines</button><span>Showing {shown.length} of {filtered.length}</span></div>}
    <p className="mk-small mk-news-attribution">Sources: <a href="https://www.brecorder.com/feeds/latest-news" target="_blank" rel="noopener noreferrer">Business Recorder’s latest RSS headlines ↗</a> and selected financial stories from <a href="https://www.gdeltproject.org/" target="_blank" rel="noopener noreferrer">The GDELT Project ↗</a>. Coverage follows the available feeds, not a complete publisher archive. Published times come from the publisher; indexed times are when a story was observed. Collected hourly, with page checks every 15 minutes. Open the original for the full report.</p>
  </section>;
}
