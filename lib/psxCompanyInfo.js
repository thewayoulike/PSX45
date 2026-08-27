/**
 * Fetch + parse PSX company profile, equity stats, and payout history.
 * Works on Vercel/serverless (no Python / pypsx-toolkit required).
 */

const PSX_BASE = 'https://dps.psx.com.pk';
const PAYOUTS_URL = `${PSX_BASE}/company/payouts`;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const PSX_HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: `${PSX_BASE}/`,
  Origin: PSX_BASE,
};

function decodeHtml(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

function stripTags(html) {
  return decodeHtml(String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
}

function extractSection(html, id) {
  const re = new RegExp(
    `id="${id}"[\\s\\S]*?(?=id="(?:quote|profile|equity|announcements|financials|ratios|payouts|reports)"|<div class="section section--padded company")`,
    'i'
  );
  return html.match(re)?.[0] || '';
}

function parseBusinessDescription(html) {
  const m = html.match(/profile__item--decription[\s\S]*?<p>([\s\S]*?)<\/p>/i);
  return m ? stripTags(m[1]) : '';
}

function parseGovernanceItems(html) {
  const block = html.match(/profile__item--people[\s\S]*?<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!block) return [];
  const items = [];
  for (const row of block[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    if (cells.length >= 2) items.push({ label: cells[0], value: cells[1] });
  }
  return items;
}

function parseProfileItems(html) {
  const section = extractSection(html, 'profile');
  const items = [];
  const heads = [...section.matchAll(/<div class="item__head">([\s\S]*?)<\/div>\s*(?:<p>([\s\S]*?)<\/p>|<a[^>]*>([\s\S]*?)<\/a>)/gi)];
  for (const m of heads) {
    const label = stripTags(m[1]);
    const value = stripTags(m[2] || m[3] || '');
    if (!label || !value || label === 'BUSINESS DESCRIPTION' || label === 'KEY PEOPLE') continue;
    if (label === 'ADDRESS' || label === 'WEBSITE' || label === 'REGISTRAR' || label === 'AUDITOR' || label === 'Fiscal Year End') {
      items.push({ label, value });
    }
  }
  return items;
}

function parseEquityItems(html) {
  const section = extractSection(html, 'equity');
  const items = [];
  for (const m of section.matchAll(/stats_label[^>]*>([\s\S]*?)<\/div>\s*<div class="stats_value">([\s\S]*?)<\/div>/gi)) {
    const label = stripTags(m[1]);
    const value = stripTags(m[2]);
    if (label && value) items.push({ label, value });
  }
  return items;
}

function parseLatestPrice(html) {
  const quote = extractSection(html, 'quote');
  const m = quote.match(/Rs\.([\d,]+(?:\.\d+)?)/i) || html.match(/Rs\.([\d,]+(?:\.\d+)?)/i);
  if (!m) return NaN;
  const v = parseFloat(m[1].replace(/,/g, ''));
  return Number.isFinite(v) ? v : NaN;
}

/** @param {string} html */
export function parsePsxPayoutTableHtml(html) {
  const rows = [];
  for (const tr of String(html || '').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    if (tds.length < 4) continue;
    if (/^date$/i.test(tds[0]) || /^symbol$/i.test(tds[0])) continue;
    const bookParts = tds[3].split(/\s*-\s*/).map((s) => s.trim()).filter(Boolean);
    rows.push({
      exDividendDate: bookParts[0] || tds[0],
      cashAmount: tds[2] || '-',
      recordDate: bookParts[0] || '-',
      payDate: bookParts[1] || bookParts[0] || '-',
    });
  }
  return rows;
}

function buildLatestDividend(history) {
  if (!history.length) return null;
  const latest = history[0];
  return {
    dividendYield: '-',
    annualDividend: latest.cashAmount || '-',
    exDividendDate: latest.exDividendDate,
    payoutFrequency: history.length >= 3 ? 'Quarterly' : '-',
    payoutRatio: '-',
    dividendGrowth: '-',
  };
}

/** @param {string} html */
export function parsePsxCompanyPageHtml(html, symbol) {
  const profileItems = parseProfileItems(html);
  const governanceItems = parseGovernanceItems(html);
  const equityItems = parseEquityItems(html);
  const fundamentals = [];
  if (profileItems.length) fundamentals.push({ category: 'Profile', items: profileItems });
  if (governanceItems.length) fundamentals.push({ category: 'Governance', items: governanceItems });
  if (equityItems.length) fundamentals.push({ category: 'Equity Profile', items: equityItems });

  return {
    symbol,
    businessDescription: parseBusinessDescription(html),
    fundamentals,
    latestPrice: parseLatestPrice(html),
  };
}

async function fetchCompanyHtml(symbol) {
  const res = await fetch(`${PSX_BASE}/company/${symbol}`, {
    headers: PSX_HEADERS,
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`PSX company HTTP ${res.status}`);
  const html = await res.text();
  if (/just a moment|cf-chl|challenge-platform/i.test(html)) {
    throw new Error('PSX company page blocked by Cloudflare');
  }
  return html;
}

async function fetchPayoutHistory(symbol) {
  const body = new URLSearchParams({ symbol }).toString();
  const res = await fetch(PAYOUTS_URL, {
    method: 'POST',
    headers: {
      ...PSX_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`PSX payouts HTTP ${res.status}`);
  return parsePsxPayoutTableHtml(await res.text());
}

/**
 * @param {string} symbol
 */
export async function fetchPsxCompanyInfo(symbol) {
  const clean = String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/^PSX:/, '');
  if (!clean) throw new Error('symbol required');

  const html = await fetchCompanyHtml(clean);
  const parsed = parsePsxCompanyPageHtml(html, clean);
  let dividendHistory = [];
  try {
    dividendHistory = await fetchPayoutHistory(clean);
  } catch {
    /* payout table optional */
  }

  const latestDividend = buildLatestDividend(dividendHistory);

  return {
    symbol: clean,
    businessDescription: parsed.businessDescription,
    fundamentals: parsed.fundamentals,
    latestDividend,
    dividendHistory,
    source: 'psx:web',
  };
}
