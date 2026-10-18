// Published benchmark observations, not live or exchange-traded futures quotes.
const SERIES = [
  { id: 'brent', series: 'DCOILBRENTEU', name: 'Brent crude', unit: 'USD / barrel', frequency: 'Daily', source: 'U.S. EIA via FRED' },
  { id: 'wti', series: 'DCOILWTICO', name: 'WTI crude', unit: 'USD / barrel', frequency: 'Daily', source: 'U.S. EIA via FRED' },
  { id: 'gas', series: 'DHHNGSP', name: 'Henry Hub natural gas', unit: 'USD / MMBtu', frequency: 'Daily', source: 'U.S. EIA via FRED' },
  { id: 'copper', series: 'PCOPPUSDM', name: 'Copper', unit: 'USD / metric tonne', frequency: 'Monthly', source: 'IMF via FRED' },
];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function classText(html, name) {
  for (const match of html.matchAll(/<span\b[^>]*\bclass=["']([^"']*)["'][^>]*>([^<]*)<\/span>/gi)) {
    if (match[1].split(/\s+/).includes(name)) return match[2].trim();
  }
  return '';
}
export function parseCommodityObservation(html, frequency) {
  const rawValue = classText(html, 'series-meta-observation-value');
  const rawDate = classText(html, 'series-meta-value').replace(/:$/, '').trim();
  const reportedFrequency = classText(html, 'series-meta-value-frequency');
  if (!/^-?\d[\d,]*(?:\.\d+)?$/.test(rawValue) || reportedFrequency !== frequency) throw new Error('Invalid commodity observation');
  const price = Number(rawValue.replace(/,/g, ''));
  let date = rawDate;
  if (frequency === 'Monthly') {
    const match = rawDate.match(/^([A-Z][a-z]{2}) (\d{4})$/);
    const month = match ? months.indexOf(match[1]) : -1;
    if (!match || month < 0) throw new Error('Invalid commodity period');
    date = `${match[2]}-${String(month + 1).padStart(2, '0')}`;
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new Error('Invalid commodity date');
  }
  if (!Number.isFinite(price)) throw new Error('Invalid commodity price');
  return { price, date };
}
export async function fetchCommodityBenchmarks() {
  const quotes = await Promise.all(SERIES.map(async spec => {
    const sourceUrl = `https://fred.stlouisfed.org/series/${spec.series}`;
    try {
      const response = await fetch(sourceUrl, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Source unavailable');
      return { ...spec, sourceUrl, ...parseCommodityObservation(await response.text(), spec.frequency) };
    } catch {
      return { ...spec, sourceUrl, price: null, date: null };
    }
  }));
  if (!quotes.some(quote => quote.price !== null)) throw new Error('Commodity reports unavailable');
  return { quotes };
}
