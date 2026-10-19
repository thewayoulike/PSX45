// GDELT headline metadata only. Article text and publisher images are never fetched.
// Dataset terms: https://www.gdeltproject.org/about.html#termsofuse
const SOURCES = {
  'brecorder.com': 'Business Recorder', 'dawn.com': 'Dawn',
  'tribune.com.pk': 'The Express Tribune', 'profit.pakistantoday.com.pk': 'Profit',
  'mettisglobal.com': 'Mettis Global', 'mettisglobal.news': 'Mettis Global',
};
const QUERY = '(domainis:brecorder.com OR domainis:dawn.com OR domainis:tribune.com.pk OR domainis:profit.pakistantoday.com.pk OR domainis:mettisglobal.news) (PSX OR stocks OR economy OR inflation OR rupee OR gold OR oil OR earnings OR bank OR business) sourcelang:english';
export const NEWS_URL = 'https://api.gdeltproject.org/api/v2/doc/doc?' + new URLSearchParams({ query: QUERY, mode: 'artlist', format: 'json', maxrecords: '250', timespan: '3d', sort: 'datedesc' });
const text = value => typeof value === 'string' ? value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#(?:39|x27);/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
export function newsCategory(title) {
  if (/\b(PSX|KSE[ -]?(?:100|30)|KMI[ -]?30|stock exchange|stocks|shares|equities|bourse)\b/i.test(title)) return 'psx';
  if (/\b(rupee|forex|currency|currencies|exchange rate|dollar|interbank)\b/i.test(title)) return 'forex';
  if (/\b(gold|silver|copper|crude|oil|brent|WTI|bullion|commodity|commodities|petrol|diesel|cotton|gas|wheat)\b/i.test(title)) return 'commodities';
  if (/\b(profit|earnings|dividend|company|companies|acquisition|merger|IPO|revenue|quarterly|CEO|board|sales|cement|fertilis?er|refinery)\b/i.test(title)) return 'companies';
  if (/\b(economy|economic|inflation|IMF|GDP|SBP|state bank|policy rate|interest rate|budget|tax|FBR|exports?|imports?|trade|investment|investors?|bank|banking|business|finance|financial|debt|reserves|remittances|fiscal)\b/i.test(title)) return 'economy';
  return null;
}
export function parseMarketNews(raw, now = Date.now()) {
  if (!raw || !Array.isArray(raw.articles)) throw new Error('Invalid news index');
  const seenUrls = new Set(), seenTitles = new Set(), items = [];
  for (const row of raw.articles) {
    let url; try { url = new URL(row.url); } catch { continue; }
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (!SOURCES[host] || url.protocol !== 'https:' || url.username || url.password || url.port || row.language !== 'English') continue;
    const title = text(row.title), category = newsCategory(title);
    if (!category || title.length < 12 || title.length > 350) continue;
    const stamp = /^([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z$/.exec(row.seendate || '');
    if (!stamp) continue;
    const date = `${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}Z`, time = Date.parse(date);
    if (!Number.isFinite(time) || time > now + 300000 || time < now - 3 * 86400000 || new Date(time).toISOString().slice(0, 19) !== date.slice(0, 19)) continue;
    url.hash = ''; for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    const href = url.href, key = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seenUrls.has(href) || seenTitles.has(key)) continue;
    seenUrls.add(href); seenTitles.add(key);
    items.push({ id: href, title, url: href, source: SOURCES[host], sourceDomain: host, category, indexedAt: new Date(time).toISOString() });
  }
  return items.sort((a, b) => b.indexedAt.localeCompare(a.indexedAt)).slice(0, 120);
}
let cached = null, expires = 0, pending = null;
export async function fetchMarketNews() {
  if (cached && Date.now() < expires) return cached;
  if (pending) return pending;
  pending = (async () => {
    try {
      const response = await fetch(NEWS_URL, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error('News index unavailable');
      const items = parseMarketNews(await response.json());
      cached = { items, checkedAt: new Date().toISOString(), stale: false, provider: 'GDELT', windowDays: 3 };
      expires = Date.now() + 900000;
      return cached;
    } catch (error) {
      if (!cached || Date.now() - Date.parse(cached.checkedAt) > 86400000) throw error;
      cached = { ...cached, items: cached.items.filter(item => Date.now() - Date.parse(item.indexedAt) <= 3 * 86400000), stale: true };
      expires = Date.now() + 300000;
      return cached;
    }
  })().finally(() => { pending = null; });
  return pending;
}
