/**
 * Quick sanity check for convert in/out holdings math.
 * Run: node scripts/test-convert-holdings.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalogPath = join(__dirname, '../public/data/fund-nav-catalog.json');
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')).catalog;

const MDIP = 'MF:al-meezan-investment-management-limited-meezan-daily-income-fund-mdip-i-shariah-compliant-income';
const MAHANA = 'MF:al-meezan-investment-management-limited-meezan-daily-income-fund-meezan-mahana-munafa-plan-shari';
const LEGACY_MDIP = 'MF:legacy-mdip-import-slug';

// Inline minimal copies of key logic (mirrors fundMatch + holdings engine)
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function matchCatalogByLabel(label, cat) {
  const nl = norm(label);
  const entries = Object.values(cat);
  const exact = entries.find((f) => norm(f.fundName) === nl);
  if (exact) return exact.id;
  const partial = entries.filter((f) => {
    const fn = norm(f.fundName);
    return fn.includes(nl) || nl.includes(fn);
  });
  if (partial.length === 1) return partial[0].id;
  return undefined;
}

function buildCanonMap(transactions, cat, displayNames = {}) {
  const map = new Map();
  for (const id of Object.keys(cat)) map.set(id, id);
  const tickers = new Set(transactions.filter((t) => t.ticker.startsWith('MF:')).map((t) => t.ticker));
  for (const ticker of tickers) {
    if (map.get(ticker) === ticker) continue;
    const label = displayNames[ticker] || ticker;
    map.set(ticker, matchCatalogByLabel(label, cat) || ticker);
  }
  for (const t of transactions) {
    if (!t.ticker.startsWith('MF:')) continue;
    if (map.get(t.ticker) === t.ticker && cat[t.ticker]) continue;
    const label = displayNames[t.ticker] || t.ticker;
    const matched = matchCatalogByLabel(label, cat);
    if (matched) map.set(t.ticker, matched);
  }
  return map;
}

function mergeHoldings(holdings, canonMap) {
  const out = {};
  for (const [key, h] of Object.entries(holdings)) {
    const canon = canonMap.get(h.ticker) || h.ticker;
    const mkey = `${canon}|_`;
    const ex = out[mkey];
    if (!ex) {
      out[mkey] = { ...h, ticker: canon };
    } else {
      const q = ex.quantity + h.quantity;
      const cost = ex.quantity * ex.avgPrice + h.quantity * h.avgPrice;
      out[mkey] = { ...ex, quantity: q, avgPrice: q > 0 ? cost / q : 0 };
    }
  }
  return out;
}

function runFifo(transactions, canonMap, conversionIds = new Set()) {
  const txsByKey = {};
  for (const tx of transactions) {
    if (tx.type === 'DEPOSIT' || tx.type === 'WITHDRAWAL') continue;
    const canon = canonMap.get(tx.ticker) || tx.ticker;
    const key = `${canon}|_`;
    (txsByKey[key] ||= []).push(tx);
  }

  const holdings = {};
  for (const [key, txs] of Object.entries(txsByKey)) {
    const lots = [];
    const byDate = {};
    txs.forEach((t) => ((byDate[t.date] ||= []).push(t)));
    for (const date of Object.keys(byDate).sort()) {
      const day = byDate[date];
      const dayBuys = day.filter((t) => t.type === 'BUY').map((t) => ({
        q: t.quantity,
        c: t.price,
      }));
      const sells = day.filter((t) => t.type === 'SELL');
      for (const sell of sells) {
        let left = sell.quantity;
        const convertOut = conversionIds.has(sell.id);
        if (!convertOut) {
          for (const b of dayBuys) {
            if (left <= 0) break;
            const m = Math.min(left, b.q);
            b.q -= m;
            left -= m;
          }
        }
        while (left > 0 && lots.length) {
          const m = Math.min(left, lots[0].q);
          lots[0].q -= m;
          left -= m;
          if (lots[0].q <= 0) lots.shift();
        }
      }
      dayBuys.forEach((b) => {
        if (b.q > 0) lots.push({ q: b.q, c: b.c });
      });
    }
    const qty = lots.reduce((s, l) => s + l.q, 0);
    if (qty > 0) {
      const cost = lots.reduce((s, l) => s + l.q * l.c, 0);
      holdings[key] = { ticker: key.split('|')[0], quantity: qty, avgPrice: cost / qty };
    }
  }
  return holdings;
}

const linkId = 'pair-test';
const txs = [
  { id: 'b1', type: 'BUY', ticker: LEGACY_MDIP, quantity: 40000, price: 49, date: '2024-01-01' },
  { id: 'b2', type: 'BUY', ticker: MAHANA, quantity: 8407, price: 49, date: '2024-01-01' },
  { id: 's1', type: 'SELL', ticker: MAHANA, quantity: 4403, price: 51.45, date: '2025-08-27', linkId },
  { id: 'b3', type: 'BUY', ticker: MDIP, quantity: 4403, price: 51.45, date: '2025-08-27', linkId },
];

const displayNames = {
  [LEGACY_MDIP]: 'Meezan Daily Income Fund (MDIP I)',
};
const canon = buildCanonMap(txs, catalog, displayNames);
const convIds = new Set(['s1']);

let h = runFifo(txs, canon, convIds);
h = mergeHoldings(h, canon);

const mdip = h[`${MDIP}|_`];
const mahana = h[`${MAHANA}|_`];

console.log('MDIP units (expect ~44403):', mdip?.quantity);
console.log('Mahana units (expect ~4004):', mahana?.quantity);

if (!mdip || Math.abs(mdip.quantity - 44403) > 1) {
  console.error('FAIL: MDIP convert-in not merged');
  process.exit(1);
}
if (!mahana || Math.abs(mahana.quantity - 4004) > 1) {
  console.error('FAIL: Mahana convert-out');
  process.exit(1);
}
console.log('OK');
