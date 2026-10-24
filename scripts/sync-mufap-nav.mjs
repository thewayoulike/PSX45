/**
 * Sync MUFAP NAV for latest available day + prior day → catalog / previousNavs / Excel.
 * Playwright first (real browser), jina relay as fallback. Walks back calendar days when
 * reports are unpublished. Security blocks fail clearly without replacing saved prices.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { packNavReport, sourceError, fetchNavWithFallback } from '../lib/mufapFetch.js';
import {
  pkToday,
  addDaysYmd,
  candidateNavDates,
  candidatePrevNavDates,
} from '../lib/mufapSyncDates.js';
import { pruneMufapExcelFiles } from '../lib/mufapExcelPrune.js';
import { assertCatalogNotShrunk, assertCatalogNotOlder, catalogNavDate, newestCatalog, preserveNewerFunds, pickFallbackPrevious, sameFundData } from '../lib/mufapSyncGuards.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MUFAP_BASE = 'https://www.mufap.com.pk/Industry/IndustryStatDaily?tab=3';
const MAX_ATTEMPTS = 2;
const LOOKBACK_DAYS = Number(process.env.MUFAP_LOOKBACK_DAYS || 5);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mufapUrlForDay(dateYmd) {
  if (!dateYmd) return MUFAP_BASE;
  return `${MUFAP_BASE}&AMCId=null&fundId=null&datefrom=${dateYmd}&datetill=${dateYmd}`;
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
    const page = await browser.newPage();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const error = sourceError(response?.status(), await page.content(), 'MUFAP browser');
    if (error) throw error;
    try {
      await page.waitForSelector('table tr.fund-block td, table tr td', { timeout: 15_000 });
    } catch {
      /* parse will fail loudly if still empty */
    }
    // Table rows hydrate after first paint; short grace so AMC group headers land.
    await sleep(2500);
    const html = await page.content();
    return packNavReport(html, dateYmd, 'playwright');
  } finally {
    await browser.close();
  }
}

async function fetchDayHtmlJina(dateYmd) {
  const page = mufapUrlForDay(dateYmd);
  const url = `https://r.jina.ai/${page}`;
  console.log(`[sync-mufap] Fetching ${dateYmd} via jina…`);
  const res = await fetch(url, {
    headers: { Accept: 'text/html,text/plain,*/*', 'User-Agent': 'PSX45-FundSync/1.0' },
    redirect: 'follow', signal: AbortSignal.timeout(45000),
  });
  const html = await res.text();
  const error = sourceError(res.status, html, 'MUFAP relay');
  if (error) throw error;
  return packNavReport(html, dateYmd, 'relay:jina');
}

/** One attempt: Playwright first, then jina. */
async function fetchDayHtmlOnce(dateYmd) {
  return fetchNavWithFallback(() => fetchDayHtmlPlaywright(dateYmd), () => fetchDayHtmlJina(dateYmd));
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
      if (err.code === 'SOURCE_BLOCKED') throw err;
      if (attempt < MAX_ATTEMPTS) await sleep(1500 * attempt);
    }
  }
  if (required) throw lastErr;
  console.warn(`[sync-mufap] Giving up on ${dateYmd} (optional): ${lastErr?.message}`);
  return null;
}

/** Newest date in the lookback window that returns a real NAV table. */
async function fetchLatestAvailable(todayYmd, existing) {
  const dates = process.env.MUFAP_DATE
    ? [process.env.MUFAP_DATE]
    : [null, ...candidateNavDates(todayYmd, LOOKBACK_DAYS).filter(date => !existing || date >= catalogNavDate(existing))];
  let lastErr = null;
  for (const dateYmd of dates) {
    try {
      const pack = await fetchDayHtml(dateYmd, { required: true });
      assertCatalogNotOlder({ catalog: fundsToCatalog(pack.funds), reportDate: pack.reportDate }, existing);
      assertCatalogNotShrunk(pack.funds.length, Number(existing?.count) || 0, { allow: process.env.MUFAP_ALLOW_SHRINK === '1' });
      console.log(`[sync-mufap] Validated NAV date ${pack.dateYmd} from ${dateYmd || 'the current report'}.`);
      return pack;
    } catch (err) {
      lastErr = err;
      console.warn(`[sync-mufap] no usable NAV for ${dateYmd}: ${err.message}`);
      if (err.code === 'SOURCE_BLOCKED') throw err;
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

function readJson(p) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; } catch { return null; }
}

export async function main({ root = ROOT, anchor = process.env.MUFAP_DATE || pkToday(), latest = fetchLatestAvailable, previous = fetchDayHtml, dryRun = process.env.MUFAP_DRY_RUN === '1' } = {}) {
  const OUT = path.join(root, 'data', 'fund-nav-catalog.json');
  const PREV_OUT = path.join(root, 'data', 'fund-nav-previous.json');
  const publicOut = path.join(root, 'public/data/fund-nav-catalog.json');
  console.log(`[sync-mufap] Anchor day=${anchor} lookback=${LOOKBACK_DAYS}`);

  const existing = newestCatalog(readJson(OUT), readJson(publicOut));
  const todayPack = await latest(anchor, existing);
  assertCatalogNotOlder({ catalog: fundsToCatalog(todayPack.funds), reportDate: todayPack.reportDate }, existing);
  assertCatalogNotShrunk(todayPack.funds.length, Number(existing?.count) || 0, { allow: process.env.MUFAP_ALLOW_SHRINK === '1' });
  // Daily P&L “yesterday” = prior business/NAV day (Mon → Fri), not calendar -1.
  const prevDates = process.env.MUFAP_PREV_DATE
    ? [process.env.MUFAP_PREV_DATE]
    : candidatePrevNavDates(todayPack.dateYmd, LOOKBACK_DAYS);

  let ydayPack = null;
  let yesterdayUsed = prevDates[0] || addDaysYmd(todayPack.dateYmd, -1);
  for (const dateYmd of prevDates) {
    let pack;
    try { pack = await previous(dateYmd, { required: false }); } catch (err) {
      if (err.code !== 'SOURCE_BLOCKED') throw err;
      console.warn(`[sync-mufap] Prior-day source blocked; using saved earlier NAVs when available. ${err.message}`);
      break;
    }
    if (!pack) continue;
    // Skip if MUFAP/relay echoed the same report as “today” (weekend / SPA date ignore).
    if (
      todayPack.reportDate &&
      pack.reportDate &&
      pack.dateYmd >= todayPack.dateYmd
    ) {
      console.warn(
        `[sync-mufap] Skipping ${dateYmd}: same Report Date as today (${pack.reportDate})`,
      );
      continue;
    }
    ydayPack = pack;
    yesterdayUsed = pack.dateYmd;
    break;
  }

  let previousNavs = ydayPack ? previousNavMap(ydayPack.funds) : {};
  let previousReportDate = ydayPack?.reportDate || null;

  if (Object.keys(previousNavs).length < 50) {
    const fb = pickFallbackPrevious(existing, readJson(PREV_OUT), todayPack.dateYmd);
    if (fb) {
      console.warn(`[sync-mufap] Prior-day fetch failed; using ${fb.from} NAVs from ${fb.dateYmd}`);
      previousNavs = fb.funds ? previousNavMap(fb.funds) : fb.previousNavs;
      previousReportDate = fb.reportDate || previousReportDate;
      yesterdayUsed = fb.dateYmd;
    } else {
      // Better no Daily P&L than one computed against NAVs from weeks ago.
      console.warn('[sync-mufap] No recent previous-day NAVs; publishing without Daily P&L.');
      previousNavs = {};
      previousReportDate = null;
    }
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

  const payload = preserveNewerFunds({
    updatedAt: new Date().toISOString(),
    reportDate: todayPack.reportDate,
    previousReportDate,
    source: todayPack.source,
    count: todayPack.funds.length,
    today: todayPack.dateYmd,
    yesterday: yesterdayUsed,
    catalog,
    previousNavs,
  }, existing);

  // A rerun with the same NAVs must not create a commit: every commit deploys production.
  if (sameFundData(existing, payload)) {
    console.log('[sync-mufap] Fund data unchanged; leaving the catalog as it is.');
    return;
  }
  if (dryRun) {
    console.log(`[sync-mufap] Dry run: validated ${payload.count} funds dated ${payload.reportDate}; no files written.`);
    return payload;
  }
  if (process.env.MUFAP_WRITE_EXCEL !== '0') {
    writeExcel(Object.values(payload.catalog), path.join(root, 'data', `mufap-nav-${todayPack.dateYmd}.xlsx`), `NAV ${todayPack.dateYmd}`);
    if (ydayPack) writeExcel(ydayPack.funds, path.join(root, 'data', `mufap-nav-${yesterdayUsed}.xlsx`), `NAV ${yesterdayUsed}`);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  fs.writeFileSync(PREV_OUT, JSON.stringify({
    updatedAt: payload.updatedAt,
    date: yesterdayUsed,
    reportDate: previousReportDate,
    count: Object.keys(payload.previousNavs).length,
    previousNavs: payload.previousNavs,
  }, null, 2));

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

  const dataDir = path.join(root, 'data');
  const pruned = process.env.MUFAP_WRITE_EXCEL === '0' ? [] : pruneMufapExcelFiles(fs, dataDir, 2);
  if (pruned.length) {
    console.log(`[sync-mufap] Pruned ${pruned.length} old Excel dump(s): ${pruned.join(', ')}`);
  }

  console.log(`[sync-mufap] Wrote ${payload.count} funds + ${Object.keys(previousNavs).length} previous NAVs (source=${payload.source}, day=${payload.today})`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### MUFAP NAV sync\nValidated ${payload.count} funds. NAV report date: **${payload.reportDate}**. Source: ${payload.source}.\n`);
  return payload;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[sync-mufap] FAILED:', err.message);
    console.error('[sync-mufap] Saved fund data was not replaced. A source failure is not a successful refresh.');
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### MUFAP NAV sync failed\n${err.message}\n\nSaved fund prices were retained. No new catalog was published.\n`);
    process.exitCode = 1;
  });
}
