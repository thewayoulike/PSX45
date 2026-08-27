import https from 'https';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const h = await get('https://dps.psx.com.pk/company/OGDC');
for (const id of ['profile', 'equity', 'payouts']) {
  const m = h.match(new RegExp(`id="${id}"[\\s\\S]*?(?=id="(?:quote|profile|equity|announcements|financials|ratios|payouts|reports)"|$)`, 'i'));
  console.log('\n===', id, '===');
  console.log(strip(m?.[0] || 'missing').slice(0, 1200));
}
