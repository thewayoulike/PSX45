import https from 'https';

function get(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: opts.method || 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          ...(opts.headers || {}),
        },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => { d += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      }
    );
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

const script = await get('https://dps.psx.com.pk/static/script.js?v=1.75');
const hits = new Set();
for (const m of script.body.matchAll(/["'](\/[^"']{2,90})["']/g)) {
  const p = m[1];
  if (/payout|dividend|company|timeseries/i.test(p)) hits.add(p);
}
console.log('paths in script.js:\n', [...hits].sort().join('\n'));

const tries = [
  'https://dps.psx.com.pk/company/dividends/OGDC',
  'https://dps.psx.com.pk/dividend/OGDC',
  'https://dps.psx.com.pk/dividend-history/OGDC',
  'https://dps.psx.com.pk/company/dividend/OGDC',
  'https://dps.psx.com.pk/company/dividend-history/OGDC',
  'https://dps.psx.com.pk/timeseries/dividend/OGDC',
  'https://dps.psx.com.pk/timeseries/dividends/OGDC',
];
for (const url of tries) {
  const r = await get(url);
  const isJson = r.body.trim().startsWith('{') || r.body.trim().startsWith('[');
  console.log(url, r.status, isJson ? r.body.slice(0, 180) : `html ${r.body.length}`);
}

const postTries = [
  ['https://dps.psx.com.pk/dividends', 'symbol=OGDC'],
  ['https://dps.psx.com.pk/dividend-info', 'symbol=OGDC'],
  ['https://dps.psx.com.pk/company/dividends', 'symbol=OGDC'],
  ['https://dps.psx.com.pk/payouts', 'symbol=OGDC'],
];
for (const [url, body] of postTries) {
  const r = await get(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const isJson = r.body.trim().startsWith('{') || r.body.trim().startsWith('[');
  console.log('POST', url, r.status, isJson ? r.body.slice(0, 180) : `html ${r.body.length}`);
}
