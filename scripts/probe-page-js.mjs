import https from 'https';

https.get('https://dps.psx.com.pk/company/OGDC', (res) => {
  let d = '';
  res.on('data', (c) => { d += c; });
  res.on('end', () => {
    for (const kw of ['payout', 'dividend', 'Payout', 'Dividend', '/historical', 'fetch(', 'axios', 'XMLHttpRequest']) {
      const re = new RegExp(kw, 'gi');
      let m, n = 0;
      while ((m = re.exec(d)) && n < 3) {
        console.log(kw, d.slice(Math.max(0, m.index - 40), m.index + 80).replace(/\s+/g, ' '));
        n++;
      }
    }
    const scripts = [...d.matchAll(/src="([^"]+)"/g)].map(m => m[1]).filter(s => s.includes('.js'));
    console.log('JS files:', scripts);
  });
});
