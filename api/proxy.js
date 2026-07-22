// Only allow proxying to trusted PSX hosts.
const ALLOWED_HOSTS = new Set([
  'dps.psx.com.pk',
  'www.psx.com.pk',
  'psx.com.pk'
]);

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
    const fetchOptions = {
      method: req.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
      }
    };

    if (req.method === 'POST') {
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const response = await fetch(target.toString(), fetchOptions);
    if (!response.ok) throw new Error(`Status: ${response.status}`);

    const data = await response.text();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=60');
    return res.status(200).send(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
