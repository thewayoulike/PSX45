// Only allow proxying to trusted hosts.
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
