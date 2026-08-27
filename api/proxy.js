// Only allow proxying to trusted hosts.
// Also serves OHLCV via ?ohlc=SYMBOL (keeps Hobby plan under the 12-function limit).
import { fetchPsxOhlc } from '../lib/psxOhlc.js';
import { fetchPypsxCompanyInfo } from '../lib/pypsxCompanyInfo.js';
import { fetchPypsxChartAnalysis } from '../lib/pypsxChartAnalysis.js';

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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    return res.status(204).end();
  }

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

  // --- Company info via pypsx_toolkit (Python on host) ---
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

  // --- Chart analysis: Bollinger + RSI via pypsx_toolkit (Python on host) ---
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
      redirect: 'follow',
    };

    if (req.method === 'POST') {
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const response = await fetch(target.toString(), fetchOptions);
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
