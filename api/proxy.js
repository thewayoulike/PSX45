// Only allow proxying to trusted hosts.
// Also serves OHLCV via ?ohlc=SYMBOL (keeps Hobby plan under the 12-function limit).
import { fetchPsxOhlc } from '../lib/psxOhlc.js';
import { fetchPsx } from '../lib/psxPortal.js';
import { fetchPypsxCompanyInfo } from '../lib/pypsxCompanyInfo.js';
import { fetchPypsxChartAnalysis } from '../lib/pypsxChartAnalysis.js';
import { fetchPypsxIntraday } from '../lib/pypsxIntraday.js';

const ALLOWED_HOSTS = new Set([
  'dps.psx.com.pk',
  'www.psx.com.pk',
  'psx.com.pk',
  'www.mufap.com.pk',
  'mufap.com.pk',
  'docs.google.com', // public Google Sheets exports (e.g. BoardMeetings CSV)
]);

const isCloudflareChallenge = (html) => {
  if (!html || html.length < 400) return false;
  const lower = html.toLowerCase();
  return (
    lower.includes('just a moment') ||
    lower.includes('cf-chl') ||
    lower.includes('challenge-platform') ||
    lower.includes('enable javascript and cookies')
  );
};

import { limitRequest } from '../lib/sharedRateLimit.js';
import { validateMarketQuery } from '../lib/marketLimits.js';
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    return res.status(204).end();
  }

  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const invalid = validateMarketQuery(req.query);
  if (invalid) return res.status(400).json({ error: invalid });
  if (!await limitRequest(req, res, 'market-proxy', 120)) return;
  // --- OHLCV mode (same as former /api/ohlc) ---
  const ohlcSymbol = String(req.query.ohlc || req.query.symbol || '').trim();
  const wantsOhlc = Boolean(req.query.ohlc) || String(req.query.mode || '') === 'ohlc';
  if (wantsOhlc) {
    if (!ohlcSymbol) return res.status(400).json({ error: 'ohlc symbol is required' });
    try {
      const payload = await fetchPsxOhlc(ohlcSymbol);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
      return res.status(200).json(payload);
    } catch (e) {
      return res.status(502).json({ error: e.message || 'OHLC fetch failed' });
    }
  }

  // --- Company info via pypsx-toolkit (Python on Vercel /api/pypsx) ---
  const companySymbol = String(req.query.company || '').trim();
  const wantsCompany = Boolean(req.query.company) || String(req.query.mode || '') === 'company';
  if (wantsCompany) {
    if (!companySymbol) return res.status(400).json({ error: 'company symbol is required' });
    try {
      const payload = await fetchPypsxCompanyInfo(companySymbol);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).json(payload);
    } catch (e) {
      return res.status(502).json({ error: e.message || 'Company info fetch failed' });
    }
  }

  // --- Chart analysis via pypsx-toolkit (Python on Vercel /api/pypsx) ---
  const analysisSymbol = String(req.query.analysis || '').trim();
  const wantsAnalysis = Boolean(req.query.analysis) || String(req.query.mode || '') === 'analysis';
  if (wantsAnalysis) {
    if (!analysisSymbol) return res.status(400).json({ error: 'analysis symbol is required' });
    const period = String(req.query.period || '6mo').trim().toLowerCase();
    try {
      const payload = await fetchPypsxChartAnalysis(analysisSymbol, period);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
      return res.status(200).json(payload);
    } catch (e) {
      return res.status(502).json({ error: e.message || 'Chart analysis fetch failed' });
    }
  }

  // --- Intraday OHLCV via authenticated pypsx SDK ---
  const intradaySymbol = String(req.query.intraday || '').trim();
  const wantsIntraday = Boolean(req.query.intraday) || String(req.query.mode || '') === 'intraday';
  if (wantsIntraday) {
    if (!intradaySymbol) return res.status(400).json({ error: 'intraday symbol is required' });
    const interval = String(req.query.interval || '5m').trim().toLowerCase();
    const period = String(req.query.period || '5d').trim().toLowerCase();
    try {
      const payload = await fetchPypsxIntraday(intradaySymbol, interval, period);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return res.status(200).json(payload);
    } catch (e) {
      return res.status(502).json({ error: e.message || 'Intraday fetch failed' });
    }
  }

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  let target;
  try {
    target = new URL(decodeURIComponent(url));
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
    return res.status(403).json({ error: 'Host not allowed' });
  }

  try {
    const browserHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: `${target.origin}/`,
      'Cache-Control': 'no-cache',
    };

    const fetchOptions = {
      method: req.method || 'GET',
      headers: browserHeaders,
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    };

    if (req.method === 'POST') {
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const isDps = () => target.hostname === 'dps.psx.com.pk';
    let response;
    for (let redirects = 0; redirects <= 3; redirects++) {
      response = isDps()
        ? await fetchPsx(target.toString(), fetchOptions)
        : await fetch(target.toString(), fetchOptions);
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      if (!location || redirects === 3) throw new Error('Upstream redirect limit reached');
      const next = new URL(location, target);
      // Google Sheets CSV exports use a Google-hosted download URL.
      const googleExport = (target.hostname === 'docs.google.com' || target.hostname.endsWith('.googleusercontent.com')) && next.hostname.endsWith('.googleusercontent.com');
      if (next.protocol !== 'https:' || (!ALLOWED_HOSTS.has(next.hostname) && !googleExport)) throw new Error('Upstream redirected to an unsupported host');
      await response.body?.cancel();
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && fetchOptions.method === 'POST')) { fetchOptions.method = 'GET'; delete fetchOptions.body; }
      target = next;
    }
    const data = await response.text();

    // Upstream blocked (Cloudflare / WAF) — surface as 502, not a cryptic 500
    if (!response.ok) {
      return res.status(502).json({
        error: `Upstream ${response.status}`,
        upstreamStatus: response.status,
        host: target.hostname,
      });
    }

    if (isCloudflareChallenge(data)) {
      return res.status(502).json({
        error: 'Upstream blocked by Cloudflare challenge',
        upstreamStatus: 403,
        host: target.hostname,
      });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=60');
    res.setHeader('Content-Type', response.headers.get('content-type') || 'text/html; charset=utf-8');
    return res.status(200).send(data);
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Proxy fetch failed' });
  }
}
