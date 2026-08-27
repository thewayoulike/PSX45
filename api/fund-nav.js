import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isMufapBlockedPage, parseMufapNavHtml } from '../lib/mufapParse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATHS = [
  path.join(__dirname, '../public/data/fund-nav-catalog.json'),
  path.join(__dirname, '../data/fund-nav-catalog.json'),
];
const MUFAP_NAV_URL = 'https://www.mufap.com.pk/Industry/IndustryStatDaily?tab=3';

/** How long we wait for a live MUFAP attempt before serving the synced catalog. */
const LIVE_BUDGET_MS = 16000;

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.mufap.com.pk/',
};

function loadBundledCatalog() {
  for (const p of CATALOG_PATHS) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  }
  throw new Error('Fund catalog file missing from deployment');
}

function toResponse(catalogObj, source) {
  const catalog = catalogObj.catalog || catalogObj;
  const count = catalogObj.count || Object.keys(catalog).length;
  return {
    catalog,
    count,
    reportDate: catalogObj.reportDate || null,
    updatedAt: catalogObj.updatedAt || null,
    source,
  };
}

function catalogFromHtml(html, source) {
  if (isMufapBlockedPage(html)) return null;
  const funds = parseMufapNavHtml(html);
  if (funds.length < 50) return null;

  const catalog = {};
  funds.forEach(f => { catalog[f.id] = f; });
  const dateMatch = html.match(/Report Date:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);

  return {
    catalog,
    count: funds.length,
    reportDate: dateMatch?.[1]?.trim() || null,
    updatedAt: new Date().toISOString(),
    source,
  };
}

async function fetchWithTimeout(url, options = {}, ms = LIVE_BUDGET_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

/** Direct MUFAP — often 403 from Vercel/Cloudflare. Short timeout. */
async function tryDirectMufap() {
  const res = await fetchWithTimeout(MUFAP_NAV_URL, { headers: BROWSER_HEADERS }, 3000);
  if (!res.ok) return null;
  return catalogFromHtml(await res.text(), 'live');
}

/**
 * Free relays (no user keys). Each attempt is budgeted so the API stays fast
 * and falls back to the Playwright/GH-Actions synced catalog.
 */
async function tryRelayMufap() {
  // Prefer jina — reliably returns markdown NAV tables past Cloudflare (no API key).
  const relays = [
    (u) => `https://r.jina.ai/http://${u.replace(/^https?:\/\//, '')}`,
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  ];

  for (const build of relays) {
    try {
      const res = await fetchWithTimeout(
        build(MUFAP_NAV_URL),
        { headers: { Accept: 'text/html,*/*', 'User-Agent': BROWSER_HEADERS['User-Agent'] } },
        15000
      );
      if (!res.ok) continue;
      const parsed = catalogFromHtml(await res.text(), 'live');
      if (parsed) return parsed;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Optional server-side Scrape.do — only if YOU set the env on Vercel (not required for users). */
async function tryScrapeDoMufap() {
  const token = process.env.SCRAPE_DO_TOKEN || process.env.SCRAPING_API_KEY;
  if (!token) return null;
  const url = `https://api.scrape.do/?token=${encodeURIComponent(token)}&url=${encodeURIComponent(MUFAP_NAV_URL)}&render=true`;
  const res = await fetchWithTimeout(url, {}, 8000);
  if (!res.ok) return null;
  return catalogFromHtml(await res.text(), 'live');
}

async function tryLiveMufapFetch() {
  return (
    (await tryDirectMufap().catch(() => null)) ||
    (await tryScrapeDoMufap().catch(() => null)) ||
    (await tryRelayMufap().catch(() => null))
  );
}

/**
 * Our public API for fund NAV — no user keys required.
 * Primary path: catalog synced by GitHub Actions / `npm run sync:funds` (Playwright).
 * Bonus: short live attempt when Cloudflare allows.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Prefer synced catalog immediately when it looks fresh (Playwright / GH Actions).
    // Users without scraper keys rely on this — Cloudflare blocks live Vercel→MUFAP.
    let bundled = null;
    try {
      bundled = loadBundledCatalog();
    } catch {
      bundled = null;
    }

  const syncedSources = new Set([
    'playwright',
    'direct',
    'synced',
    'api',
    'live',
    'relay:jina',
    'relay:allorigins',
    'relay:codetabs',
  ]);
    const syncedAt = bundled?.updatedAt ? Date.parse(bundled.updatedAt) : NaN;
    const syncedFresh =
      bundled &&
      Object.keys(bundled.catalog || bundled).length >= 50 &&
      !Number.isNaN(syncedAt) &&
      Date.now() - syncedAt < 36 * 60 * 60 * 1000 && // < 36h
      (syncedSources.has(bundled.source) || String(bundled.source || '').startsWith('relay:'));

    if (syncedFresh) {
      res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=86400');
      return res.status(200).json(toResponse(bundled, bundled.source === 'live' ? 'live' : 'synced'));
    }

    // Short live attempt (no long hangs). Optional — fail soft to bundled.
    const live = await Promise.race([
      tryLiveMufapFetch().catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), LIVE_BUDGET_MS + 500)),
    ]);

    if (live) {
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).json(live);
    }

    if (bundled) {
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
      const source =
        syncedSources.has(bundled.source) || bundled.source === 'live'
          ? 'synced'
          : bundled.source || 'bundled';
      return res.status(200).json(toResponse(bundled, source));
    }

    return res.status(500).json({ error: 'Fund NAV catalog unavailable' });
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Fund NAV catalog unavailable',
    });
  }
}
