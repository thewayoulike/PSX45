/**
 * Sync MUFAP NAV for today + yesterday → catalog, previousNavs, and Excel sheets.
 * Used for true daily P&L (today NAV vs yesterday NAV) without paid scraper keys.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { parseMufapNavHtml, isMufapBlockedPage } from '../lib/mufapParse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'fund-nav-catalog.json');
const PREV_OUT = path.join(ROOT, 'data', 'fund-nav-previous.json');
const MUFAP_BASE = 'https://www.mufap.com.pk/Industry/IndustryStatDaily?tab=3';

const pkToday = () => {
  // Asia/Karachi YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
};

const addDaysPK = (ymd, delta) => {
  const [y, m, d] = ymd.split('-').map(Number);
  // noon UTC avoids DST edge; PK is UTC+5
  const dt = new Date(Date.UTC(y, m - 1, d, 7, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
};

async function fetchDayHtml(dateYmd) {
  const page = `${MUFAP_BASE}&AMCId=null&fundId=null&datefrom=${dateYmd}&datetill=${dateYmd}`;
  const url = `https://r.jina.ai/http://${page.replace(/^https?:\/\//, '')}`;
  console.log(`[sync-mufap] Fetching ${dateYmd} via jina…`);
  const res = await fetch(url, {
    headers: { Accept: 'text/html,text/plain,*/*', 'User-Agent': 'PSX45-FundSync/1.0' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`jina HTTP ${res.status} for ${dateYmd}`);
  const html = await res.text();
  if (isMufapBlockedPage(html)) throw new Error(`Blocked/empty page for ${dateYmd}`);
  const funds = parseMufapNavHtml(html);
  if (funds.length < 50) throw new Error(`Only ${funds.length} funds for ${dateYmd}`);
  const reportDate = (html.match(/Report Date:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i) || [])[1] || null;
  return { html, funds, reportDate, dateYmd };
}

function fundsToCatalog(funds) {
  const catalog = {};
  funds.forEach((f) => {
    catalog[f.id] = f;
  });
  return catalog;
}

function writeExcel(funds, filePath, sheetName) {
  const rows = funds.map((f) => ({
    Sector: f.sector,
    AMC: f.amc,
    Fund: f.fundName,
    Category: f.category,
    'Inception Date': f.inceptionDate || '',
    Offer: f.offer,
    Repurchase: f.repurchase,
    NAV: f.nav,
    'Validity Date': f.validityDate,
    'Front-end': f.frontEndLoad,
    'Back-end': f.backEndLoad,
    Id: f.id,
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  // Buffer write is more reliable than writeFile on some Windows setups
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  fs.writeFileSync(filePath, buf);
  console.log(`[sync-mufap] Excel → ${filePath} (${funds.length} rows)`);
}

function previousNavMap(prevFunds) {
  /** @type {Record<string, { nav: number, repurchase: number, validityDate: string }>} */
  const map = {};
  prevFunds.forEach((f) => {
    const nav = f.repurchase > 0 ? f.repurchase : f.nav;
    if (!(nav > 0)) return;
    map[f.id] = {
      nav,
      repurchase: f.repurchase || nav,
      validityDate: f.validityDate || '',
    };
  });
  return map;
}

async function main() {
  const today = process.env.MUFAP_DATE || pkToday();
  const yday = process.env.MUFAP_PREV_DATE || addDaysPK(today, -1);

  console.log(`[sync-mufap] Today=${today} Yesterday=${yday}`);
  const [todayPack, ydayPack] = await Promise.all([
    fetchDayHtml(today),
    fetchDayHtml(yday),
  ]);

  writeExcel(todayPack.funds, path.join(ROOT, 'data', `mufap-nav-${today}.xlsx`), `NAV ${today}`);
  writeExcel(ydayPack.funds, path.join(ROOT, 'data', `mufap-nav-${yday}.xlsx`), `NAV ${yday}`);

  const previousNavs = previousNavMap(ydayPack.funds);
  const catalog = fundsToCatalog(todayPack.funds);

  // Attach prev NAV onto each fund for convenience (optional field)
  Object.keys(catalog).forEach((id) => {
    if (previousNavs[id]) {
      catalog[id] = {
        ...catalog[id],
        prevNav: previousNavs[id].nav,
        prevValidityDate: previousNavs[id].validityDate,
      };
    }
  });

  const payload = {
    updatedAt: new Date().toISOString(),
    reportDate: todayPack.reportDate,
    previousReportDate: ydayPack.reportDate,
    source: 'relay:jina',
    count: todayPack.funds.length,
    today,
    yesterday: yday,
    catalog,
    previousNavs,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  fs.writeFileSync(PREV_OUT, JSON.stringify({
    updatedAt: payload.updatedAt,
    date: yday,
    reportDate: ydayPack.reportDate,
    count: Object.keys(previousNavs).length,
    previousNavs,
  }, null, 2));

  const publicOut = path.join(ROOT, 'public/data/fund-nav-catalog.json');
  fs.mkdirSync(path.dirname(publicOut), { recursive: true });
  fs.copyFileSync(OUT, publicOut);

  // Sample daily moves
  const samples = ['Al Meezan Mutual Fund', 'KSE Meezan Index Fund', 'Meezan Islamic Income Fund'];
  samples.forEach((name) => {
    const f = todayPack.funds.find((x) => x.fundName === name);
    if (!f) return;
    const prev = previousNavs[f.id];
    if (!prev) return;
    const chg = f.nav - prev.nav;
    const pct = prev.nav > 0 ? (chg / prev.nav) * 100 : 0;
    console.log(`[sync-mufap] ${name}: ${prev.nav} → ${f.nav} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`);
  });

  console.log(`[sync-mufap] Wrote ${payload.count} funds + ${Object.keys(previousNavs).length} previous NAVs`);
}

main().catch((err) => {
  console.error('[sync-mufap] FAILED:', err.message);
  process.exit(1);
});
