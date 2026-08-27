import https from 'https';

https.get('https://dps.psx.com.pk/company/OGDC', (res) => {
  let d = '';
  res.on('data', (c) => { d += c; });
  res.on('end', () => {
    const m = d.match(/id="payouts"[\s\S]*?(?=id="reports"|id="financials"|$)/i);
    if (m) {
      const chunk = m[0].slice(0, 4000);
      console.log(chunk.replace(/\s+/g, ' ').slice(0, 2000));
    }
    // equity section for dividend yield?
    const eq = d.match(/id="equity"[\s\S]*?(?=id="|$)/i);
    if (eq) console.log('\nEQUITY', eq[0].replace(/\s+/g, ' ').slice(0, 800));
  });
});
