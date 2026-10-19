// Headline links only. Article text and publisher images are never stored or displayed.
// Dataset terms: https://www.gdeltproject.org/about.html#termsofuse
const SOURCES = {
  'brecorder.com': 'Business Recorder', 'dawn.com': 'Dawn',
  'tribune.com.pk': 'The Express Tribune', 'profit.pakistantoday.com.pk': 'Profit',
  'mettisglobal.com': 'Mettis Global', 'mettisglobal.news': 'Mettis Global',
  'reuters.com': 'Reuters', 'apnews.com': 'AP News', 'cnbc.com': 'CNBC',
  'bloomberg.com': 'Bloomberg', 'ft.com': 'Financial Times', 'marketwatch.com': 'MarketWatch',
  'finance.yahoo.com': 'Yahoo Finance', 'investing.com': 'Investing.com',
  'financialpost.com': 'Financial Post', 'businessinsider.com': 'Business Insider',
  'thenews.com.pk': 'The News', 'geo.tv': 'Geo News', 'arynews.tv': 'ARY News',
  'arabnews.pk': 'Arab News Pakistan',
  'english.aaj.tv': 'Aaj English', 'app.com.pk': 'Associated Press of Pakistan',
};
export const NEWS_URL = 'https://raw.githubusercontent.com/thewayoulike/PSX45/codex/market-data/news.json';
export const BUSINESS_RECORDER_RSS_URL = 'https://www.brecorder.com/feeds/latest-news';
export const NEWS_WINDOW_DAYS = 7;
export const BUSINESS_RECORDER_FEEDS = ['latest-news', 'pakistan', 'world', 'markets', 'business-finance', 'technology', 'sports', 'life-style', 'editorials', 'opinion', 'perspectives', 'br-research', 'supplements', 'print'];
const PUBLISHER_CATEGORIES = { Pakistan: 'pakistan', World: 'world', Markets: 'markets', 'Business & Finance': 'business-finance', Technology: 'technology', Sports: 'sports', 'Life & Style': 'life-style', Editorials: 'editorials', Opinion: 'opinion', Perspectives: 'perspectives', 'BR Research': 'br-research', Supplements: 'supplements', Print: 'print' };
const text = value => typeof value === 'string' ? value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#(?:39|x27);/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
export function newsCategory(title) {
  title = title.replace(/\bWest Bank\b/gi, '');
  if (/\b(PSX|KSE[ -]?(?:100|30)|KMI[ -]?30|Pakistan stock exchange|Karachi stocks)\b/i.test(title) || /\bPakistan\b/i.test(title) && /\b(stocks|shares|equities|bourse)\b/i.test(title)) return 'psx';
  if (/\b(rupee|forex|currency|currencies|exchange rate|dollar|interbank)\b/i.test(title)) return 'forex';
  if (/\b(gold|silver|copper|crude|oil|brent|WTI|bullion|commodity|commodities|petrol|diesel|cotton|gas|wheat)\b/i.test(title)) return 'commodities';
  if (/\b(profit|earnings|dividend|company|companies|acquisition|merger|IPO|revenue|quarterly|CEO|sales|cement|fertilis?er|refinery|stocks|share price|equities|bourse)\b/i.test(title)) return 'companies';
  if (/\b(economy|economic|inflation|IMF|GDP|SBP|state bank|policy rate|interest rate|budget|tax|FBR|exports?|imports?|trade|investment|investors?|bank|banking|business|finance|financial|debt|reserves|remittances|fiscal)\b/i.test(title)) return 'economy';
  return null;
}
export function parseMarketNews(raw, now = Date.now()) {
  if (!raw || !Array.isArray(raw.articles)) throw new Error('Invalid news index');
  const seenUrls = new Set(), seenTitles = new Set(), items = [];
  // Publisher timestamps take precedence over index-only versions of the same story.
  const articles = [...raw.articles].sort((a, b) => Number(Boolean(b.publishedAt)) - Number(Boolean(a.publishedAt)) || String(b.seendate).localeCompare(String(a.seendate)));
  for (const row of articles) {
    let url; try { url = new URL(row.url); } catch { continue; }
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (!SOURCES[host] || url.protocol !== 'https:' || url.username || url.password || url.port || row.language !== 'English' || url.pathname.length < 12 || /^\/(?:category|tag|author|topic)\//i.test(url.pathname)) continue;
    const publisherFeed = host === 'brecorder.com' && row.provider === 'Business Recorder RSS';
    const publisherId = publisherFeed ? /^\/news\/(\d+)(?:\/|$)/.exec(url.pathname)?.[1] : null;
    if (publisherFeed && !publisherId) continue;
    const title = text(row.title).replace(/\s*(?:\||-)\s*(?:The Express Tribune|Business Insider)$/i, '');
    const publisherCategory = publisherFeed ? text(row.publisherCategory).slice(0, 80) : '';
    const category = publisherFeed ? (Object.hasOwn(PUBLISHER_CATEGORIES, publisherCategory) ? PUBLISHER_CATEGORIES[publisherCategory] : 'general') : newsCategory(title);
    if (!publisherFeed && /\b(sponsored|paid content|reliable forex broker)\b/i.test(title)) continue;
    if (!category || title.length < (publisherFeed ? 1 : 12) || title.length > 350) continue;
    const stamp = /^([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z$/.exec(row.seendate || '');
    if (!stamp) continue;
    const date = `${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}Z`, time = Date.parse(date);
    if (!Number.isFinite(time) || time > now + 300000 || time < now - NEWS_WINDOW_DAYS * 86400000 || new Date(time).toISOString().slice(0, 19) !== date.slice(0, 19)) continue;
    const published = publisherFeed ? Date.parse(row.publishedAt) : NaN;
    if (publisherFeed && (!Number.isFinite(published) || published > now + 300000 || published < now - NEWS_WINDOW_DAYS * 86400000)) continue;
    url.hash = ''; for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    const href = url.href, key = title.toLowerCase().replace(/[^a-z0-9]/g, ''), identity = publisherId ? `brecorder:${publisherId}` : href;
    if (seenUrls.has(identity) || !publisherFeed && seenTitles.has(key)) continue;
    seenUrls.add(identity); seenTitles.add(key);
    const region = /(?:\.pk$|^(?:brecorder\.com|dawn\.com|mettisglobal\.(?:com|news)|geo\.tv|arynews\.tv|english\.aaj\.tv)$)/.test(host) ? 'Pakistan' : 'Global';
    items.push({ id: href, title, url: href, source: SOURCES[host], sourceDomain: host, category, region, indexedAt: new Date(time).toISOString(), ...(publisherFeed ? { publishedAt: new Date(published).toISOString(), publisherCategory, provider: 'Business Recorder RSS' } : { provider: 'GDELT' }) });
  }
  return items.sort((a, b) => (b.publishedAt || b.indexedAt).localeCompare(a.publishedAt || a.indexedAt));
}
export function parseBusinessRecorderRss(xml, now = Date.now()) {
  if (typeof xml !== 'string' || !/<rss\b/i.test(xml) || !/<channel\b/i.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Invalid publisher feed');
  // Read only headline metadata; ignore descriptions and embedded article bodies.
  const field = (body, tag) => {
    const value = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(body)?.[1]?.trim() || '';
    return text(value.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1'));
  };
  const articles = [];
  const channelCategory = field(xml.split(/<item\b/i)[0], 'title').replace(/^Business Recorder\s*-\s*/i, '');
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const url = field(match[1], 'link');
    if (!/^https:\/\/(?:www\.)?brecorder\.com\/news\/\d+\//i.test(url)) continue;
    const publishedAt = field(match[1], 'pubDate');
    if (!Number.isFinite(Date.parse(publishedAt)) || Date.parse(publishedAt) > now + 300000) continue;
    articles.push({ url, title: field(match[1], 'title'), publisherCategory: field(match[1], 'category') || (Object.hasOwn(PUBLISHER_CATEGORIES, channelCategory) ? channelCategory : ''), publishedAt, language: 'English', provider: 'Business Recorder RSS', seendate: new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z') });
  }
  const items = parseMarketNews({ articles }, now);
  if (!articles.length) throw new Error('No valid publisher headlines');
  return items;
}
export async function fetchBusinessRecorderNews(section = 'latest-news') {
  if (!BUSINESS_RECORDER_FEEDS.includes(section)) throw new Error('Unknown publisher section');
  const response = await fetch(`https://www.brecorder.com/feeds/${section}`, { headers: { Accept: 'application/rss+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Publisher feed HTTP ${response.status}`);
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 2 * 1024 * 1024) throw new Error('Publisher feed is too large'); chunks.push(chunk); }
  return parseBusinessRecorderRss(Buffer.concat(chunks).toString('utf8'));
}
export function mergeNewsItems(items, now = Date.now()) {
  // Revalidate stored metadata as well as newly downloaded records.
  return parseMarketNews({ articles: items.map(item => ({ ...item, language: 'English', seendate: String(item.indexedAt).replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z') })) }, now);
}
let cached = null, expires = 0, pending = null, retryAfter = 0;
export async function fetchMarketNews() {
  if (cached && Date.now() < expires) return cached;
  if (pending) return pending;
  if (Date.now() < retryAfter) throw new Error('News index temporarily unavailable');
  pending = (async () => {
    try {
      const response = await fetch(NEWS_URL, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('News index unavailable');
      const data = await response.json(), updated = Date.parse(data.updatedAt);
      if (!Array.isArray(data.items) || !Number.isFinite(updated) || updated > Date.now() + 300000) throw new Error('Invalid news snapshot');
      cached = { items: mergeNewsItems(data.items).filter(item => item.provider === 'Business Recorder RSS'), checkedAt: data.updatedAt, stale: Date.now() - updated > 4 * 3600000, provider: 'Business Recorder RSS', windowDays: NEWS_WINDOW_DAYS, partial: Boolean(data.partial), businessRecorder: data.businessRecorder || null };
      expires = Date.now() + 900000;
      retryAfter = 0;
      return cached;
    } catch (error) {
      retryAfter = Date.now() + 60000;
      if (!cached || Date.now() - Date.parse(cached.checkedAt) > 86400000) throw error;
      cached = { ...cached, items: mergeNewsItems(cached.items), stale: true };
      expires = Date.now() + 300000;
      return cached;
    }
  })().finally(() => { pending = null; });
  return pending;
}
