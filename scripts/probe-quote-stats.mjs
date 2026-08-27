const h = await fetch('https://dps.psx.com.pk/company/OGDC', {
  headers: { 'User-Agent': 'Mozilla/5.0' },
}).then((r) => r.text());

const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

for (const id of ['quote', 'profile', 'equity']) {
  const m = h.match(new RegExp(`id="${id}"[\\s\\S]*?(?=id="(?:quote|profile|equity|announcements|financials|ratios|payouts|reports)"|$)`, 'i'));
  console.log('\n===', id, '===');
  console.log(strip(m?.[0] || '').slice(0, 1500));
}

const stats = [...h.matchAll(/stats_label[^>]*>([\s\S]*?)<\/div>\s*<div class="stats_value">([\s\S]*?)<\/div>/gi)];
console.log('\nALL STATS:');
stats.forEach((m) => console.log(strip(m[1]), '=>', strip(m[2])));
