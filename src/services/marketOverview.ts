import { SECTOR_CODE_MAP } from './sectors';
import type { MutualFundRecord } from './mufapData';

export type MarketStock = { symbol: string; name: string; sector: string; indices: string[]; price: number; change: number | null; marketCap: number | null; freeFloatCap: number | null; volume: number | null; high: number | null; low: number | null; previous: number | null };
export type MarketIndex = { symbol: string; price: number; change: number | null; points: number | null; high: number | null; low: number | null };
export type CryptoQuote = { id: string; symbol: string; name: string; price: number; change: number | null; cap: number | null; volume: number | null; updatedAt: string | null };
export type FundCatalog = { funds: MutualFundRecord[]; reportDate: string | null; updatedAt: string | null };
export type FxRates = { rates: Record<string, number>; date: string | null };
export type Metals = { gold: number | null; silver: number | null; date: string | null };
export type CommodityQuote = { id: string; name: string; price: number | null; date: string | null; unit: string; frequency: 'Daily' | 'Monthly'; source: string; sourceUrl: string };
export type CommodityBenchmarks = { quotes: CommodityQuote[] };
export type MarketResult<T> = { data: T; retrievedAt: string };

export function marketNumber(value: unknown): number | null {
  if (value == null || String(value).trim() === '' || ['—', '-', 'N/A'].includes(String(value).trim())) return null;
  const n = Number(String(value).replace(/,/g, '').replace(/%$/, '').trim());
  return Number.isFinite(n) ? n : null;
}
const positive = (value: unknown) => { const n = marketNumber(value); return n != null && n > 0 ? n : null; };
export function marketTableMarkup(html: string): string {
  // Keep only table structure and the four data attributes we actually read.
  // Discard upstream handlers/styles before the browser parses attributes:
  // even detached documents can report CSP violations while parsing them.
  return (html.match(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi) || []).join('')
    .replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?[a-z][\w:-]*\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, tag => {
      const head = tag.match(/^<(\/?)([\w:-]+)/)!;
      const name = head[2].toLowerCase();
      if (!['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'a', 'span'].includes(name)) return '';
      if (head[1]) return `</${name}>`;
      const attrs: string[] = [];
      const rawAttrs = tag.slice(head[0].length, -1);
      for (const match of rawAttrs.matchAll(/([^\s=<>/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        const key = match[1].toLowerCase();
        if (!['data-name', 'data-order', 'data-title', 'data-code'].includes(key)) continue;
        const value = (match[2] ?? match[3] ?? match[4] ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        attrs.push(`${key}="${value}"`);
      }
      return `<${name}${attrs.length ? ' ' + attrs.join(' ') : ''}>`;
    });
}
function marketTableContent(html: string): DocumentFragment {
  // Template contents have an inert owner document: upstream handlers and
  // resources are not activated. Read values only; never mount these nodes.
  const template = document.createElement('template');
  template.innerHTML = marketTableMarkup(html);
  return template.content;
}
function tableRows(html: string) {
  return Array.from(marketTableContent(html).querySelectorAll('table')).flatMap(table => {
    const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.getAttribute('data-name') || th.textContent?.trim().toLowerCase() || '');
    return Array.from(table.querySelectorAll('tbody tr')).map(tr => {
      const cells = Array.from(tr.querySelectorAll('td'));
      const values: Record<string, string> = {};
      headers.forEach((key, i) => { if (cells[i]) values[key] = cells[i].getAttribute('data-order') ?? cells[i].textContent?.trim() ?? ''; });
      return { values, cells };
    });
  });
}
export function parseMarketStocks(watchHtml: string, screenerHtml: string): MarketStock[] {
  const caps = new Map<string, { cap: number | null; freeFloat: number | null }>();
  for (const { values: v } of tableRows(screenerHtml)) {
    if (v.symbol) caps.set(v.symbol.trim(), { cap: positive(v.marketCap), freeFloat: positive(v.freeFloat) });
  }
  const stocks = new Map<string, MarketStock>();
  for (const { values: v, cells } of tableRows(watchHtml)) {
    const symbol = v.symbol?.trim();
    const price = positive(v.close), previous = positive(v.ldcp);
    if (!symbol || !/^[A-Z0-9][A-Z0-9.-]{0,19}$/.test(symbol) || !price) continue;
    const c = caps.get(symbol);
    stocks.set(symbol, { symbol, name: cells[0]?.querySelector('a')?.getAttribute('data-title') || symbol,
      sector: SECTOR_CODE_MAP[v.sector] || v.sector || 'Unclassified', indices: (v.listed || '').split(',').map(x => x.trim()).filter(Boolean),
      price, previous, change: previous ? (price / previous - 1) * 100 : marketNumber(v.percentChange),
      marketCap: c?.cap ?? null, freeFloatCap: c?.freeFloat ? c.freeFloat * price : null,
      volume: marketNumber(v.volume), high: positive(v.high), low: positive(v.low) });
  }
  return [...stocks.values()];
}
export function parseMarketIndices(html: string): MarketIndex[] {
  return tableRows(html).flatMap(({ values: v, cells }) => {
    const symbol = cells[0]?.querySelector('[data-code]')?.getAttribute('data-code');
    const price = positive(v.current);
    return symbol && price ? [{ symbol, price, high: positive(v.high), low: positive(v.low), points: marketNumber(v.change), change: marketNumber(v['% change']) }] : [];
  });
}
export function parseCryptoQuotes(raw: unknown): CryptoQuote[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(r => { const price = positive(r?.current_price); return price && r.id && r.symbol ? [{ id: String(r.id), symbol: String(r.symbol).toUpperCase(), name: String(r.name || r.symbol), price, change: marketNumber(r.price_change_percentage_24h), cap: positive(r.market_cap), volume: marketNumber(r.total_volume), updatedAt: typeof r.last_updated === 'string' ? r.last_updated : null }] : []; });
}
export function parseFx(raw: any): FxRates {
  if (raw?.result !== 'success' || !positive(raw?.rates?.PKR)) throw new Error('Exchange rates are unavailable.');
  const rates: Record<string, number> = {};
  for (const [code, value] of Object.entries(raw.rates)) { const n = positive(value); if (n && /^[A-Z]{3}$/.test(code)) rates[code] = n; }
  return { rates, date: typeof raw.time_last_update_utc === 'string' ? raw.time_last_update_utc : null };
}
export function convertMarketCurrency(amount: number, from: string, to: string, rates: Record<string, number>): number | null {
  if (!Number.isFinite(amount) || amount < 0 || !(rates[from] > 0) || !(rates[to] > 0)) return null;
  return amount / rates[from] * rates[to];
}
export function parseMetals(raw: any): Metals {
  const xau = positive(raw?.usd?.xau), xag = positive(raw?.usd?.xag);
  if (!xau && !xag) throw new Error('Metal reference rates are unavailable.');
  return { gold: xau ? 1 / xau : null, silver: xag ? 1 / xag : null, date: typeof raw.date === 'string' ? raw.date : null };
}
export function metalUnitValue(usdOunce: number, unit: 'ounce' | 'tola' | 'gram', currency: 'USD' | 'PKR', pkr?: number): number | null {
  if (!(usdOunce > 0) || (currency === 'PKR' && !(pkr! > 0))) return null;
  return usdOunce * (unit === 'gram' ? 1 / 31.1034768 : unit === 'tola' ? 11.6638038 / 31.1034768 : 1) * (currency === 'PKR' ? pkr! : 1);
}
export function stockWeight(stock: MarketStock, basis: 'float' | 'cap' | 'equal'): number {
  return basis === 'equal' ? 1 : Math.max(0, (basis === 'float' ? stock.freeFloatCap : stock.marketCap) ?? 0);
}
export function marketBreadth(rows: MarketStock[]) {
  return { up: rows.filter(r => r.change != null && r.change > 0).length, down: rows.filter(r => r.change != null && r.change < 0).length, flat: rows.filter(r => r.change === 0).length, unknown: rows.filter(r => r.change == null).length };
}
export function parseMarketHistory(raw: any) {
  const unique = new Map<number, number>();
  for (const row of Array.isArray(raw?.data) ? raw.data : []) {
    const time = positive(row[0]), price = positive(row.length >= 5 ? row[4] : row[1]);
    if (time && price) unique.set(time * 1000, price);
  }
  return [...unique].map(([time, price]) => ({ time, price })).sort((a, b) => a.time - b.time);
}
const cache = new Map<string, { expires: number; promise: Promise<MarketResult<any>> }>();
async function request(url: string, format: 'text' | 'json' = 'json'): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) throw new Error('The market provider is temporarily unavailable.');
    return format === 'text' ? await r.text() : await r.json();
  } finally { clearTimeout(timer); }
}
const portal = (path: string, format: 'text' | 'json' = 'text') => request(`/api/proxy?url=${encodeURIComponent('https://dps.psx.com.pk' + path)}`, format);
export async function loadMarketData(kind: string, force = false): Promise<MarketResult<any>> {
  const existing = cache.get(kind);
  if (!force && existing && existing.expires > Date.now()) return existing.promise;
  const promise = (async () => {
    let data: any; let retrievedAt = new Date().toISOString();
    if (kind === 'stocks') {
      const [watch, screener] = await Promise.all([portal('/market-watch'), portal('/screener').catch(() => '')]);
      data = parseMarketStocks(watch, screener);
      if (!data.length) throw new Error('Stock prices could not be read. Please retry.');
    } else if (kind === 'indices') {
      data = parseMarketIndices(await portal('/indices'));
      if (!data.length) throw new Error('Index quotes are unavailable.');
    } else if (kind === 'funds') {
      const raw = await request('/api/fund-nav');
      const funds = Object.values(raw?.catalog || {}).filter((f: any) => f?.id && positive(f.nav)) as MutualFundRecord[];
      if (!funds.length) throw new Error('Fund NAVs are unavailable.');
      data = { funds, reportDate: raw.reportDate || null, updatedAt: raw.updatedAt || null };
    } else if (kind.startsWith('history:')) {
      const symbol = kind.slice(8);
      if (!/^[A-Z0-9][A-Z0-9.-]{0,19}$/.test(symbol)) throw new Error('Invalid symbol');
      data = parseMarketHistory(await portal(`/timeseries/eod/${symbol}`, 'json'));
      if (data.length < 2) throw new Error('Price history is unavailable.');
    } else {
      const raw = await request(`/api/proxy?feed=${encodeURIComponent(kind)}`);
      retrievedAt = raw.retrievedAt || retrievedAt;
      data = kind === 'crypto' ? parseCryptoQuotes(raw.data) : kind === 'fx' ? parseFx(raw.data) : kind === 'commodities' ? raw.data as CommodityBenchmarks : parseMetals(raw.data);
      if (Array.isArray(data) && !data.length) throw new Error('Quotes are unavailable.');
    }
    return { data, retrievedAt };
  })().catch(error => { cache.delete(kind); throw error; });
  cache.set(kind, { expires: Date.now() + 300000, promise });
  return promise;
}
