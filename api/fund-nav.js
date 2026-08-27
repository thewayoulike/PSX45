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

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
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

/** Direct MUFAP fetch — often 403 from Vercel/Cloudflare. */
async function tryDirectMufap() {
  const res = await fetch(MUFAP_NAV_URL, { headers: BROWSER_HEADERS, redirect: 'follow' });
  if (!res.ok) return null;
  return catalogFromHtml(await res.text(), 'live');
}

/**
 * Fetch MUFAP via public relay hosts (different IPs than Vercel).
 * Cloudflare blocks many serverless ranges; these relays often still work.
 */
async function tryRelayMufap() {
  const relays = [
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  ];

  for (const build of relays) {
    try {
      const res = await fetch(build(MUFAP_NAV_URL), {
        headers: { Accept: 'text/html,*/*', 'User-Agent': BROWSER_HEADERS['User-Agent'] },
        redirect: 'follow',
      });
      if (!res.ok) continue;
      const parsed = catalogFromHtml(await res.text(), 'live');
      if (parsed) return parsed;
    } catch {
      /* try next relay */
    }
  }
  return null;
}

async function tryLiveMufapFetch() {
  return (await tryDirectMufap().catch(() => null)) || (await tryRelayMufap().catch(() => null));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const live = await tryLiveMufapFetch().catch(() => null);
    if (live) {
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).json(live);
    }

    const bundled = loadBundledCatalog();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json(toResponse(bundled, bundled.source || 'bundled'));
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Fund NAV catalog unavailable',
    });
  }
}
