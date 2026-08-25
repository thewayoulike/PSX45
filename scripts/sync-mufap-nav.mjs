/**
 * Sync MUFAP NAV catalog → data/fund-nav-catalog.json
 * Run locally or in GitHub Actions (Playwright bypasses Cloudflare in CI).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseMufapNavHtml, isMufapBlockedPage } from '../lib/mufapParse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'fund-nav-catalog.json');
const MUFAP_URL = 'https://www.mufap.com.pk/Industry/IndustryStatDaily?tab=3';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchWithPlaywright() {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(MUFAP_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForSelector('table tbody tr td', { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const html = await page.content();
    return html;
  } finally {
    await browser.close();
  }
}

async function fetchDirect() {
  const res = await fetch(MUFAP_URL, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchHtml() {
  if (process.env.USE_PLAYWRIGHT !== '0') {
    try {
      const html = await fetchWithPlaywright();
      if (!isMufapBlockedPage(html)) return { html, method: 'playwright' };
      console.warn('[sync-mufap] Playwright got Cloudflare page, trying direct fetch…');
    } catch (e) {
      console.warn('[sync-mufap] Playwright unavailable:', e.message);
    }
  }

  const html = await fetchDirect();
  if (isMufapBlockedPage(html)) throw new Error('MUFAP returned Cloudflare challenge (direct fetch blocked)');
  return { html, method: 'direct' };
}

function buildCatalog(funds, html, method) {
  const catalog = {};
  funds.forEach(f => { catalog[f.id] = f; });
  const dateMatch = html.match(/Report Date:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
  return {
    updatedAt: new Date().toISOString(),
    reportDate: dateMatch?.[1]?.trim() || null,
    source: method,
    count: funds.length,
    catalog,
  };
}

async function main() {
  console.log('[sync-mufap] Fetching MUFAP NAV…');
  const { html, method } = await fetchHtml();
  const funds = parseMufapNavHtml(html);
  if (funds.length < 50) {
    throw new Error(`Only parsed ${funds.length} funds — expected 50+`);
  }
  const payload = buildCatalog(funds, html, method);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  const publicOut = path.join(ROOT, 'public/data/fund-nav-catalog.json');
  fs.mkdirSync(path.dirname(publicOut), { recursive: true });
  fs.copyFileSync(OUT, publicOut);
  console.log(`[sync-mufap] Wrote ${payload.count} funds → ${OUT} (${method})`);
}

main().catch(err => {
  console.error('[sync-mufap] FAILED:', err.message);
  process.exit(1);
});
