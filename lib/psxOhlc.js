/**
 * Fetch + parse PSX daily OHLCV from POST /historical
 * (same source pypsx_toolkit.download uses — open/high/low/close/volume).
 */

const HISTORICAL_URL = 'https://dps.psx.com.pk/historical';

const num = (s) => {
  const v = parseFloat(String(s || '').replace(/,/g, '').trim());
  return Number.isFinite(v) ? v : NaN;
};

const MONTH_IDX = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/**
 * Parse PSX historical table dates ("Aug 27, 2026") to a stable UTC ms.
 * Uses 04:00 UTC (= 09:00 Asia/Karachi) so the calendar day never flips
 * when the chart formats labels in Pakistan time.
 */
export function parsePsxHistDate(raw) {
  const s = String(raw || '').trim();
  const named = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (named) {
    const mon = MONTH_IDX[named[1].slice(0, 3).toLowerCase()];
    const day = Number(named[2]);
    const year = Number(named[3]);
    if (mon != null && day >= 1 && day <= 31 && year >= 1990) {
      return Date.UTC(year, mon, day, 4, 0, 0);
    }
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 4, 0, 0);
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : NaN;
}

/**
 * @param {string} html
 * @returns {{ time: number, open: number, high: number, low: number, close: number, volume: number }[]}
 */
export function parsePsxHistoricalHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const rows = [];
  // Prefer tbody rows of #historicalTable; fall back to any OPEN/HIGH/LOW table rows
  const tableMatch = html.match(/id=["']historicalTable["'][\s\S]*?<\/table>/i) || html.match(/<table[\s\S]*?<\/table>/i);
  const chunk = tableMatch ? tableMatch[0] : html;
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(chunk))) {
    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
    );
    if (tds.length < 5) continue;
    // DATE OPEN HIGH LOW CLOSE [VOLUME]
    const time = parsePsxHistDate(tds[0]);
    const open = num(tds[1]);
    const high = num(tds[2]);
    const low = num(tds[3]);
    const close = num(tds[4]);
    const volume = tds.length > 5 ? num(tds[5]) : 0;
    if (!(time > 0) || !(close > 0) || !(open > 0) || !(high > 0) || !(low > 0)) continue;
    rows.push({
      time,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
    });
  }
  // Table is newest-first; sort ascending
  rows.sort((a, b) => a.time - b.time);
  // Dedupe by day
  const byDay = new Map();
  rows.forEach((r) => {
    const day = new Date(r.time).toISOString().slice(0, 10);
    byDay.set(day, r);
  });
  return Array.from(byDay.values()).sort((a, b) => a.time - b.time);
}

/**
 * Server-side (or Node) fetch of full OHLCV history for a symbol.
 * @param {string} symbol
 */
export async function fetchPsxOhlc(symbol) {
  const clean = String(symbol || '')
    .toUpperCase()
    .replace(/^PSX:/, '')
    .trim();
  if (!clean || clean.length > 12) throw new Error('Invalid symbol');

  const body = new URLSearchParams({ symbol: clean }).toString();
  const res = await fetch(HISTORICAL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://dps.psx.com.pk/',
      Origin: 'https://dps.psx.com.pk',
    },
    body,
    redirect: 'follow',
  });

  if (!res.ok) throw new Error(`PSX historical HTTP ${res.status}`);
  const html = await res.text();
  if (/just a moment|cf-chl|challenge-platform/i.test(html)) {
    throw new Error('PSX historical blocked by Cloudflare');
  }
  const bars = parsePsxHistoricalHtml(html);
  if (bars.length < 5) throw new Error(`Only ${bars.length} OHLCV bars for ${clean}`);
  return { symbol: clean, bars, count: bars.length, source: 'psx:historical' };
}

/**
 * Last candle close for each symbol — same PSX /historical feed the chart uses.
 * Batched so alert cron / Sync overlays stay within serverless time limits.
 * @param {string[]} symbols
 * @param {number} [concurrency=4]
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchPsxLatestCloses(symbols, concurrency = 4) {
  const unique = [...new Set(
    (symbols || [])
      .map((s) => String(s || '').toUpperCase().replace(/^PSX:/, '').trim())
      .filter((s) => s && s.length <= 12)
  )];
  /** @type {Record<string, number>} */
  const out = {};
  if (unique.length === 0) return out;

  for (let i = 0; i < unique.length; i += concurrency) {
    const chunk = unique.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (sym) => {
        try {
          const { bars } = await fetchPsxOhlc(sym);
          const last = bars[bars.length - 1];
          if (last && last.close > 0) out[sym] = last.close;
        } catch {
          // Keep market-watch fallback for this symbol.
        }
      })
    );
  }
  return out;
}
