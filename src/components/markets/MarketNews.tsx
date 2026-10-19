import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Newspaper, RefreshCw, Search } from 'lucide-react';
import { loadMarketData } from '../../services/marketOverview';
import { MarketPagination, useMarketPagination } from './MarketPagination';

const topics = [['all', 'All news'], ['stocks', 'Stock markets'], ['commodities', 'Commodities'], ['forex', 'Forex'], ['crypto', 'Crypto']] as const;
type Topic = typeof topics[number][0];
type Headline = { id: string; title: string; url: string; source: string; sourceDomain: string; category: string; topics?: string[]; region: string; publisherCategory?: string; indexedAt: string; publishedAt?: string };
type NewsFeed = { items: Headline[]; checkedAt: string; stale: boolean; windowDays: number; failedFeeds?: string[] };
const when = (value: string) => new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' PKT';
const topicLabel = (item: Headline) => topics.find(([id]) => item.topics?.includes(id))?.[1] || item.publisherCategory || 'News';

export function MarketNews({ preview = false, onBrowse }: { preview?: boolean; onBrowse?: () => void }) {
  const [data, setData] = useState<NewsFeed | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0), [topic, setTopic] = useState<Topic>('all'), [search, setSearch] = useState('');
  const [region, setRegion] = useState('all'), [source, setSource] = useState('all'), [section, setSection] = useState('all');
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
  const sources = useMemo(() => [...new Set(data?.items.map(item => item.source) || [])].sort(), [data]);
  const sections = useMemo(() => [...new Set((data?.items.map(item => item.publisherCategory).filter(Boolean) || []) as string[])].sort(), [data]);
  const filtered = useMemo(() => (data?.items || []).filter(item => (topic === 'all' || item.topics?.includes(topic)) && (region === 'all' || item.region === region) && (source === 'all' || item.source === source) && (section === 'all' || item.publisherCategory === section) && `${item.title} ${item.source} ${item.publisherCategory || ''}`.toLowerCase().includes(search.toLowerCase().trim())), [data, topic, region, source, section, search]);
  const pages = useMarketPagination(filtered, `${topic}|${region}|${source}|${section}|${search}`);
  const shown = preview ? filtered.slice(0, 6) : pages.rows;
  const sourceCount = new Set(filtered.map(item => item.source)).size;
  const reset = () => { setTopic('all'); setRegion('all'); setSource('all'); setSection('all'); setSearch(''); };
  return <section className={'mk-news' + (preview ? ' mk-news-preview' : '')} aria-label={preview ? 'Latest market headlines' : 'Market news'}>
    <div className="mk-section-heading"><div><span className="mk-eyebrow">THE NEWS DESK</span><h2>News that moves the markets</h2><p>Pakistan and global headlines, from multiple publishers.</p></div>
      {preview ? <button onClick={onBrowse}>View all news <ArrowUpRight size={16}/></button> : <button disabled={loading} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={15}/>{loading ? 'Checking…' : 'Refresh news'}</button>}
    </div>
    {!preview && <div className="mk-news-toolbar">
      <div className="mk-news-filters mk-news-topics" role="group" aria-label="News topic">{topics.map(([id, label]) => <button key={id} aria-pressed={topic === id} onClick={() => { setTopic(id); setSection('all'); }}>{label}</button>)}</div>
      <div className="mk-news-controls">
        <div className="mk-news-filters" role="group" aria-label="Publisher region">{[['all', 'All publishers'], ['Pakistan', 'Pakistan publishers'], ['Global', 'Global publishers']].map(([id, label]) => <button key={id} aria-pressed={region === id} onClick={() => setRegion(id)}>{label}</button>)}</div>
        <label className="mk-search"><Search size={16}/><input aria-label="Search news" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search headlines or publishers"/></label>
        <select aria-label="News publisher" value={source} onChange={event => setSource(event.target.value)}><option value="all">All sources</option>{sources.map(name => <option key={name}>{name}</option>)}</select>
        {topic === 'all' && <select aria-label="Publisher section" value={section} onChange={event => setSection(event.target.value)}><option value="all">All sections</option>{sections.map(name => <option key={name}>{name}</option>)}</select>}
      </div>
    </div>}
    {!!data?.failedFeeds?.length && <p className="mk-small" role="status">Some publishers could not refresh. Their previously collected headlines remain available.</p>}
    <div className="mk-news-status" role="status"><span>{loading ? 'Checking the latest headlines…' : error || data?.stale ? 'Headlines could not refresh.' + (data?.items.length ? ' Showing previously retrieved headlines.' : ' Please try again shortly.') : `${filtered.length} headline${filtered.length === 1 ? '' : 's'} · ${sourceCount} source${sourceCount === 1 ? '' : 's'} · Past ${data?.windowDays || 7} days`}</span>{data?.checkedAt && <time dateTime={data.checkedAt}>Checked {when(data.checkedAt)} · Updated hourly</time>}</div>
    {!preview && shown.length > 0 && <div ref={resultsStart} className="mk-table-top"><MarketPagination pagination={pages} label="Headlines" position="top"/></div>}
    {shown.length ? <div className={preview ? 'mk-news-grid' : 'mk-news-stream'}>{shown.map((item, index) => <article className={'mk-news-card' + (!preview && index === 0 ? ' mk-news-lead' : '')} key={item.id}>
      <div className="mk-news-card-top"><span className="mk-tag">{!preview && index === 0 && pages.page === 1 ? 'Latest · ' : ''}{topicLabel(item)}</span><Newspaper size={18} aria-hidden="true"/></div>
      <h3><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}<ArrowUpRight size={16} aria-hidden="true"/></a></h3>
      <div className="mk-news-card-footer"><strong>{item.source}</strong><time dateTime={item.publishedAt || item.indexedAt}>{!item.publishedAt && 'Collected '}{when(item.publishedAt || item.indexedAt)}</time><span>Read original story ↗</span></div>
    </article>)}</div> : <div className="mk-news-empty" role="status"><Newspaper size={30}/><h3>{loading ? 'Loading headlines' : error ? 'News is temporarily unavailable' : 'No headlines match this selection'}</h3><p>{loading ? 'Looking for recent stories from the news feeds.' : error ? 'Please try refreshing shortly.' : 'Try another topic, publisher or search.'}</p>{!loading && (error ? <button onClick={() => setAttempt(value => value + 1)}>Retry</button> : <button onClick={reset}>Clear filters</button>)}</div>}
    {!preview && shown.length > 0 && <MarketPagination pagination={pages} label="Headlines" position="bottom" onNavigate={() => resultsStart.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}/>}
    <p className="mk-small mk-news-attribution">Headlines from {sources.length ? sources.join(', ') : 'public publisher feeds'}. Read each full story on its publisher’s website. All news includes general coverage; market topics are grouped automatically from headlines and feed sections. Times are supplied by publishers and may reflect updates. Feeds refresh hourly and keep seven days of collected headlines, not each publisher’s full archive.</p>
  </section>;
}
