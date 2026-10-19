const CURRENCIES = ['EUR', 'USD', 'JPY', 'GBP', 'CHF', 'AUD', 'CAD', 'NZD', 'CNY', 'PKR'];

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function parseFxSnapshot(raw, expectedDate) {
  if (!validDate(raw?.date) || (expectedDate && raw.date !== expectedDate) || raw?.usd?.usd !== 1) throw new Error('Invalid currency snapshot');
  const rates = {};
  for (const code of CURRENCIES) {
    const value = raw.usd[code.toLowerCase()];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) rates[code] = value;
  }
  if (Object.keys(rates).length < 2) throw new Error('Currency rates unavailable');
  return { date: raw.date, rates };
}

export function fxComparisonDates(asOf) {
  if (!validDate(asOf)) throw new Error('Invalid currency date');
  const latest = new Date(`${asOf}T00:00:00Z`);
  const beforeDays = days => new Date(latest.getTime() - days * 86400000).toISOString().slice(0, 10);
  const beforeMonths = months => {
    const result = new Date(latest);
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() - months);
    const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(latest.getUTCDate(), lastDay));
    return result.toISOString().slice(0, 10);
  };
  return { '1D': beforeDays(1), '1W': beforeDays(7), '1M': beforeMonths(1), '1Y': beforeMonths(12) };
}

async function fetchSnapshot(date = 'latest') {
  // Both are documented public mirrors of the same dated dataset.
  const sources = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.min.json`,
    `https://${date}.currency-api.pages.dev/v1/currencies/usd.min.json`,
  ];
  for (const url of sources) {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6500) });
      if (!response.ok) continue;
      return parseFxSnapshot(await response.json(), date === 'latest' ? undefined : date);
    } catch { /* Try the matching-date mirror; never substitute today's rate for history. */ }
  }
  throw new Error('Currency snapshot unavailable');
}

export async function fetchForexHeatmap() {
  const current = await fetchSnapshot();
  const requestedDates = fxComparisonDates(current.date);
  const comparisons = Object.fromEntries(await Promise.all(Object.entries(requestedDates).map(async ([period, date]) =>
    [period, await fetchSnapshot(date).catch(() => null)])));
  return { current, comparisons, requestedDates };
}
