// GDELT headline metadata only. Article text and publisher images are never fetched.
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
  for (const row of raw.articles) {
    let url; try { url = new URL(row.url); } catch { continue; }
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (!SOURCES[host] || url.protocol !== 'https:' || url.username || url.password || url.port || row.language !== 'English' || url.pathname.length < 12 || /^\/(?:category|tag|author|topic)\//i.test(url.pathname)) continue;
    const title = text(row.title).replace(/\s*(?:\||-)\s*(?:The Express Tribune|Business Insider)$/i, ''), category = newsCategory(title);
    if (/\b(sponsored|paid content|reliable forex broker)\b/i.test(title)) continue;
    if (!category || title.length < 12 || title.length > 350) continue;
    const stamp = /^([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z$/.exec(row.seendate || '');
    if (!stamp) continue;
    const date = `${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}Z`, time = Date.parse(date);
    if (!Number.isFinite(time) || time > now + 300000 || time < now - 3 * 86400000 || new Date(time).toISOString().slice(0, 19) !== date.slice(0, 19)) continue;
    url.hash = ''; for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    const href = url.href, key = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seenUrls.has(href) || seenTitles.has(key)) continue;
    seenUrls.add(href); seenTitles.add(key);
    const region = /(?:\.pk$|^(?:brecorder\.com|dawn\.com|mettisglobal\.(?:com|news)|geo\.tv|arynews\.tv|english\.aaj\.tv)$)/.test(host) ? 'Pakistan' : 'Global';
    items.push({ id: href, title, url: href, source: SOURCES[host], sourceDomain: host, category, region, indexedAt: new Date(time).toISOString() });
  }
  return items.sort((a, b) => b.indexedAt.localeCompare(a.indexedAt)).slice(0, 120);
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
      cached = { items: mergeNewsItems(data.items), checkedAt: data.updatedAt, stale: Date.now() - updated > 4 * 3600000, provider: 'GDELT', windowDays: 3, partial: Boolean(data.partial) };
      expires = Date.now() + 900000;
      retryAfter = 0;
      return cached;
    } catch (error) {
      retryAfter = Date.now() + 60000;
      if (!cached || Date.now() - Date.parse(cached.checkedAt) > 86400000) throw error;
      cached = { ...cached, items: cached.items.filter(item => Date.now() - Date.parse(item.indexedAt) <= 3 * 86400000), stale: true };
      expires = Date.now() + 300000;
      return cached;
    }
  })().finally(() => { pending = null; });
  return pending;
}
