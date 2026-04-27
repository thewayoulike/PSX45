// api/proxy.js
export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    // Aftab Vercel Serverless Function fetching the data directly from PSX
    // This bypasses browser CORS entirely.
    const response = await fetch(decodeURIComponent(url), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/json,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    if (!response.ok) {
      throw new Error(`Status: ${response.status}`);
    }

    const data = await response.text();

    // Allow your frontend to read it
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Cache the response for 60 seconds to make it lightning fast
    res.setHeader('Cache-Control', 's-maxage=60'); 
    
    return res.status(200).send(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
