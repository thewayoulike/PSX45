import https from 'https';

https.get('https://dps.psx.com.pk/company/OGDC', (res) => {
  let d = '';
  res.on('data', (c) => { d += c; });
  res.on('end', () => {
    const anchors = [...new Set([...d.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]))];
    console.log('anchors', anchors.join(', '));
    for (const kw of ['dividend', 'DIVIDEND', 'Business Description', 'EX-DIVIDEND', 'Annual Dividend', 'PAYOUT RATIO']) {
      console.log(kw, d.includes(kw) ? 'yes' : 'no');
    }
    const idx = d.indexOf('BUSINESS DESCRIPTION');
    if (idx >= 0) console.log('biz', d.slice(idx, idx + 600).replace(/\s+/g, ' ').slice(0, 400));
  });
});
