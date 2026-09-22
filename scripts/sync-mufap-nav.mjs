/**
 * Sync MUFAP NAV for latest available day + prior day → catalog / previousNavs / Excel.
 * Playwright first (real browser), jina relay as fallback. Walks back calendar days when
 * today’s page is empty/blocked so late AMC publishes don’t fail the job forever.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { parseMufapNavHtml, isMufapBlockedPage } from '../lib/mufapParse.js';
import {
  pkToday,
  addDaysYmd,
  candidateNavDates,
  candidatePrevNavDates,
} from '../lib/mufapSyncDates.js';
import { pruneMufapExcelFiles } from '../lib/mufapExcelPrune.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'fund-nav-catalog.json');
const PREV_OUT = path.join(ROOT, 'data', 'fund-nav-previous.json');
const MUFAP_BASE = 'https://www.mufap.com.pk/Industry/IndustryStatDaily?tab=3';
const MAX_ATTEMPTS = 3;
const LOOKBACK_DAYS = Number(process.env.MUFAP_LOOKBACK_DAYS || 5);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mufapUrlForDay(dateYmd) {
  return `${MUFAP_BASE}&AMCId=null&fundId=null&datefrom=${dateYmd}&datetill=${dateYmd}`;
}

function packFromHtml(html, dateYmd, source) {
  if (isMufapBlockedPage(html)) throw new Error(`Blocked/empty page for ${dateYmd}`);
  const funds = parseMufapNavHtml(html);
  if (funds.length < 50) throw new Error(`Only ${funds.length} funds for ${dateYmd}`);
  // Prefer majority fund validity over the page header — dated URL filters can leave a stale header.
  const counts = {};
  for (const f of funds) {
    const v = (f.validityDate || '').trim();
    if (!v) continue;
    counts[v] = (counts[v] || 0) + 1;
  }
  const majorityValidity =
    Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const headerDate = (html.match(/Report Date:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i) || [])[1] || null;
  return { html, funds, reportDate: majorityValidity || headerDate, dateYmd, source };
}

async function fetchDayHtmlPlaywright(dateYmd) {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('playwright not installed');
  }
  const url = mufapUrlForDay(dateYmd);
  console.log(`[sync-mufap] Fetching ${dateYmd} via playwright…`);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    try {
      await page.waitForSelector('table tr.fund-block td, table tr td', { timeout: 30_000 });
    } catch {
      /* parse will fail loudly if still empty */
    }
    // Table rows hydrate after first paint; short grace so AMC group headers land.
    await sleep(2500);
    const html = await page.content();
    return packFromHtml(html, dateYmd, 'playwright');
  } finally {
    await browser.close();
  }
}

async function fetchDayHtmlJina(dateYmd) {
  const page = mufapUrlForDay(dateYmd);
  const url = `https://r.jina.ai/http://${page.replace(/^https?:\/\//, '')}`;
  console.log(`[sync-mufap] Fetching ${dateYmd} via jina…`);
  const res = await fetch(url, {
    headers: { Accept: 'text/html,text/plain,*/*', 'User-Agent': 'PSX45-FundSync/1.0' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`jina HTTP ${res.status} for ${dateYmd}`);
  const html = await res.text();
  return packFromHtml(html, dateYmd, 'relay:jina');
}

/** One attempt: Playwright first, then jina. */
async function fetchDayHtmlOnce(dateYmd) {
  try {
    return await fetchDayHtmlPlaywright(dateYmd);
  } catch (err) {
    console.warn(`[sync-mufap] playwright failed for ${dateYmd}: ${err.message}`);
    return await fetchDayHtmlJina(dateYmd);
  }
}

async function fetchDayHtml(dateYmd, { required = true } = {}) {
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchDayHtmlOnce(dateYmd);
    } catch (err) {
      lastErr = err;
      console.warn(
        `[sync-mufap] attempt ${attempt}/${MAX_ATTEMPTS} failed for ${dateYmd}: ${err.message}`,
      );
      if (attempt < MAX_ATTEMPTS) await sleep(1500 * attempt);
    }
  }
  if (required) throw lastErr;
  console.warn(`[sync-mufap] Giving up on ${dateYmd} (optional): ${lastErr?.message}`);
  return null;
}

/** Newest date in the lookback window that returns a real NAV table. */
async function fetchLatestAvailable(todayYmd) {
  const dates = process.env.MUFAP_DATE
    ? [process.env.MUFAP_DATE]
    : candidateNavDates(todayYmd, LOOKBACK_DAYS);
  let lastErr = null;
  for (const dateYmd of dates) {
    try {
      const pack = await fetchDayHtml(dateYmd, { required: true });
      if (dateYmd !== todayYmd) {
        console.warn(`[sync-mufap] Using ${dateYmd} (today ${todayYmd} had no usable NAV yet)`);
      }
      return pack;
    } catch (err) {
      lastErr = err;
      console.warn(`[sync-mufap] no usable NAV for ${dateYmd}: ${err.message}`);
    }
  }
  throw lastErr || new Error(`No MUFAP NAV within ${LOOKBACK_DAYS} days of ${todayYmd}`);
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

function loadFallbackPreviousNavs() {
  for (const p of [PREV_OUT, OUT]) {
    try {
      if (!fs.existsSync(p)) continue;
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      const map = j.previousNavs || null;
      if (map && Object.keys(map).length >= 50) {
        console.warn(`[sync-mufap] Using fallback previousNavs from ${path.basename(p)} (${Object.keys(map).length})`);
        return {
          previousNavs: map,
          reportDate: j.previousReportDate || j.reportDate || null,
          dateYmd: j.yesterday || j.date || null,
        };
      }
    } catch {
      /* try next */
    }
  }
  return { previousNavs: {}, reportDate: null, dateYmd: null };
}

async function main() {
  const anchor = process.env.MUFAP_DATE || pkToday();
  console.log(`[sync-mufap] Anchor day=${anchor} lookback=${LOOKBACK_DAYS}`);

  const todayPack = await fetchLatestAvailable(anchor);
  // Daily P&L “yesterday” = prior business/NAV day (Mon → Fri), not calendar -1.
  const prevDates = process.env.MUFAP_PREV_DATE
    ? [process.env.MUFAP_PREV_DATE]
    : candidatePrevNavDates(todayPack.dateYmd, LOOKBACK_DAYS);

  let ydayPack = null;
  let yesterdayUsed = prevDates[0] || addDaysYmd(todayPack.dateYmd, -1);
  for (const dateYmd of prevDates) {
    const pack = await fetchDayHtml(dateYmd, { required: false });
    if (!pack) continue;
    // Skip if MUFAP/relay echoed the same report as “today” (weekend / SPA date ignore).
    if (
      todayPack.reportDate &&
      pack.reportDate &&
      pack.reportDate === todayPack.reportDate
    ) {
      console.warn(
        `[sync-mufap] Skipping ${dateYmd}: same Report Date as today (${pack.reportDate})`,
      );
      continue;
    }
    ydayPack = pack;
    yesterdayUsed = dateYmd;
    break;
  }

  writeExcel(todayPack.funds, path.join(ROOT, 'data', `mufap-nav-${todayPack.dateYmd}.xlsx`), `NAV ${todayPack.dateYmd}`);
  if (ydayPack) {
    writeExcel(ydayPack.funds, path.join(ROOT, 'data', `mufap-nav-${yesterdayUsed}.xlsx`), `NAV ${yesterdayUsed}`);
  }

  let previousNavs = ydayPack ? previousNavMap(ydayPack.funds) : {};
  let previousReportDate = ydayPack?.reportDate || null;

  if (Object.keys(previousNavs).length < 50) {
    const fb = loadFallbackPreviousNavs();
    previousNavs = fb.previousNavs;
    previousReportDate = fb.reportDate || previousReportDate;
    yesterdayUsed = fb.dateYmd || yesterdayUsed;
  }

  const catalog = fundsToCatalog(todayPack.funds);
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
    previousReportDate,
    source: todayPack.source,
    count: todayPack.funds.length,
    today: todayPack.dateYmd,
    yesterday: yesterdayUsed,
    catalog,
    previousNavs,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  fs.writeFileSync(PREV_OUT, JSON.stringify({
    updatedAt: payload.updatedAt,
    date: yesterdayUsed,
    reportDate: previousReportDate,
    count: Object.keys(previousNavs).length,
    previousNavs,
  }, null, 2));

  const publicOut = path.join(ROOT, 'public/data/fund-nav-catalog.json');
  fs.mkdirSync(path.dirname(publicOut), { recursive: true });
  fs.copyFileSync(OUT, publicOut);

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

  const dataDir = path.join(ROOT, 'data');
  const pruned = pruneMufapExcelFiles(fs, dataDir, 2);
  if (pruned.length) {
    console.log(`[sync-mufap] Pruned ${pruned.length} old Excel dump(s): ${pruned.join(', ')}`);
  }

  console.log(`[sync-mufap] Wrote ${payload.count} funds + ${Object.keys(previousNavs).length} previous NAVs (source=${payload.source}, day=${payload.today})`);
}

main().catch((err) => {
  console.error('[sync-mufap] FAILED:', err.message);
  process.exit(1);
});
