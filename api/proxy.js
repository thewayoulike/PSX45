// api/proxy.js
export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const fetchOptions = {
      method: req.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
      }
    };

    // If it's a POST request (like the chart3 API), attach the body
    if (req.method === 'POST') {
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(decodeURIComponent(url), fetchOptions);

    if (!response.ok) {
      throw new Error(`Status: ${response.status}`);
    }

    const data = await response.text();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=60'); 
    
    return res.status(200).send(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
