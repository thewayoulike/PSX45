/** Stable id for a mutual fund row (AMC + fund + category disambiguates VPS variants). */
export function makeFundId(amc: string, fundName: string, category?: string): string {
  const parts = [amc, fundName, category].filter(Boolean).join('-');
  const slug = parts
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return `MF:${slug}`;
}

export function isFundTicker(ticker: string): boolean {
  return (ticker || '').startsWith('MF:');
}

export function fundLabelFromTicker(ticker: string, fundName?: string): string {
  if (fundName) return fundName;
  if (!isFundTicker(ticker)) return ticker;
  return ticker
    .slice(3)
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
