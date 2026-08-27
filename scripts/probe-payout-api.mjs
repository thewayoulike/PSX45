import https from 'https';

const paths = [
  '/company/OGDC/payouts',
  '/company/OGDC/dividends',
  '/payouts/OGDC',
  '/dividends/OGDC',
  '/api/company/OGDC/payouts',
  '/api/payouts/OGDC',
  '/company/payouts/OGDC',
  '/timeseries/payouts/OGDC',
];

function get(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => resolve({ status: res.statusCode, len: d.length, sample: d.slice(0, 200) }));
    }).on('error', (e) => resolve({ error: e.message }));
  });
}

for (const p of paths) {
  const r = await get('https://dps.psx.com.pk' + p);
  console.log(p, r);
}

// search main page JS for payout endpoints
const main = await get('https://dps.psx.com.pk/company/OGDC');
const html = main.sample + '...'; // need full
let full = '';
await new Promise((resolve) => {
  https.get('https://dps.psx.com.pk/company/OGDC', (res) => {
    res.on('data', (c) => { full += c; });
    res.on('end', resolve);
  });
});
const scripts = [...full.matchAll(/src="([^"]+\.js[^"]*)"/g)].map(m => m[1]);
console.log('scripts', scripts.slice(0, 5));
