/**
 * PSX data routes (historical, timeseries, market-watch) answer 404/403
 * unless the call carries the page token and looks like the portal's Ajax.
 */

const PORTAL_URL = 'https://dps.psx.com.pk/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const TOKEN_TTL_MS = 10 * 60 * 1000;

let cached = { key: '', at: 0 };

export function clearPsxPortalCache() {
  cached = { key: '', at: 0 };
}

async function loadRequestId(force) {
  if (!force && cached.key && Date.now() - cached.at < TOKEN_TTL_MS) return cached.key;
  const res = await fetch(PORTAL_URL, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(10000),
  });
  const html = await res.text();
  const key = html.match(/"_k"\s*:\s*"([^"]+)"/)?.[1];
  if (!key) throw new Error('PSX portal token missing');
  cached = { key, at: Date.now() };
  return key;
}

export async function psxDataHeaders(extra = {}) {
  const key = await loadRequestId(false);
  return {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: PORTAL_URL,
    Origin: 'https://dps.psx.com.pk',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Req-Id': key,
    ...extra,
  };
}

export async function fetchPsx(url, init = {}) {
  const extra = init.headers || {};
  const attempt = async (force) => {
    if (force) clearPsxPortalCache();
    const headers = await psxDataHeaders(extra);
    return { headers, res: await fetch(url, { ...init, headers }) };
  };

  let { res } = await attempt(false);
  if (res.status === 404 || res.status === 403) {
    await res.body?.cancel?.();
    return (await attempt(true)).res;
  }
  return res;
}
